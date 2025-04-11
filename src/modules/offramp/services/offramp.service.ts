import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseUnits } from 'viem';
import { Connection } from 'typeorm';
import axios from 'axios';

import { Transaction as WalletTransaction } from '../../wallet/entities/transaction.entity';
import { OfframpTransaction } from '../entities/offramp-transaction.entity';
import { Business } from '../../business/entities/business.entity';
import { Transaction } from '../interfaces/transaction.interface';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { 
  fetchSupportedTokens, 
  getGatewayAddressForNetwork,
  customSmartContractWrite,
  customSmartContractRead,
  mapNetworkFromConfig,
  getTokenAddress,
  getTokenInfoByAddress
} from '../utils';
import { PrepareTransactionService } from '../preparetransaction.service';
import { RedisService } from '../../redis/redis.service';
import { WalletConfigService } from '../../../common/utils/wallet-config';
import { SENDER_FEE_RECIPIENT, SENDER_FEE_AMOUNT } from '../../../common/constants/env.constants';
import { OrderService } from './orderservice';
import { BlockchainService } from './blockchain.service';
import { OfframpApiService } from './offramp-api.service';
import { TransactionManagerService } from './transaction-manager.service';

@Injectable()
export class OfframpService {
  private readonly logger = new Logger(OfframpService.name);
  private readonly aggregatorUrl: string;
  private readonly ngnProviderId: string;
  private readonly kesProviderId: string;
  private readonly walletId: string;
  private readonly apiKey: string;
  private readonly network: string;
  private readonly senderFeeRecipient: string;
  private readonly senderFeeAmount: string;

  // Redis key for tracking transactions needing manual review
  private readonly REDIS_MANUAL_REVIEW = 'offramp:manual_review';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(OfframpTransaction)
    private readonly offrampTransactionRepository: Repository<OfframpTransaction>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly prepareTransactionService: PrepareTransactionService,
    private readonly redisService: RedisService,
    private readonly walletConfigService: WalletConfigService,
    private readonly orderService: OrderService,
    private readonly connection: Connection,
    private readonly blockchainService: BlockchainService,
    private readonly offrampApiService: OfframpApiService,
    private readonly transactionManager: TransactionManagerService
  ) {
    this.aggregatorUrl = this.configService.get<string>('paycrest.baseUrl');
    this.ngnProviderId = this.configService.get<string>('NGN_PROVIDER_ID');
    this.kesProviderId = this.configService.get<string>('KES_PROVIDER_ID');
    this.walletId = this.configService.get<string>('blockradar.walletId');
    this.apiKey = this.configService.get<string>('paycrest.apiKey');
    this.senderFeeRecipient = this.configService.get<string>(SENDER_FEE_RECIPIENT);
    this.senderFeeAmount = this.configService.get<string>(SENDER_FEE_AMOUNT);
    
    // Get the network configuration and map it to the appropriate network name
    const configNetwork = this.configService.get<string>('blockradar.network');
    this.network = mapNetworkFromConfig(configNetwork);
    
    this.logger.log(`Initialized OfframpService with network: ${this.network}`);
  }

  /**
   * Polls BlockRadar API until transaction is confirmed and has a valid hash
   * @param walletId - The wallet ID
   * @param txId - The transaction ID returned by customSmartContractWrite
   * @param apiKey - The API key for BlockRadar
   * @returns The confirmed transaction hash
   */
  private async waitForTransactionConfirmation(walletId: string, txId: string, apiKey: string): Promise<string> {
    this.logger.log(`Waiting for transaction ${txId} to be confirmed...`);
    
    const maxAttempts = 10;
    const pollingInterval = 2000; // 3 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`Polling transaction status (attempt ${attempt}/${maxAttempts})`);
        
        const response = await axios.get(
          `https://api.blockradar.co/v1/wallets/${walletId}/transactions/${txId}`,
          { headers: { 'x-api-key': apiKey } }
        );
        
        // Check if we have the hash and confirmed status
        if (response.data?.data?.hash && 
            response.data?.data?.status === 'SUCCESS') {
          const hash = response.data.data.hash;
          this.logger.log(`Transaction confirmed with hash: ${hash}`);
          return hash;
        }
        
        // If not confirmed yet, wait before next attempt
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      } catch (error) {
        this.logger.warn(`Error polling transaction status: ${error.message}`);
        // Continue polling despite errors
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      }
    }
    
    // If we exhaust all attempts, return the pending status
    this.logger.warn(`Transaction ${txId} not confirmed after ${maxAttempts} attempts`);
    return 'pending-hash';
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
   * @returns Object containing: 
   *   - originalTransactionId: Original transaction ID used to create the order
   *   - offrampTransactionId: Transaction ID from API response
   *   - hash: Transaction hash from API response
   *   - offrampId: Blockchain order ID extracted from logs
   * @throws Error if transaction data is invalid or network unsupported
   */
  async createOrder(transactionId: string): Promise<{ 
    originalTransactionId: string;
    offrampTransactionId: string; 
    hash: string; 
    offrampId?: string 
  }> {
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
      this.logger.log(`Step 1: Approving token spending for transaction: ${transactionId}`);
      const approvalTx = await this.orderService.approveTokenSpending(
        transaction.tokenAddress,
        gatewayAddress,
        transaction.amount.toString(),
        transaction.senderAddress,
        walletConfig,
        transaction.addressId
      );
      
      this.logger.log(`Token approval completed: ${approvalTx.txId || 'existing-allowance'}`);

      // If we have a new approval transaction, wait for it to be confirmed
      if (approvalTx.txId) {
        this.logger.log(`Waiting for approval transaction to be confirmed...`);
        await this.waitForTransactionConfirmation(
          walletConfig.walletId, 
          approvalTx.txId, 
          walletConfig.apiKey
        );
      }

      // Step 2: Wait for approval to be processed
      this.logger.log(`Waiting for approval to be processed before creating order...`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Prepare and encrypt recipient data
      this.logger.log(`Step 3: Preparing encrypted recipient data`);
      const encryptedRecipient = await this.offrampApiService.prepareEncryptedRecipientData(
        transaction.accountIdentifier,
        transaction.recipientName,
        transaction.institution,
        transaction.currency,
        transaction.memo || ''
      );

      // Step 4: Create the order
      this.logger.log(`Step 4: Creating gateway order for transaction: ${transactionId}`);
      
      // Validate token information is available
      if (!transaction.tokenDecimals) {
        throw new Error(`Missing token decimal information for ${transaction.token}`);
      }
      
      // Convert the amount to proper token units
      let amountInTokenUnits: string;
      try {
        amountInTokenUnits = parseUnits(transaction.amount.toString(), transaction.tokenDecimals).toString();
      } catch (conversionError) {
        this.logger.error(`Error converting amount to token units: ${conversionError.message}`);
        throw new Error(`Failed to convert amount: ${conversionError.message}`);
      }
      
      // Validate the rate from the transaction
      if (!transaction.rate || transaction.rate <= 0) {
        throw new Error(`Invalid rate: ${transaction.rate}. Rate must be greater than 0.`);
      }
      
      const rate = transaction.rate.toString();
      
      // Set fee recipient and fee amount
      const senderFeeRecipient = this.configService.get<string>(SENDER_FEE_RECIPIENT);
      const senderFee = this.configService.get<string>(SENDER_FEE_AMOUNT);
      
      try {
        // Execute the order creation transaction
        const txResponse = await customSmartContractWrite({
          walletId: walletConfig.walletId,
          addressId: transaction.addressId,
          apiKey: walletConfig.apiKey,
          abi: (await import('../abis/abi')).gatewayAbi as unknown as object[],
          address: gatewayAddress,
          method: "createOrder",
          parameters: [
            transaction.tokenAddress,
            amountInTokenUnits,
            rate,
            senderFeeRecipient,
            senderFee ? BigInt(senderFee).toString() : "0",
            transaction.refundAddress,
            encryptedRecipient
          ],
        });
        
        // Extract transaction ID from response
        const txId = txResponse?.data?.id;
        
        if (!txId) {
          throw new Error('Order creation transaction ID not returned from API');
        }
        
        this.logger.log(`Order creation initiated with transaction ID: ${txId}, waiting for confirmation...`);
        
        // Poll for the confirmed transaction hash for the order creation transaction
        const txHash = await this.waitForTransactionConfirmation(
          walletConfig.walletId, 
          txId, 
          walletConfig.apiKey
        );
        
        this.logger.log(`Order creation transaction confirmed with hash: ${txHash}`);
        
        // Try to get the orderId from transaction logs if we have RPC URL and transaction hash
        let blockchainOrderId = null;
        if (transaction.rpcUrl && txHash && txHash !== 'pending-hash') {
          try {
            this.logger.log(`Attempting to extract logs from order creation transaction ${txHash}`);
            const orderLogs = await this.blockchainService.extractOrderLogsFromTransaction(
              txHash, 
              transaction.rpcUrl,
              transactionId  // Pass the original transaction ID for database updates
            );
            
            if (orderLogs && orderLogs.orderId) {
              this.logger.log(`Found offrampId ${orderLogs.orderId} from transaction logs`);
              blockchainOrderId = orderLogs.orderId;
            } else {
              this.logger.warn(`No order ID found in logs for transaction ${txHash}`);
            }
          } catch (logError) {
            this.logger.warn(`Failed to extract order logs: ${logError.message}`);
            // Continue with the process even if log extraction fails
          }
        }
        
        return {
          originalTransactionId: transactionId,  // Original transaction ID
          offrampTransactionId: txId,  // API response ID
          hash: txHash,  // Transaction hash
          offrampId: blockchainOrderId  // Blockchain order ID from logs
        };
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
   * Process for creating and tracking an order end-to-end
   * Handles the entire offramp flow directly without queues
   * 
   * @param transaction Transaction to process
   * @returns Object containing transaction hash and status
   */
  async processOrder(transaction: Transaction): Promise<{
    txHash: string;
    offrampId?: string;
    offrampTransactionId: string;
    status: TransactionStatus;
  }> {
    try {
      this.logger.log(`Starting to process offramp order for transaction ${transaction.id}`);

      // Step 1: Create the order and get transaction hash
      let txHash: string;
      try {
        this.logger.log(`Calling createOrder for transaction ${transaction.id}`);
        const orderResult = await this.createOrder(transaction.id);
        txHash = orderResult.hash;
        const offrampId = orderResult.offrampId || orderResult.offrampTransactionId;
        const offrampTransactionId = orderResult.offrampTransactionId;
        this.logger.log(`Order successfully created with txHash: ${txHash} for transaction ${transaction.id}`);
        
        // Update transaction with hash information but keep as UNSETTLED
        // Real status update will come from webhook
        const updatedMetadata = await this.transactionManager.updateTransactionMetadataWithBlockchainInfo(
          transaction.id,
              txHash,
              offrampId,
          offrampTransactionId
        );
        
        if (updatedMetadata) {
          // Create or update the OfframpTransaction record
          await this.transactionManager.createOrUpdateOfframpTransaction({
              transactionId: transaction.id,
              offrampTransactionId: offrampTransactionId,
              offrampId: offrampId,
            txHash: txHash,
              tokenAddress: transaction.tokenAddress,
              tokenSymbol: transaction.tokenSymbol,
              amount: transaction.amount,
              refundAddress: transaction.refundAddress,
              network: transaction.network,
              rpcUrl: transaction.rpcUrl,
              chainId: transaction.chainId,
              rate: transaction.rate,
              // Set status based on whether we have blockchain-confirmed offrampId
              status: offrampId ? TransactionStatus.PROCESSING : TransactionStatus.UNSETTLED,
            institution: transaction.institution,
            accountIdentifier: transaction.accountIdentifier,
              recipientName: transaction.recipientName,
              currency: transaction.currency,
              metadata: updatedMetadata.offramp
            });
          
          this.logger.log(`Successfully updated transaction ${transaction.id} metadata with txHash`);
          
          // If we have an offrampId and chainId, start polling for order status
          if (offrampId && transaction.chainId) {
            this.logger.log(`Starting order status polling for offrampId ${offrampId} on chain ${transaction.chainId}`);
            
            try {
              // Start polling in background without awaiting (non-blocking)
              this.pollOrderStatus(transaction.chainId, offrampId, transaction.id)
                .then(() => {
                  this.logger.log(`Completed order status polling for offrampId ${offrampId}`);
                })
                .catch(error => {
                  this.logger.error(`Error in background polling for offrampId ${offrampId}: ${error.message}`);
                });
                
              this.logger.log(`Order status polling initiated for offrampId ${offrampId}`);
            } catch (pollingError) {
              this.logger.warn(`Failed to initiate order status polling: ${pollingError.message}`);
              // Continue with process even if polling setup fails
            }
          } else {
            this.logger.warn(`Cannot start order status polling for transaction ${transaction.id} - missing offrampId or chainId`);
          }
        } else {
          this.logger.warn(`Transaction ${transaction.id} not found for metadata update`);
        }
        
        this.logger.log(`Order processing complete for transaction ${transaction.id}, returning UNSETTLED status`);
        return {
          txHash,
          offrampId,
          offrampTransactionId,
          status: TransactionStatus.UNSETTLED
        };
      } catch (error) {
        // This will be logged but not retried automatically - state remains UNSETTLED
        // and will be picked up by checkStalledTransactions cron job
        this.logger.error(`Error creating order for transaction ${transaction.id}: ${error.message}`, error.stack);
        
        // Update transaction metadata to record the error
        await this.transactionManager.updateTransactionWithError(transaction.id, error);
        
        this.logger.log(`Order processing failed for transaction ${transaction.id}, returning error state`);
        return {
          txHash: 'error',
          offrampTransactionId: 'error',
          status: TransactionStatus.UNSETTLED
        };
      }
    } catch (error) {
      this.logger.error(`Unexpected error in processOrder for transaction ${transaction.id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Polls for order status and updates transaction records when finalized
   * Optimized for efficiency with reduced database queries
   * 
   * @param chainId - The blockchain chain ID 
   * @param orderId - The order ID to check
   * @param transactionId - The ID of the original transaction
   * @returns Promise resolving when polling completes or errors
   */
  async pollOrderStatus(
    chainId: number | string,
    orderId: string, 
    transactionId: string
  ): Promise<void> {
    const pollInterval = 3000; // 3 seconds
    const maxAttempts = 5; // 15 seconds total (5 * 3000ms)
    
    // Get transaction data once before starting polling
    const existingTransaction = await this.transactionRepository.findOne({ 
      where: { id: transactionId } 
    });
    
    if (!existingTransaction) {
      this.logger.warn(`Transaction ${transactionId} not found, cannot poll order status`);
      return;
    }
    
    return new Promise((resolve) => {
      let attempts = 0;
      let intervalId = null;
      
      const cleanup = () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        resolve();
      };
      
      const checkStatus = async () => {
        try {
          attempts++;
          this.logger.log(`Polling order status for ${orderId} (attempt ${attempts}/${maxAttempts})`);
          
          // Check if we've reached max attempts
          if (attempts > maxAttempts) {
            this.logger.warn(`Max polling attempts reached for order ${orderId}`);
            
            // After final attempt, do one last safety check to make sure the transaction didn't revert
            await this.blockchainService.verifyTransactionFinalState(chainId, orderId, transactionId);
            
            return cleanup();
          }
          
          // Get order status
          const orderDetails = await this.offrampApiService.checkOrderStatusByChainId(chainId, orderId);
          
          // Handle error responses
          if (orderDetails.status === 'error') {
            if (attempts >= maxAttempts) {
              // Do final check before giving up
              await this.blockchainService.verifyTransactionFinalState(chainId, orderId, transactionId);
              return cleanup();
            }
            return; // Try again next interval
          }
          
          const currentStatus = orderDetails.data?.status;
          this.logger.log(`Order ${orderId} status: ${currentStatus}`);
          
          // Update the database if we have a final status
          if (['settled', 'refunded'].includes(currentStatus)) {
            // Set status directly based on final state
            const transactionStatus = currentStatus === 'settled' 
              ? TransactionStatus.SETTLED 
              : TransactionStatus.REFUNDED;
            
            // Update both transaction records with the final status
            await this.transactionManager.updateTransactionFinalStatus(
              transactionId,
              transactionStatus,
              orderDetails.data
            );
              
              this.logger.log(`Order ${orderId} finalized with status ${currentStatus}`);
            
            // Do final check to make sure transaction didn't revert before finishing
            await this.blockchainService.verifyTransactionFinalState(chainId, orderId, transactionId);
            
            return cleanup();
          }
        } catch (error) {
          this.logger.error(`Error polling order status: ${error.message}`);
          // Continue polling despite errors
        }
      };
      
      // Initial check
      checkStatus();
      
      // Set up interval for polling
      intervalId = setInterval(checkStatus, pollInterval);
    });
  }
} 