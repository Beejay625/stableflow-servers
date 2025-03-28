import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { ethers } from 'ethers';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  getTokenInfoByAddress
} from './utils';
import { PrepareTransactionService } from './preparetransaction.service';
import { RedisService } from '../redis/redis.service';
import { WalletConfigService } from '../../common/utils/wallet-config';

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
    private readonly walletConfigService: WalletConfigService
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
      this.logger.log(`[DEBUG] Using Base RPC URL for network ${targetNetwork}`);
    } else if (targetNetwork.includes('BNB')) {
      rpcUrl = this.configService.get<string>('BNB_RPC_URL');
      this.logger.log(`[DEBUG] Using BNB RPC URL for network ${targetNetwork}`);
    } else {
      // Default to BASE_RPC_URL if no specific match
      rpcUrl = this.configService.get<string>('BASE_RPC_URL');
      this.logger.log(`[DEBUG] Using default RPC URL for network ${targetNetwork}`);
    }
    
    if (!rpcUrl) {
      this.logger.warn(`[DEBUG] No RPC URL configured for network ${targetNetwork}, using default provider`);
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
      this.logger.log(`[DEBUG] createOrder started for transaction: ${transactionId}`);

      // Get prepared transaction data
      this.logger.log(`[DEBUG] Preparing transaction data for offramp, transactionId: ${transactionId}`);
      const transaction = await this.prepareTransactionService.prepareTransactionForOfframp(transactionId);
      this.logger.log(`[DEBUG] Transaction data prepared successfully, tokenAddress: ${transaction.tokenAddress}, amount: ${transaction.amount}`);
      this.logger.log(`[DEBUG] Prepared transaction details: token=${transaction.token}, decimals=${transaction.tokenDecimals}, rate=${transaction.rate}`);

      // Use the network from the prepared transaction, this will respect the transaction's chain
      const transactionNetwork = transaction.network;
      this.logger.log(`[DEBUG] Using transaction-specific network: ${transactionNetwork}`);

      // Get the gateway address for the transaction's network
      const gatewayAddress = getGatewayAddressForNetwork(transactionNetwork);
      this.logger.log(`[DEBUG] Using gateway address ${gatewayAddress} for network ${transactionNetwork}`);
      
      // Fetch supported tokens for the transaction's network
      this.logger.log(`[DEBUG] Fetching supported tokens for network ${transactionNetwork}`);
      const supportedTokens = fetchSupportedTokens(transactionNetwork);
      if (!supportedTokens) {
        const errorMsg = `Unsupported network: ${transactionNetwork}`;
        this.logger.error(`[DEBUG] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      this.logger.log(`[DEBUG] Network ${transactionNetwork} is supported with ${supportedTokens.length} tokens`);

      // Get wallet config for the transaction based on blockchain and token
      const walletConfig = this.walletConfigService.getWalletConfigForTransaction({
        blockchainName: transaction.chain,
        tokenSymbol: transaction.tokenSymbol,
        walletId: transaction.walletId
      });
      
      this.logger.log(`[DEBUG] Using wallet config: walletName=${walletConfig.walletName}, walletId=${walletConfig.walletId}`);
      
      // Ensure we have a valid addressId
      if (!transaction.addressId) {
        this.logger.error(`[DEBUG] Missing addressId for transaction ${transactionId}. This is required for blockchain operations.`);
        throw new Error(`Missing addressId for transaction ${transactionId}`);
      }
      
      this.logger.log(`[DEBUG] Using transaction addressId: ${transaction.addressId}`);

      // Step 1: Approve token spending and get transaction hash
      this.logger.log(`[DEBUG] Approving token spending for token: ${transaction.tokenAddress}, amount: ${transaction.amount.toString()}`);
      const approvalTx = await this.approveTokenSpending({
        tokenAddress: transaction.tokenAddress,
        spenderAddress: gatewayAddress,
        amount: transaction.amount.toString(),
        ownerAddress: transaction.senderAddress,
        walletConfig,
        addressId: transaction.addressId
      });
      
      // Log additional information about the addressId
      this.logger.log(`[DEBUG] Using transaction addressId: ${transaction.addressId} for token approval`);

      this.logger.log(`[DEBUG] Token approval transaction executed with hash: ${approvalTx.txHash}`);

      // Step 2: Wait for a short time to ensure the approval is processed
      this.logger.log(`[DEBUG] Waiting for token approval to be processed (2 seconds)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.logger.log(`[DEBUG] Waiting complete, proceeding to order creation`);

      // Step 3: Prepare recipient data
      this.logger.log(`[DEBUG] Preparing recipient data for transaction ${transactionId}`);
      const recipient = {
        accountIdentifier: transaction.accountIdentifier,
        accountName: transaction.recipientName,
        institution: transaction.institution,
        providerId: transaction.currency === 'NGN' ? this.ngnProviderId : this.kesProviderId,
        memo: transaction.memo || '',
      };
      this.logger.log(`[DEBUG] Recipient data prepared: institution=${transaction.institution}, currency=${transaction.currency}`);

      // Step 4: Encrypt recipient data using aggregator's public key
      this.logger.log(`[DEBUG] Fetching aggregator public key for transaction ${transactionId}`);
      const publicKey = await this.fetchAggregatorPublicKey();
      this.logger.log(`[DEBUG] Aggregator public key fetched successfully`);
      
      this.logger.log(`[DEBUG] Encrypting recipient data for transaction ${transactionId}`);
      const encryptedRecipient = this.publicKeyEncrypt(recipient, publicKey.data);
      this.logger.log(`[DEBUG] Recipient data encrypted successfully`);

      // Step 5: Create the order
      this.logger.log(`[DEBUG] Creating order on gateway contract for transaction ${transactionId}`);
      this.logger.log(`[DEBUG] Order parameters: token=${transaction.tokenAddress}, amount=${transaction.amount.toString()}, refundAddress=${transaction.refundAddress}`);
      this.logger.log(`[DEBUG] Using addressId=${transaction.addressId} for order creation`);
      
      // Validate token information is available
      if (!transaction.tokenDecimals) {
        throw new Error(`Missing token decimal information for ${transaction.token}`);
      }
      
      // Convert the amount to proper token units based on the token's decimals
      const amountStr = transaction.amount.toString();
      this.logger.log(`[DEBUG] Converting amount ${amountStr} using ${transaction.tokenDecimals} decimals for ${transaction.token}`);
      
      let amountInTokenUnits: string;
      try {
        // Use viem's parseUnits for reliable token amount conversion
        // Ensure we're using the correct number of decimals (6 for USDC)
        amountInTokenUnits = parseUnits(amountStr, transaction.tokenDecimals || 6).toString();
        this.logger.log(`[DEBUG] Amount converted using parseUnits: ${amountStr} => ${amountInTokenUnits}`);
      } catch (conversionError) {
        this.logger.error(`[DEBUG] Error converting amount to token units: ${conversionError.message}`);
        throw new Error(`Failed to convert amount: ${conversionError.message}`);
      }
      
      // Validate the rate from the transaction
      if (!transaction.rate || transaction.rate <= 0) {
        throw new Error(`Invalid rate: ${transaction.rate}. Rate must be greater than 0.`);
      }
      
      const rate = transaction.rate.toString();
      this.logger.log(`[DEBUG] Using rate from transaction: ${rate} basis points`);
      
      // Helper function to normalize addresses
      const getAddress = (address: string): string => {
        if (!address) {
          throw new Error('Invalid address: address is empty');
        }
        
        try {
          // Use viem's getAddress for reliable address normalization
          return viemGetAddress(address);
        } catch (error) {
          this.logger.error(`[DEBUG] Error normalizing address: ${error.message}`);
          throw new Error(`Invalid address format: ${address}`);
        }
      };
      
      // Set fee recipient and fee amount
      const senderFeeRecipient = getAddress("0x0000000000000000000000000000000000000000"); // Zero address
      const senderFee = "0"; // No fee
      
      // Log the exact parameters being passed to the contract in the correct order
      this.logger.log(`[DEBUG] Smart contract parameters in exact order: [
        token: ${transaction.tokenAddress}, 
        amount: ${amountInTokenUnits}, 
        rate: ${rate},
        senderFeeRecipient: ${senderFeeRecipient}, 
        senderFee: ${senderFee}, 
        refundAddress: ${transaction.refundAddress}, 
        messageHash: ${encryptedRecipient.substring(0, 20)}...]`);
      
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

      this.logger.log(`[DEBUG] Order creation transaction submitted successfully, txHash: ${txResponse.txHash}`);

      // Step 6: Update transaction with txHash in metadata
      this.logger.log(`[DEBUG] Updating transaction metadata with order creation hash: ${txResponse.txHash}`);
      await this.updateTransactionWithHash(transactionId, txResponse.txHash);
      this.logger.log(`[DEBUG] Transaction metadata updated with txHash`);

      this.logger.log(`[DEBUG] Offramp order creation completed for transactionId: ${transactionId}, txHash: ${txResponse.txHash}`);
      return txResponse.txHash;
    } catch (error) {
      this.logger.error(`[DEBUG] Error creating offramp order for transaction ${transactionId}: ${error.message}`, error.stack);
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
   * Fetches the aggregator's public key for encrypting sensitive recipient data.
   * The key is used to ensure recipient banking details are securely transmitted.
   * 
   * @returns Promise<PublicKeyResponse> - Contains the public key and status
   * @throws Error if unable to fetch or validate the public key
   */
  private async fetchAggregatorPublicKey(): Promise<PublicKeyResponse> {
    try {
      const response = await axios.get<PublicKeyResponse>(`${this.aggregatorUrl}/pubkey`);
      
      if (response.data.status !== 'success') {
        throw new Error(`Failed to fetch public key: ${response.data.message}`);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `API error fetching aggregator public key: ${error.message}`,
          error.response?.data
        );
        throw new Error(`Failed to fetch aggregator public key: ${error.message} - ${JSON.stringify(error.response?.data)}`);
      }
      
      this.logger.error(`Error fetching aggregator public key: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch aggregator public key: ${error.message}`);
    }
  }

  /**
   * Encrypts recipient data using RSA-OAEP padding for secure transmission.
   * 
   * Security Features:
   * - Uses RSA-OAEP padding (more secure than PKCS#1 v1.5)
   * - Converts data to JSON before encryption
   * - Returns Base64 encoded encrypted data
   * 
   * @param data - Recipient data to encrypt (account details, etc.)
   * @param publicKeyPEM - PEM formatted public key from aggregator
   * @returns string - Base64 encoded encrypted data
   * @throws Error if encryption fails
   */
  private publicKeyEncrypt(data: unknown, publicKeyPEM: string): string {
    try {
      const publicKey = crypto.createPublicKey(publicKeyPEM);
      const buffer = Buffer.from(JSON.stringify(data));
      
      // Using RSA-OAEP padding which is more secure than PKCS#1 v1.5
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        buffer
      );
      
      return encrypted.toString('base64');
    } catch (error) {
      this.logger.error(`Failed to encrypt data: ${error.message}`, error.stack);
      throw new Error(`Failed to encrypt data: ${error.message}`);
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
      this.logger.log(`[DEBUG] Starting to process offramp order for transaction ${transaction.id}`);

      // Step 1: Create the order and get transaction hash
      let txHash: string;
      try {
        this.logger.log(`[DEBUG] Calling createOrder for transaction ${transaction.id}`);
        txHash = await this.createOrder(transaction.id);
        this.logger.log(`[DEBUG] Order successfully created with txHash: ${txHash} for transaction ${transaction.id}`);
        
        // Update transaction with hash information but keep as UNSETTLED
        // Real status update will come from webhook
        this.logger.log(`[DEBUG] Fetching transaction data to update metadata for ${transaction.id}`);
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
          this.logger.log(`[DEBUG] Updating transaction ${transaction.id} with blockchain metadata, txHash: ${txHash}`);
          await this.transactionRepository.update(
              { id: transaction.id },
              { metadata: updatedMetadata }
            );
          this.logger.log(`[DEBUG] Successfully updated transaction ${transaction.id} metadata with txHash`);
        } else {
          this.logger.warn(`[DEBUG] Transaction ${transaction.id} not found for metadata update`);
        }
        
        this.logger.log(`[DEBUG] Order processing complete for transaction ${transaction.id}, returning UNSETTLED status`);
        return {
          txHash,
          status: TransactionStatus.UNSETTLED
        };
      } catch (error) {
        // This will be logged but not retried automatically - state remains UNSETTLED
        // and will be picked up by checkStalledTransactions cron job
        this.logger.error(`[DEBUG] Error creating order for transaction ${transaction.id}: ${error.message}`, error.stack);
        
        // Update transaction metadata to record the error
        this.logger.log(`[DEBUG] Updating transaction ${transaction.id} with error metadata`);
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
          this.logger.log(`[DEBUG] Successfully updated error information for transaction ${transaction.id}`);
        } else {
          this.logger.warn(`[DEBUG] Transaction ${transaction.id} not found for error update`);
        }
        
        this.logger.log(`[DEBUG] Order processing failed for transaction ${transaction.id}, returning error state`);
        return {
          txHash: 'error',
          status: TransactionStatus.UNSETTLED
        };
      }
    } catch (error) {
      this.logger.error(`[DEBUG] Unexpected error in processOrder for transaction ${transaction.id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handles webhook events from the offramp provider
   * 
   * @param payload The webhook payload from the offramp provider
   */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const { event, data } = payload;
    const orderId = data.id;
    
    this.logger.log(`Processing webhook event: ${event} for order: ${orderId}`);
    
    try {
        // Find the transaction by offramp order ID
        const transaction = await this.transactionRepository.findOne({
          where: { offrampOrderId: orderId }
        });
        
        // If no transaction found with this order ID, check if we have a transaction
      // that might match using the reference field
        if (!transaction) {
        this.logger.log(`No transaction found with orderId: ${orderId}, checking by reference`);
          
          // If we have reference, we might be able to match it with a transaction ID
          if (data.reference) {
            const transactionByRef = await this.transactionRepository.findOne({
              where: { transactionId: data.reference }
            });
            
            if (transactionByRef) {
              this.logger.log(`Found transaction by reference: ${data.reference}`);
              
              // Update the transaction with the order ID and process the webhook
              await this.transactionRepository.update(
                { id: transactionByRef.id },
                { offrampOrderId: orderId }
              );
              
              // Process the webhook for this transaction
              await this.processWebhookEvent(transactionByRef, event, data);
              return;
            }
          }
          
          // Still no match, log for manual review
          this.logger.warn(`No matching transaction found for webhook. Order ID: ${orderId}, Event: ${event}`);
          await this.addToManualReview(orderId, event, data, 'no_matching_transaction');
          return;
        }
        
        // Process the webhook event for the found transaction
        await this.processWebhookEvent(transaction, event, data);
    } catch (error) {
      this.logger.error(`Error processing webhook for order ${orderId}: ${error.message}`, error.stack);
      // Ensure we add to manual review if there's an error
      await this.addToManualReview(orderId, event, data, `error: ${error.message}`);
    }
  }
  
  /**
   * Processes a webhook event and updates the transaction status and metadata
   * 
   * @param transaction The transaction to update
   * @param event The webhook event type
   * @param data The webhook event data
   */
  private async processWebhookEvent(
    transaction: WalletTransaction,
    event: WebhookEventType,
    data: any
  ): Promise<void> {
    this.logger.log(`Processing ${event} for transaction: ${transaction.id}`);
    
    // Get current metadata or initialize if not exists
    const metadata = {
      ...(transaction.metadata || {}),
      offramp: {
        ...(transaction.metadata?.offramp || {}),
        lastWebhookStatus: event,
        lastWebhookTime: new Date().toISOString(),
        webhookHistory: [
          ...(transaction.metadata?.offramp?.webhookHistory || []),
          {
            status: event,
            timestamp: new Date().toISOString(),
            details: data
          }
        ]
      }
    };
    
    let newStatus: TransactionStatus;
    
    // Handle based on event type
    switch (event) {
      case WebhookEventType.PENDING:
        // Confirm transaction on blockchain and update to PROCESSING
        newStatus = TransactionStatus.PROCESSING;
        
        // Update metadata with order details
        metadata.offramp.orderId = data.id;
        metadata.offramp.contractWriteConfirmed = true;
        metadata.offramp.contractWriteTime = data.createdAt || new Date().toISOString();
        break;
        
      case WebhookEventType.SETTLED:
        // Final successful state - fiat sent
        newStatus = TransactionStatus.SETTLED;
        
        // Update metadata with settlement details
        metadata.offramp.settlementDetails = {
          amount: parseFloat(data.amountPaid || data.amount),
          rate: parseFloat(data.rate),
          completedAt: data.updatedAt || new Date().toISOString(),
          bankReference: data.reference,
          percentSettled: parseFloat(data.percentSettled || '100')
        };
        metadata.offramp.settledAt = data.updatedAt || new Date().toISOString();
        break;
        
      case WebhookEventType.EXPIRED:
        // Payment window expired, will trigger refund
        newStatus = TransactionStatus.STALLED;
        
        // Update metadata with expiry details
        metadata.offramp.expiryReason = data.reason || 'payment_window_expired';
        metadata.offramp.expiredAt = data.updatedAt || new Date().toISOString();
        break;
        
      case WebhookEventType.REFUNDED:
        // Final failure state - funds returned
        newStatus = TransactionStatus.REFUNDED;
        
        // Update metadata with refund details
        metadata.offramp.refundDetails = {
          amount: parseFloat(data.amountReturned || data.amount),
          completedAt: data.updatedAt || new Date().toISOString(),
          refundTxHash: data.txHash
        };
        metadata.offramp.refundedAt = data.updatedAt || new Date().toISOString();
        break;
        
      default:
        this.logger.warn(`Unknown event type: ${event}, keeping current status`);
        newStatus = transaction.status; // Keep current status
    }
    
    // Update the transaction status and metadata
    await this.transactionRepository.update(
      { id: transaction.id },
      {
        status: newStatus,
        metadata,
        processedAt: new Date()
      }
    );
    
    this.logger.log(`Updated transaction ${transaction.id} to status: ${newStatus}`);
  }
  
  /**
   * Add a transaction to the manual review queue
   * Keeps track of transactions that need manual intervention
   * 
   * @param orderId The order ID
   * @param event The event type
   * @param data The webhook data
   * @param reason The reason for manual review
   */
  async addToManualReview(
    orderId: string,
    event: string,
    data: any,
    reason: string
  ): Promise<void> {
    const client = this.redisService.getClient();
    const reviewId = `${orderId}-${Date.now()}`;
    
    await client.hset(
      this.REDIS_MANUAL_REVIEW,
      reviewId,
      JSON.stringify({
        orderId,
        event,
        data,
        reason,
        createdAt: new Date().toISOString(),
        status: 'pending_review'
      })
    );
    
    this.logger.log(`Added order ${orderId} to manual review queue: ${reason}`);
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
    this.logger.log(`[DEBUG] Starting token approval for ${tokenAddress}`);
    this.logger.log(`[DEBUG] Approval parameters: spender=${spenderAddress}, amount=${amount}, owner=${ownerAddress}`);
    
    // Validate addressId is provided and valid
    if (!addressId) {
      this.logger.error('[DEBUG] Missing addressId for token approval. This is required for blockchain operations.');
      throw new Error('Missing addressId for token approval');
    }
    
    this.logger.log(`[DEBUG] Using addressId for approval: ${addressId}`);
    
    try {
      // Check existing allowance first
      this.logger.log(`[DEBUG] Checking existing allowance for token ${tokenAddress}`);
      const currentAllowance = await this.checkAllowance(
        tokenAddress,
        ownerAddress,
        spenderAddress,
        walletConfig,
        addressId
      );
      
      this.logger.log(`[DEBUG] Current allowance for token ${tokenAddress}: ${currentAllowance}`);
      
      // Get token information to determine decimal places - with no fallback
      const tokenInfo = getTokenInfoByAddress(tokenAddress);
      if (!tokenInfo) {
        throw new Error(`Token information not found for address ${tokenAddress}`);
      }
      
      const decimals = tokenInfo.decimals;
      this.logger.log(`[DEBUG] Using token decimals: ${decimals} for ${tokenAddress} (${tokenInfo.symbol})`);
      
      // Convert the amount string to a token unit format
      let amountInTokenUnits: string;
      try {
        // Use viem's parseUnits for reliable token amount conversion
        amountInTokenUnits = parseUnits(amount, decimals).toString();
        this.logger.log(`[DEBUG] Amount converted using parseUnits: ${amount} => ${amountInTokenUnits}`);
      } catch (conversionError) {
        this.logger.error(`[DEBUG] Error converting amount to token units: ${conversionError.message}`);
        throw new Error(`Failed to convert amount: ${conversionError.message}`);
      }
      
      // Check if current allowance is already enough
      const currentAllowanceBigInt = BigInt(currentAllowance);
      const requiredAllowanceBigInt = BigInt(amountInTokenUnits);
      
      if (currentAllowanceBigInt >= requiredAllowanceBigInt) {
        this.logger.log(`[DEBUG] Existing allowance is sufficient, skipping approval transaction`);
        return { txHash: 'existing-allowance' };
      }
      
      // If allowance is insufficient, proceed with approval - use max uint256 value
      this.logger.log(`[DEBUG] Existing allowance is insufficient, creating approval transaction`);
      
      // Use maximum uint256 value for unlimited approval (standard practice)
      const maxApprovalAmount = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
      this.logger.log(`[DEBUG] Using max uint256 approval amount: ${maxApprovalAmount}`);
      
      const txResponse = await customSmartContractWrite({
        walletId: walletConfig.walletId,
        addressId,
        apiKey: walletConfig.apiKey,
        abi: erc20Abi as unknown as object[],
        address: tokenAddress,
        method: 'approve',
        parameters: [spenderAddress, maxApprovalAmount],
      });
      
      this.logger.log(`[DEBUG] Token approval successful, txHash: ${txResponse.txHash}`);
      return txResponse;
    } catch (error) {
      this.logger.error(`[DEBUG] Error approving token spending: ${error.message}`, error.stack);
      
      // Handle error response data if it exists
      if (error.message && error.message.includes('API error')) {
        // Log more details to help with debugging
        this.logger.error(`[DEBUG] API error details: ${error.message}`);
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
      this.logger.error('[DEBUG] Missing addressId for allowance check. This is required for blockchain operations.');
      throw new Error('Missing addressId for allowance check');
    }
    
    this.logger.log(`[DEBUG] Checking token allowance: token=${tokenAddress}, owner=${ownerAddress}, spender=${spenderAddress}`);
    this.logger.log(`[DEBUG] Using walletId=${walletConfig.walletId}, addressId=${addressId}`);
    this.logger.log(`[DEBUG] API Key available: ${!!walletConfig.apiKey}`);
    this.logger.log(`[DEBUG] Using API Key: ${walletConfig.apiKey ? walletConfig.apiKey.substring(0, 6) + '...' : 'undefined'}`);
    
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
      
      // Extract allowance value from response
      const allowance = response?.result?.[0] || '0';
      this.logger.log(`[DEBUG] Current allowance: ${allowance}`);
      return allowance;
    } catch (error) {
      this.logger.error(`[DEBUG] Error checking token allowance: ${error.message}`, error.stack);
      
      // Handle error response data if it exists
      if (error.message && error.message.includes('API error')) {
        this.logger.error(`[DEBUG] API error details: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Process a batch of unsettled transactions directly
   * This replaces the worker-based approach with direct processing
   * 
   * Includes connection timeout handling and retry logic for better reliability
   * 
   * @param batchSize Number of transactions to process in one batch
   */
  async processUnsettledTransactions(batchSize: number = 10): Promise<void> {
    try {
      this.logger.log(`[DEBUG] Starting unsettled transaction processing, batch size: ${batchSize}`);

      // Set a timeout for the entire operation
      const timeoutPromise = new Promise<WalletTransaction[]>((_, reject) => {
        setTimeout(() => reject(new Error('Database query timed out')), 10000);
      });

      // Find transactions to process with a timeout
      this.logger.log('[DEBUG] Querying database for UNSETTLED transactions');
      const transactionsPromise = this.transactionRepository.find({
        where: { 
          status: TransactionStatus.UNSETTLED,
          offrampOrderId: null // Ensure we don't reprocess ones already sent
        },
        take: batchSize,
        order: { receivedAt: 'ASC' } // Process oldest first
      });

      // Race the database query against a timeout
      const transactions = await Promise.race([transactionsPromise, timeoutPromise]);

      if (transactions.length === 0) {
        this.logger.log('[DEBUG] No UNSETTLED transactions to process');
        return;
      }

      this.logger.log(`[DEBUG] Found ${transactions.length} UNSETTLED transactions to process. IDs: ${transactions.map(t => t.id).join(', ')}`);

      // Process each transaction
      for (const transaction of transactions) {
        try {
          // Double-check transaction is still UNSETTLED with a timeout
          this.logger.log(`[DEBUG] Re-checking transaction ${transaction.id} status before processing`);
          const freshTransactionPromise = this.transactionRepository.findOne({
            where: { id: transaction.id }
          });
          
          const timeoutPromise = new Promise<WalletTransaction>((_, reject) => {
            setTimeout(() => reject(new Error('Transaction fetch timed out')), 5000);
          });
          
          const freshTransaction = await Promise.race([freshTransactionPromise, timeoutPromise]);

          if (!freshTransaction || freshTransaction.status !== TransactionStatus.UNSETTLED) {
            this.logger.log(`[DEBUG] Transaction ${transaction.id} is no longer UNSETTLED (status: ${freshTransaction?.status || 'unknown'}), skipping`);
            continue;
          }

          // Get prepared transaction data with retry logic
          this.logger.log(`[DEBUG] Starting processing for transaction ${transaction.id}, transactionId: ${transaction.transactionId}`);
          
          // Try to process with up to 3 retries
          let attempt = 0;
          const maxAttempts = 3;
          let success = false;
          let error;
          
          while (attempt < maxAttempts && !success) {
            try {
              attempt++;
              // If this is a retry, log it
              if (attempt > 1) {
                this.logger.log(`[DEBUG] Retry attempt ${attempt}/${maxAttempts} for transaction ${transaction.id}`);
              }
              
              this.logger.log(`[DEBUG] Preparing transaction ${transaction.id} for offramp`);
              const preparedTransaction = await this.prepareTransactionService.prepareTransactionForOfframp(transaction.transactionId);
              
              this.logger.log(`[DEBUG] Transaction ${transaction.id} prepared with data: 
                tokenAddress: ${preparedTransaction.tokenAddress}, 
                amount: ${preparedTransaction.amount}, 
                recipient: ${preparedTransaction.recipientName}, 
                currency: ${preparedTransaction.currency}`);
              
              // Process the transaction
              this.logger.log(`[DEBUG] Calling processOrder for transaction ${transaction.id}`);
              const result = await this.processOrder(preparedTransaction);
              
              this.logger.log(`[DEBUG] Transaction ${transaction.id} successfully processed with hash ${result.txHash}`);
              success = true;
            } catch (err) {
              error = err;
              // Exponential backoff: 1s, 2s, 4s
              const backoffTime = Math.pow(2, attempt - 1) * 1000;
              this.logger.warn(`[DEBUG] Attempt ${attempt} failed for transaction ${transaction.id}. Error: ${err.message}. Retrying in ${backoffTime}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
          }
          
          if (!success) {
            // Update transaction with error information after all retries failed
            this.logger.error(`[DEBUG] Failed to process transaction ${transaction.id} after ${maxAttempts} attempts: ${error.message}`);
            
            // Update transaction metadata to record the error
            this.logger.log(`[DEBUG] Updating transaction ${transaction.id} with error metadata`);
            await this.transactionRepository.update(
              { id: transaction.id },
              { 
                metadata: {
                  ...(transaction.metadata || {}),
                  offramp: {
                    ...(transaction.metadata?.offramp || {}),
                    processingErrors: [
                      ...(transaction.metadata?.offramp?.processingErrors || []),
                      {
                        time: new Date().toISOString(),
                        message: error.message,
                        retries: maxAttempts
                      }
                    ],
                    lastProcessingAttempt: new Date().toISOString()
                  }
                }
              }
            );
          }
        } catch (error) {
          this.logger.error(`[DEBUG] Error in transaction processing loop for ${transaction.id}: ${error.message}`, error.stack);
        }
      }
    } catch (error) {
      // More detailed error logging
      if (error.message.includes('timeout') || error.message.includes('terminated')) {
        this.logger.error(
          `[DEBUG] Database connection timeout while processing transactions. Will retry on next scheduled run. Error: ${error.message}`,
          error.stack
        );
      } else {
        this.logger.error(`[DEBUG] Error processing UNSETTLED transactions: ${error.message}`, error.stack);
      }
    }
  }

  /**
   * Scheduled job to process unsettled transactions
   * Runs every 30 minutes to find and process transactions in UNSETTLED state
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async cronProcessUnsettledTransactions(): Promise<void> {
    this.logger.log(`[DEBUG] CRON JOB: Processing unsettled transactions started at ${new Date().toISOString()}`);
    try {
      await this.processUnsettledTransactions(10);
      this.logger.log(`[DEBUG] CRON JOB: Finished processing unsettled transactions at ${new Date().toISOString()}`);
    } catch (error) {
      this.logger.error(`[DEBUG] CRON JOB: Error in scheduled unsettled transaction processing: ${error.message}`, error.stack);
    }
  }

  /**
   * Scheduled job to check for stalled transactions
   * Runs every 30 minutes to find and update status of transactions that may be stuck
   * Includes timeout handling and detailed error recovery
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkStalledTransactions(): Promise<void> {
    try {
      this.logger.log('Checking for stalled transactions');

      // Set a timeout for the entire operation
      const timeoutPromise = new Promise<WalletTransaction[]>((_, reject) => {
        setTimeout(() => reject(new Error('Stalled transactions query timed out')), 15000);
      });

      // Find transactions that might be stalled in UNSETTLED state
      // with a blockchain txHash but no status update for > 15 minutes
      const timeThreshold = new Date();
      timeThreshold.setMinutes(timeThreshold.getMinutes() - 15);

      const stalledTransactionsPromise = this.transactionRepository
        .createQueryBuilder('transaction')
        .where('transaction.status = :status', { status: TransactionStatus.UNSETTLED })
        .andWhere('transaction.receivedAt < :threshold', { threshold: timeThreshold })
        .andWhere("transaction.metadata->>'offramp' IS NOT NULL")
        .andWhere("transaction.metadata->'offramp'->>'txHash' IS NOT NULL")
        .getMany();

      // Race the database query against a timeout
      const stalledTransactions = await Promise.race([stalledTransactionsPromise, timeoutPromise]);

      if (stalledTransactions.length === 0) {
        this.logger.log('No stalled transactions found');
        return;
      }

      this.logger.log(`Found ${stalledTransactions.length} potentially stalled transactions`);
      
      // Store stats for post-processing report
      const stats = {
        total: stalledTransactions.length,
        stillPending: 0,
        recovered: 0,
        sentToManualReview: 0,
        errors: 0
      };

      // Process each stalled transaction
      for (const transaction of stalledTransactions) {
        try {
          const txHash = transaction.metadata?.offramp?.txHash;
          if (!txHash) {
            this.logger.warn(`Transaction ${transaction.id} marked as stalled but has no txHash, skipping`);
            continue;
          }

          // Get transaction receipt to see if it was confirmed
          // Add timeout to prevent hanging on RPC issues
          const provider = this.getProvider(mapNetworkFromConfig(this.configService.get<string>('blockradar.network'), transaction.chain));
          const receiptPromise = provider.getTransactionReceipt(txHash);
          const receiptTimeoutPromise = new Promise<ethers.TransactionReceipt | null>((_, reject) => {
            setTimeout(() => reject(new Error('Blockchain RPC request timed out')), 10000);
          });
          
          const receipt = await Promise.race([receiptPromise, receiptTimeoutPromise])
            .catch(error => {
              this.logger.warn(`Error getting receipt for ${txHash}: ${error.message}`);
              stats.errors++;
              return null;
            });
          
          // If receipt is null, transaction is still pending
          if (!receipt) {
            this.logger.log(`Transaction ${txHash} is still pending on blockchain`);
            stats.stillPending++;
            continue;
          }

          // Transaction was confirmed, try to get order ID
          try {
            const orderId = await this.getOrderIdFromTransaction(
              txHash,
              transaction.businessAddress,
              transaction.metadata?.offramp?.tokenAddress || '',
              mapNetworkFromConfig(this.configService.get<string>('blockradar.network'), transaction.chain)
            );

            // Update transaction with order ID
            await this.transactionRepository.update(
              { id: transaction.id },
              { 
                offrampOrderId: orderId,
                status: TransactionStatus.PROCESSING,
                metadata: {
                  ...transaction.metadata,
                  offramp: {
                    ...transaction.metadata?.offramp,
                    orderId,
                    statusCheckedAt: new Date().toISOString(),
                    statusCheckedBy: 'stalled-checker',
                    recoveryMethod: 'automatic'
                  }
                }
              }
            );

            this.logger.log(`Successfully recovered stalled transaction ${transaction.id} with order ID ${orderId}`);
            stats.recovered++;
          } catch (orderIdError) {
            this.logger.error(`Error getting order ID for ${txHash}: ${orderIdError.message}`);
            
            // Mark for manual review if we can't get order ID
            if (receipt.status === 1) { // Transaction succeeded but we can't get order ID
              await this.addToManualReview(
                'unknown',
                'tx_confirmed_no_order',
                { 
                  txHash, 
                  transactionId: transaction.id,
                  businessAddress: transaction.businessAddress,
                  attempt: transaction.metadata?.offramp?.retryAttempts || 1
                },
                'Transaction confirmed but order ID not found'
              );
              stats.sentToManualReview++;
              
              // Update transaction to show it was sent for review
              await this.transactionRepository.update(
                { id: transaction.id },
                {
                  metadata: {
                    ...transaction.metadata,
                    offramp: {
                      ...transaction.metadata?.offramp,
                      sentToManualReview: true,
                      reviewReason: 'tx_confirmed_no_order',
                      statusCheckedAt: new Date().toISOString(),
                      retryAttempts: (transaction.metadata?.offramp?.retryAttempts || 0) + 1
                    }
                  }
                }
              );
            }
          }
        } catch (error) {
          this.logger.error(`Error processing stalled transaction ${transaction.id}: ${error.message}`, error.stack);
          stats.errors++;
        }
      }
      
      // Log a summary of what was done
      this.logger.log(`Stalled transactions check completed:
        - Total checked: ${stats.total}
        - Still pending: ${stats.stillPending}
        - Successfully recovered: ${stats.recovered}
        - Sent to manual review: ${stats.sentToManualReview}
        - Errors: ${stats.errors}
      `);
    } catch (error) {
      // More detailed error logging
      if (error.message.includes('timeout') || error.message.includes('terminated')) {
        this.logger.error(
          `Database timeout while checking stalled transactions. Will retry on next scheduled run. Error: ${error.message}`,
          error.stack
        );
      } else {
        this.logger.error(`Error checking stalled transactions: ${error.message}`, error.stack);
      }
    }
  }

  /**
   * Processes a transaction directly
   * Used when a transaction needs to be processed immediately
   * 
   * @param transactionId The ID of the transaction to process
   * @returns Result of the processing operation
   */
  async processTransaction(transactionId: string): Promise<{
    success: boolean;
    message: string;
    txHash?: string;
  }> {
    try {
      this.logger.log(`Direct processing of transaction ${transactionId}`);
      
      // Get the transaction
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId }
      });
      
      if (!transaction) {
        return { 
          success: false, 
          message: `Transaction ${transactionId} not found` 
        };
      }
      
      // Check if transaction can be processed
      if (transaction.status !== TransactionStatus.UNSETTLED) {
        return { 
          success: false, 
          message: `Transaction ${transactionId} is not in UNSETTLED state (${transaction.status})` 
        };
      }
      
      // Prepare and process
      const preparedTransaction = await this.prepareTransactionService.prepareTransactionForOfframp(transaction.transactionId);
      const result = await this.processOrder(preparedTransaction);
      
      return {
        success: true,
        message: `Transaction ${transactionId} processed successfully`,
        txHash: result.txHash
      };
    } catch (error) {
      this.logger.error(`Error in direct transaction processing: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error processing transaction: ${error.message}`
      };
    }
  }

  /**
   * Checks a specific transaction's status and attempts recovery if needed
   * This method is used by the admin API endpoint to check transaction status
   * 
   * @param transactionId The ID of the transaction to check
   * @returns Information about the transaction status and recovery attempts
   */
  async checkAndRecoverTransaction(transactionId: string): Promise<{
    success: boolean;
    transaction?: any;
    status: string;
    recovered?: boolean;
    message: string;
    details?: any;
  }> {
    try {
      this.logger.log(`Checking and attempting recovery for transaction ${transactionId}`);
      
      // Get the transaction
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId }
      });
      
      if (!transaction) {
        return {
          success: false,
          status: 'not_found',
          message: `Transaction ${transactionId} not found`
        };
      }
      
      // If transaction is already in a final state, just return its status
      if (
        transaction.status === TransactionStatus.SETTLED || 
        transaction.status === TransactionStatus.REFUNDED
      ) {
        return {
          success: true,
          transaction,
          status: transaction.status,
          message: `Transaction is already in final state: ${transaction.status}`
        };
      }
      
      // If transaction is in UNSETTLED state and has a blockchain txHash, try to recover it
      if (
        transaction.status === TransactionStatus.UNSETTLED && 
        transaction.metadata?.offramp?.txHash
      ) {
        const txHash = transaction.metadata.offramp.txHash;
        
        try {
          // Check blockchain confirmation
          const receipt = await this.getProvider(mapNetworkFromConfig(this.configService.get<string>('blockradar.network'), transaction.chain)).getTransactionReceipt(txHash);
          
          if (!receipt) {
            return {
              success: true,
              transaction,
              status: 'pending_confirmation',
              message: `Transaction is still pending on blockchain`
            };
          }
          
          // Transaction is confirmed on blockchain, try to get order ID
          if (receipt.status === 1) { // Success
            try {
              const orderId = await this.getOrderIdFromTransaction(
                txHash,
                transaction.businessAddress,
                transaction.metadata?.offramp?.tokenAddress || '',
                mapNetworkFromConfig(this.configService.get<string>('blockradar.network'), transaction.chain)
              );
              
              // Update transaction with order ID
              await this.transactionRepository.update(
                { id: transaction.id },
                { 
                  offrampOrderId: orderId,
                  status: TransactionStatus.PROCESSING,
                  metadata: {
                    ...transaction.metadata,
                    offramp: {
                      ...transaction.metadata?.offramp,
                      orderId,
                      statusCheckedAt: new Date().toISOString(),
                      statusCheckedBy: 'manual-check',
                      recoveryMethod: 'manual'
                    }
                  }
                }
              );
              
              return {
                success: true,
                transaction: {
                  ...transaction,
                  status: TransactionStatus.PROCESSING,
                  offrampOrderId: orderId
                },
                status: 'recovered',
                recovered: true,
                message: `Successfully recovered transaction with order ID ${orderId}`,
                details: {
                  orderId,
                  txHash,
                  recoveryMethod: 'manual'
                }
              };
            } catch (orderIdError) {
              // Could not get order ID even though transaction is confirmed
              return {
                success: false,
                transaction,
                status: 'confirmed_no_order',
                message: `Transaction confirmed on blockchain but failed to get order ID: ${orderIdError.message}`,
                details: {
                  error: orderIdError.message,
                  txHash
                }
              };
            }
          } else {
            // Transaction failed on blockchain
            return {
              success: false,
              transaction,
              status: 'blockchain_failed',
              message: `Transaction failed on blockchain`,
              details: {
                receipt
              }
            };
          }
        } catch (error) {
          return {
            success: false,
            transaction,
            status: 'check_failed',
            message: `Error checking transaction status: ${error.message}`
          };
        }
      }
      
      // For other states or cases
      return {
        success: true,
        transaction,
        status: transaction.status,
        message: `Transaction is in ${transaction.status} state but no recovery needed or possible`
      };
    } catch (error) {
      this.logger.error(`Error checking/recovering transaction ${transactionId}: ${error.message}`, error.stack);
      return {
        success: false,
        status: 'error',
        message: `Error checking transaction: ${error.message}`
      };
    }
  }
} 