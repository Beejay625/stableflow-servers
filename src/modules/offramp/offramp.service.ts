import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { ethers } from 'ethers';
import { parseUnits, getAddress as viemGetAddress } from 'viem';

import { Transaction as WalletTransaction } from '../wallet/entities/transaction.entity';
import { Business } from '../business/entities/business.entity';
import { Transaction } from './interfaces/transaction.interface';
import { TransactionStatus } from '../wallet/constants/status.enum';
import { OrderStatusResponse, PublicKeyResponse } from './interfaces/response.interface';
import { WebhookPayload, WebhookEventType } from './interfaces/webhook.interface';
import { gatewayAbi, erc20Abi } from './abis/abi';
import { 
  fetchSupportedTokens, 
  getGatewayAddressForNetwork,
  customSmartContractWrite,
  customSmartContractRead,
  mapNetworkFromConfig,
  getTokenAddress,
  getTokenInfoByAddress,
  fetchAggregatorPublicKey,
  publicKeyEncrypt
} from './utils';
import { PrepareTransactionService } from './preparetransaction.service';
import { RedisService } from '../redis/redis.service';
import { WalletConfigService } from '../../common/utils/wallet-config';
import { WebhookHandler } from './handlers/webhook.handler';

/**
 * Service responsible for handling cryptocurrency off-ramping operations.
 * Manages the process of converting cryptocurrencies to fiat currencies through:
 * 1. Direct token approvals and order creation
 * 2. Webhook-based transaction status updates
 * 3. Periodic verification of transaction states
 * 
 * The service follows a "database as source of truth" approach, eliminating
 * the need for Redis locks and complex worker coordination.
 */
@Injectable()
export class OfframpService {
  private readonly logger = new Logger(OfframpService.name);
  private readonly aggregatorUrl: string;
  private readonly ngnProviderId: string;
  private readonly kesProviderId: string;
  private readonly provider: ethers.JsonRpcProvider;
  private readonly walletId: string;
  private readonly apiKey: string;
  private readonly network: string;

  // Redis key for tracking transactions needing manual review
  private readonly REDIS_MANUAL_REVIEW = 'offramp:manual_review';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly prepareTransactionService: PrepareTransactionService,
    private readonly redisService: RedisService,
    private readonly walletConfigService: WalletConfigService,
    private readonly webhookHandler: WebhookHandler
  ) {
    this.aggregatorUrl = this.configService.get<string>('paycrest.baseUrl');
    this.ngnProviderId = this.configService.get<string>('NGN_PROVIDER_ID');
    this.kesProviderId = this.configService.get<string>('KES_PROVIDER_ID');
    this.walletId = this.configService.get<string>('blockradar.walletId');
    this.apiKey = this.configService.get<string>('paycrest.apiKey');
    
    // Get the network configuration and map it to the appropriate network name
    const configNetwork = this.configService.get<string>('blockradar.network');
    this.network = mapNetworkFromConfig(configNetwork);
    
    // Initialize provider using the getProvider method
    this.provider = this.getProvider();
    
    this.logger.log(`Initialized OfframpService with network: ${this.network}`);

    // Get IDs from environment variables
    // this.addressId = this.configService.get<string>('blockradar.addressId');
  }

  /**
   * Gets the appropriate blockchain provider based on the network
   * 
   * @param network - The network to get a provider for
   * @returns ethers.JsonRpcProvider - A provider configured for the specified network
   */
  private getProvider(network?: string): ethers.JsonRpcProvider {
    // Use provided network or default to service network
    const targetNetwork = network || this.network;
    let rpcUrl: string;
    
    // Determine the appropriate RPC URL based on the network
    if (targetNetwork.includes('Base')) {
      rpcUrl = this.configService.get<string>('BASE_RPC_URL');
      this.logger.log(`Using Base RPC URL for network ${targetNetwork}`);
    } else if (targetNetwork.includes('BNB')) {
      rpcUrl = this.configService.get<string>('BNB_RPC_URL');
      this.logger.log(`Using BNB RPC URL for network ${targetNetwork}`);
    } else {
      // Default to BASE_RPC_URL if no specific match
      rpcUrl = this.configService.get<string>('BASE_RPC_URL');
      this.logger.log(`Using default RPC URL for network ${targetNetwork}`);
    }
    
    if (!rpcUrl) {
      this.logger.warn(`No RPC URL configured for network ${targetNetwork}, using default provider`);
      // Return a default provider if no RPC URL is configured
      return new ethers.JsonRpcProvider('https://rpc.ankr.com/base');
    }
    
    return new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Creates an offramp order for converting cryptocurrency to fiat.
   * 
   * Direct Processing Flow:
   * 1. Prepares transaction data with recipient details
   * 2. Validates transaction data and network support
   * 3. Approves token spending (ERC20 approve)
   * 4. Creates the order on the gateway contract
   * 
   * @param transactionId - The ID of the transaction to process
   * @returns Promise<string> - Transaction hash of the created order
   * @throws Error if transaction data is invalid or network unsupported
   */
  async createOrder(transactionId: string): Promise<string> {
    try {
      this.logger.log(`Creating offramp order for transaction: ${transactionId}`);

      // Get prepared transaction data
      const transaction = await this.prepareTransactionService.prepareTransactionForOfframp(transactionId);
      
      // Use the network from the prepared transaction
      const transactionNetwork = transaction.network;

      // Get the gateway address for the transaction's network
      const gatewayAddress = getGatewayAddressForNetwork(transactionNetwork);
      
      // Fetch supported tokens for the transaction's network
      const supportedTokens = fetchSupportedTokens(transactionNetwork);
      if (!supportedTokens) {
        const errorMsg = `Unsupported network: ${transactionNetwork}`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Get wallet config for the transaction based on blockchain and token
      const walletConfig = this.walletConfigService.getWalletConfigForTransaction({
        blockchainName: transaction.chain,
        tokenSymbol: transaction.tokenSymbol,
        walletId: transaction.walletId
      });
      
      // Ensure we have a valid addressId
      if (!transaction.addressId) {
        this.logger.error(`Missing addressId for transaction ${transactionId}`);
        throw new Error(`Missing addressId for transaction ${transactionId}`);
      }

      // Step 1: Approve token spending and get transaction hash
      this.logger.log(`Approving token spending for transaction: ${transactionId}`);
      const approvalTx = await this.approveTokenSpending({
        tokenAddress: transaction.tokenAddress,
        spenderAddress: gatewayAddress,
        amount: transaction.amount.toString(),
        ownerAddress: transaction.senderAddress,
        walletConfig,
        addressId: transaction.addressId
      });
      
      this.logger.log(`Token approval completed: ${approvalTx.txId || 'existing-allowance'}`);

      // Step 2: Wait for approval to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Prepare recipient data
      const recipient = {
        accountIdentifier: transaction.accountIdentifier,
        accountName: transaction.recipientName,
        institution: transaction.institution,
        providerId: transaction.currency === 'NGN' ? this.ngnProviderId : this.kesProviderId,
        memo: transaction.memo || '',
      };

      // Step 4: Encrypt recipient data using aggregator's public key
      const publicKey = await fetchAggregatorPublicKey(this.aggregatorUrl);
      const encryptedRecipient = publicKeyEncrypt(recipient, publicKey.data);

      // Step 5: Create the order
      this.logger.log(`Creating gateway order for transaction: ${transactionId}`);
      
      // Validate token information is available
      if (!transaction.tokenDecimals) {
        throw new Error(`Missing token decimal information for ${transaction.token}`);
      }
      
      // Convert the amount to proper token units
      let amountInTokenUnits: string;
      try {
        amountInTokenUnits = parseUnits(transaction.amount.toString(), transaction.tokenDecimals || 6).toString();
      } catch (conversionError) {
        this.logger.error(`Error converting amount to token units: ${conversionError.message}`);
        throw new Error(`Failed to convert amount: ${conversionError.message}`);
      }
      
      // Validate the rate from the transaction
      if (!transaction.rate || transaction.rate <= 0) {
        throw new Error(`Invalid rate: ${transaction.rate}. Rate must be greater than 0.`);
      }
      
      const rate = transaction.rate.toString();
      
      // Helper function to normalize addresses
      const getAddress = (address: string): string => {
        if (!address) {
          throw new Error('Invalid address: address is empty');
        }
        
        try {
          return viemGetAddress(address);
        } catch (error) {
          this.logger.error(`Error normalizing address: ${error.message}`);
          throw new Error(`Invalid address format: ${address}`);
        }
      };
      
      // Set fee recipient and fee amount
      const senderFeeRecipient = getAddress("0x0000000000000000000000000000000000000000"); // Zero address
      const senderFee = "0"; // No fee
      
      try {
        const txResponse = await customSmartContractWrite({
          walletId: walletConfig.walletId,
          addressId: transaction.addressId,
          apiKey: walletConfig.apiKey,
          abi: gatewayAbi as unknown as object[],
          address: gatewayAddress,
          method: "createOrder",
          parameters: [
            transaction.tokenAddress,
            amountInTokenUnits,
            rate,
            senderFeeRecipient,
            senderFee,
            transaction.refundAddress,
            encryptedRecipient
          ],
        });
        
        // Extract transaction ID from response
        const txId = txResponse?.data?.id;
        
        this.logger.log(`Order created successfully for transaction ${transactionId}, txId: ${txId || 'pending-tx'}`);
        return txId || 'pending-tx';
      } catch (error) {
        this.logger.error(`Order creation failed for transaction ${transactionId}: ${error.message}`);
        throw error;
      }
    } catch (error) {
      this.logger.error(`Error creating offramp order for transaction ${transactionId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Updates a transaction with the blockchain hash in its metadata
   * Called after successful order creation
   * 
   * @param transactionId ID of the transaction to update
   * @param txHash Blockchain transaction hash
   */
  private async updateTransactionWithHash(transactionId: string, txHash: string): Promise<void> {
    try {
      const transaction = await this.transactionRepository.findOne({ 
        where: { transactionId } 
      });
      
      if (!transaction) {
        this.logger.warn(`Cannot update transaction ${transactionId} with hash - not found`);
        return;
      }
      
      // Get current metadata or initialize if not exists
      const metadata = {
        ...(transaction.metadata || {}),
        offramp: {
          ...(transaction.metadata?.offramp || {}),
          txHash,
          blockchainAttempted: true,
          blockchainAttemptTime: new Date().toISOString()
        }
      };
      
      // Update the transaction
      await this.transactionRepository.update(
        { id: transaction.id },
        { metadata }
      );
      
      this.logger.log(`Updated transaction ${transactionId} with hash ${txHash}`);
    } catch (error) {
      this.logger.error(`Error updating transaction with hash: ${error.message}`, error.stack);
    }
  }

  /**
   * Retrieves the order ID from a transaction using multiple fallback methods.
   * 
   * Fallback Strategy:
   * 1. Attempts to fetch from API (faster, preferred method)
   * 2. Falls back to blockchain logs if API fails
   * 3. Parses OrderCreated events to find matching sender and token
   * 
   * @param txHash - Transaction hash to search for
   * @param senderAddress - Address that initiated the transaction
   * @param tokenAddress - Token contract address used in transaction
   * @param network - Optional network to use (overrides this.network)
   * @returns Promise<string> - Order ID associated with the transaction
   * @throws Error if order ID cannot be found through any method
   */
  async getOrderIdFromTransaction(
    txHash: string, 
    senderAddress: string, 
    tokenAddress: string,
    network?: string
  ): Promise<string> {
    try {
      this.logger.log(`Fetching order ID for transaction: ${txHash}`);
      
      // Use provided network or fallback to default
      const useNetwork = network || this.network;
      this.logger.log(`Using network ${useNetwork} for order ID retrieval`);
      
      // Get gateway address for the specified network
      const gatewayAddress = getGatewayAddressForNetwork(useNetwork);
      if (!gatewayAddress) {
        throw new Error(`Gateway address not found for network ${useNetwork}`);
      }
      
      // Method 1: Try getting the order ID from the API first
      try {
        const response = await axios.get(
          `${this.aggregatorUrl}/transactions/${txHash}/order`,
          {
            params: {
              sender: senderAddress, 
              token: tokenAddress
            }
          }
        );
        
        if (response.data.status === 'success' && response.data.data.orderId) {
          this.logger.log(`Order ID obtained from API: ${response.data.data.orderId}`);
          return response.data.data.orderId;
        }
      } catch (apiError) {
        this.logger.warn(`API method failed, falling back to blockchain logs: ${apiError.message}`);
        // Continue to Method 2 if API fails
      }
      
      // Method 2: Get the order ID from transaction logs directly
      // Use a network-specific provider
      const provider = this.getProvider(useNetwork);
      
      // Wait for the transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }
      
      // Parse logs using gateway ABI to find OrderCreated event
      const gatewayInterface = new ethers.Interface(gatewayAbi);
      
      // Find the OrderCreated event
      for (const log of receipt.logs) {
        try {
          // Check if the log is from our gateway contract
          if (log.address.toLowerCase() === gatewayAddress.toLowerCase()) {
            const parsedLog = gatewayInterface.parseLog({
              topics: log.topics,
              data: log.data,
            });
            
            // Check if it's the OrderCreated event
            if (parsedLog && parsedLog.name === 'OrderCreated') {
              const { sender, token, orderId } = parsedLog.args;
              
              // Verify sender and token match to ensure we have the right event
              if (
                sender.toLowerCase() === senderAddress.toLowerCase() &&
                token.toLowerCase() === tokenAddress.toLowerCase()
              ) {
                this.logger.log(`Order ID obtained from blockchain logs: ${orderId}`);
                return orderId;
              }
            }
          }
        } catch (parseError) {
          // This log is not from our contract or not the event we're looking for
          continue;
        }
      }
      
      throw new Error('OrderCreated event not found in transaction logs');
    } catch (error) {
      this.logger.error(`Error getting order ID: ${error.message}`, error.stack);
      throw new Error(`Failed to get order ID: ${error.message}`);
    }
  }

  /**
   * Retrieves the current status of an offramp order.
   * 
   * Status Workflow:
   * 1. Order Created -> Pending
   * 2. Processing -> In progress
   * 3. Completed/Failed -> Final status
   * 
   * @param orderId - Unique identifier of the order
   * @returns Promise<OrderStatusResponse> - Current status and details
   * @throws Error if status cannot be fetched
   */
  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    try {
      const response = await axios.get<OrderStatusResponse>(
        `${this.aggregatorUrl}/orders/8453/${orderId}`, // 8453 is the chain id for Base
      );
      
      if (response.data.status !== 'success') {
        throw new Error(`Failed to fetch order status: ${response.data.message}`);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `API error fetching order status: ${error.message}`,
          error.response?.data
        );
        throw new Error(`Failed to fetch order status: ${error.message} - ${JSON.stringify(error.response?.data)}`);
      }
      
      this.logger.error(`Error fetching order status: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch order status: ${error.message}`);
    }
  }
  
  /**
   * Maps payment order status from webhook to internal transaction status
   * Flow:
   * 1. UNSETTLED -> PROCESSING (when worker picks up)
   * 2. PROCESSING -> SETTLED (when payment completed)
   * 3. PROCESSING -> STALLED (when expired, temporary)
   * 4. STALLED -> REFUNDED (when refund completes)
   */
  mapOrderStatusToTransactionStatus(orderStatus: string): TransactionStatus {
    switch (orderStatus.toLowerCase()) {
      case 'pending':
        // Order is being processed, contract write in progress
        return TransactionStatus.PROCESSING;
      
      case 'settled':
        // Fiat sent successfully and contract written
        return TransactionStatus.SETTLED;
      
      case 'expired':
        // Payment window expired, will trigger refund
        return TransactionStatus.STALLED;
      
      case 'refunded':
        // Refund completed after expiry
        return TransactionStatus.REFUNDED;
      
      default:
        // For any unknown status, keep as processing for safety
        this.logger.warn(`Unknown order status received: ${orderStatus}`);
        return TransactionStatus.PROCESSING;
    }
  }

  /**
   * Process for creating and tracking an order end-to-end
   * Handles the entire offramp flow directly without queues
   * 
   * @param transaction Transaction to process
   * @returns Object containing transaction hash and status
   */
  async processOrder(transaction: Transaction): Promise<{
    txHash: string;
    orderId?: string;
    status: TransactionStatus;
  }> {
    try {
      this.logger.log(`Starting to process offramp order for transaction ${transaction.id}`);

      // Step 1: Create the order and get transaction hash
      let txHash: string;
      try {
        this.logger.log(`Calling createOrder for transaction ${transaction.id}`);
        txHash = await this.createOrder(transaction.id);
        this.logger.log(`Order successfully created with txHash: ${txHash} for transaction ${transaction.id}`);
        
        // Update transaction with hash information but keep as UNSETTLED
        // Real status update will come from webhook
        this.logger.log(`Fetching transaction data to update metadata for ${transaction.id}`);
        const existingTransaction = await this.transactionRepository.findOne({ where: { id: transaction.id } });
        
        if (existingTransaction) {
            // Get current metadata or initialize if not exists
            const currentMetadata = existingTransaction?.metadata || {};
            
            // Merge with new metadata
            const updatedMetadata = {
              ...currentMetadata,
              offramp: {
                ...(currentMetadata.offramp || {}),
                txHash,
                blockchainAttempted: true,
                blockchainAttemptTime: new Date().toISOString()
              }
            };
            
            // Update the transaction
          this.logger.log(`Updating transaction ${transaction.id} with blockchain metadata, txHash: ${txHash}`);
          await this.transactionRepository.update(
              { id: transaction.id },
              { metadata: updatedMetadata }
            );
          this.logger.log(`Successfully updated transaction ${transaction.id} metadata with txHash`);
        } else {
          this.logger.warn(`Transaction ${transaction.id} not found for metadata update`);
        }
        
        this.logger.log(`Order processing complete for transaction ${transaction.id}, returning UNSETTLED status`);
        return {
          txHash,
          status: TransactionStatus.UNSETTLED
        };
      } catch (error) {
        // This will be logged but not retried automatically - state remains UNSETTLED
        // and will be picked up by checkStalledTransactions cron job
        this.logger.error(`Error creating order for transaction ${transaction.id}: ${error.message}`, error.stack);
        
        // Update transaction metadata to record the error
        this.logger.log(`Updating transaction ${transaction.id} with error metadata`);
        const existingTransaction = await this.transactionRepository.findOne({ where: { id: transaction.id } });
        
        if (existingTransaction) {
          const currentMetadata = existingTransaction.metadata || {};
          const updatedMetadata = {
            ...currentMetadata,
            offramp: {
              ...(currentMetadata.offramp || {}),
              errors: [
                ...(currentMetadata.offramp?.errors || []),
                {
                  time: new Date().toISOString(),
                  message: error.message,
                  stack: error.stack
                }
              ]
            }
          };
          
          await this.transactionRepository.update(
            { id: transaction.id },
            { metadata: updatedMetadata }
          );
          this.logger.log(`Successfully updated error information for transaction ${transaction.id}`);
        } else {
          this.logger.warn(`Transaction ${transaction.id} not found for error update`);
        }
        
        this.logger.log(`Order processing failed for transaction ${transaction.id}, returning error state`);
        return {
          txHash: 'error',
          status: TransactionStatus.UNSETTLED
        };
      }
    } catch (error) {
      this.logger.error(`Unexpected error in processOrder for transaction ${transaction.id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handles webhook events from the offramp provider by delegating to WebhookHandler
   * This method exists for backward compatibility and delegates to the dedicated handler
   * 
   * @param payload The webhook payload from the offramp provider
   */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const { event, data } = payload;
    const orderId = data.id;
    
    this.logger.log(`Delegating webhook event: ${event} for order: ${orderId} to WebhookHandler`);
    
    // Delegate to the dedicated WebhookHandler
    try {
      await this.webhookHandler.handleWebhook(payload);
      this.logger.log(`WebhookHandler successfully processed webhook for order: ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in WebhookHandler processing webhook for order ${orderId}: ${error.message}`, error.stack);
      // Error already logged by WebhookHandler, no need to take additional action
    }
  }
  
  /**
   * Approves token spending for the offramp process
   * 
   * Steps:
   * 1. Check existing allowance
   * 2. If allowance is insufficient, create approve transaction
   * 
   * @param tokenAddress - Token contract address
   * @param spenderAddress - Address to approve (gateway contract)
   * @param amount - Amount to approve
   * @param ownerAddress - Token owner address
   * @param walletConfig - Wallet configuration
   * @param addressId - Address ID for the operation
   * @returns Approval transaction hash
   */
  async approveTokenSpending({
    tokenAddress,
    spenderAddress,
    amount,
    ownerAddress,
    walletConfig,
    addressId
  }: {
    tokenAddress: string;
    spenderAddress: string;
    amount: string;
    ownerAddress: string;
    walletConfig: { walletId: string; apiKey: string; walletName: string; };
    addressId?: string;
  }): Promise<any> {
    this.logger.log(`Starting token approval for ${tokenAddress}`);
    this.logger.log(`Approval parameters: spender=${spenderAddress}, amount=${amount}, owner=${ownerAddress}`);
    
    // Validate addressId is provided and valid
    if (!addressId) {
      this.logger.error('Missing addressId for token approval. This is required for blockchain operations.');
      throw new Error('Missing addressId for token approval');
    }
    
    this.logger.log(`Using addressId for approval: ${addressId}`);
    
    try {
      // Check existing allowance first
      this.logger.log(`Checking existing allowance for token ${tokenAddress}`);
      const currentAllowance = await this.checkAllowance(
        tokenAddress,
        ownerAddress,
        spenderAddress,
        walletConfig,
        addressId
      );
      
      this.logger.log(`Current allowance for token ${tokenAddress}: ${currentAllowance}`);

      // Check token balance
      this.logger.log(`Checking token balance for address ${ownerAddress}`);
      const balanceResponse = await customSmartContractRead({
        walletId: walletConfig.walletId,
        addressId,
        apiKey: walletConfig.apiKey,
        abi: erc20Abi as unknown as object[],
        address: tokenAddress,
        method: 'balanceOf',
        parameters: [ownerAddress],
      });

      // Log the complete raw balance response
      this.logger.log(`Raw balance response: ${JSON.stringify(balanceResponse)}`);
      
      // Access data property directly from the response instead of result[0]
      const currentBalance = balanceResponse?.data || '0';
      this.logger.log(`Current token balance: ${currentBalance}`);
      
      // Get token information to determine decimal places
      const tokenInfo = getTokenInfoByAddress(tokenAddress);
      if (!tokenInfo) {
        throw new Error(`Token information not found for address ${tokenAddress}`);
      }
      
      const decimals = tokenInfo.decimals;
      this.logger.log(`Using token decimals: ${decimals} for ${tokenAddress} (${tokenInfo.symbol})`);
      
      // Convert the amount string to a token unit format
      let amountInTokenUnits: string;
      try {
        amountInTokenUnits = parseUnits(amount, decimals).toString();
        this.logger.log(`Amount converted using parseUnits: ${amount} => ${amountInTokenUnits}`);
      } catch (conversionError) {
        this.logger.error(`Error converting amount to token units: ${conversionError.message}`);
        throw new Error(`Failed to convert amount: ${conversionError.message}`);
      }
      
      // Check if balance is sufficient
      const balanceBigInt = BigInt(currentBalance);
      const requiredAmountBigInt = BigInt(amountInTokenUnits);
      
      if (balanceBigInt < requiredAmountBigInt) {
        this.logger.error(`Insufficient balance. Required: ${amountInTokenUnits}, Available: ${currentBalance}`);
        throw new Error(`Insufficient token balance. Required: ${amount} ${tokenInfo.symbol}, Available: ${currentBalance}`);
      }
      
      // Check if current allowance is already enough
      const currentAllowanceBigInt = BigInt(currentAllowance);
      
      if (currentAllowanceBigInt >= requiredAmountBigInt) {
        this.logger.log(`Existing allowance is sufficient. Required: ${amountInTokenUnits}, Allowance: ${currentAllowance}`);
        return { txId: 'existing-allowance' };
      }
      
      // If allowance is insufficient but balance is okay, proceed with approval
      this.logger.log(`Existing allowance is insufficient, creating approval transaction`);
      this.logger.log(`Required amount: ${amountInTokenUnits}, Current allowance: ${currentAllowance}`);
      
      // Use the exact amount needed for the transaction
      const approvalAmount = amountInTokenUnits;
      this.logger.log(`Using exact amount for approval: ${approvalAmount}`);
      
      const txResponse = await customSmartContractWrite({
        walletId: walletConfig.walletId,
        addressId,
        apiKey: walletConfig.apiKey,
        abi: erc20Abi as unknown as object[],
        address: tokenAddress,
        method: 'approve',
        parameters: [spenderAddress, approvalAmount],
      });
      
      // Log the complete response for debugging
      this.logger.log(`Raw approval response: ${JSON.stringify(txResponse)}`);
      
      // Extract transaction ID from response
      const txId = txResponse?.data?.id;
      
      this.logger.log(`Token approval successful for exact amount ${approvalAmount}, txId: ${txId}`);
      
      // Return a consistent response format
      return { txId: txId || 'pending-tx' };
    } catch (error) {
      this.logger.error(`Error approving token spending: ${error.message}`, error.stack);
      
      // Handle error response data if it exists
      if (error.message && error.message.includes('API error')) {
        // Log more details to help with debugging
        this.logger.error(`API error details: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Checks the current allowance for a token
   * 
   * @param tokenAddress - Token contract address
   * @param ownerAddress - Address of the token owner
   * @param spenderAddress - Address to check allowance for
   * @param walletConfig - Wallet configuration
   * @param addressId - Address ID for the operation
   * @returns The current allowance as a string
   */
  private async checkAllowance(
    tokenAddress: string, 
    ownerAddress: string, 
    spenderAddress: string,
    walletConfig: { walletId: string; apiKey: string; walletName: string; },
    addressId?: string
  ): Promise<string> {
    // Validate addressId is provided and valid
    if (!addressId) {
      this.logger.error('Missing addressId for allowance check. This is required for blockchain operations.');
      throw new Error('Missing addressId for allowance check');
    }
    
    this.logger.log(`Checking token allowance: token=${tokenAddress}, owner=${ownerAddress}, spender=${spenderAddress}`);
    this.logger.log(`Using walletId=${walletConfig.walletId}, addressId=${addressId}`);
    this.logger.log(`API Key available: ${!!walletConfig.apiKey}`);
    this.logger.log(`Using API Key: ${walletConfig.apiKey ? walletConfig.apiKey.substring(0, 6) + '...' : 'undefined'}`);
    
    try {
      const response = await customSmartContractRead({
        walletId: walletConfig.walletId,
        addressId,
        apiKey: walletConfig.apiKey,
        abi: erc20Abi as unknown as object[],
        address: tokenAddress,
        method: 'allowance',
        parameters: [ownerAddress, spenderAddress],
      });
      
      // Log the complete raw allowance response
      this.logger.log(`Raw allowance response: ${JSON.stringify(response)}`);
      
      // Extract allowance value from response - fix to use data property
      const allowance = response?.data || '0';
      this.logger.log(`Current allowance: ${allowance}`);
      return allowance;
    } catch (error) {
      this.logger.error(`Error checking token allowance: ${error.message}`, error.stack);
      
      // Handle error response data if it exists
      if (error.message && error.message.includes('API error')) {
        this.logger.error(`API error details: ${error.message}`);
      }
      
      throw error;
    }
  }
} 