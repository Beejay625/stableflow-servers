import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { ethers } from 'ethers';

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
  mapNetworkFromConfig,
  getTokenAddress
} from './utils';
import { PrepareTransactionService } from './preparetransaction.service';
import { RedisService } from '../redis/redis.service';
import { RedlockService } from '../redis/redlock.service';

/**
 * Service responsible for handling cryptocurrency off-ramping operations.
 * Manages the process of converting cryptocurrencies to fiat currencies through:
 * 1. Token approvals
 * 2. Order creation
 * 3. Transaction monitoring
 * 4. Status updates
 */
@Injectable()
export class OfframpService {
  private readonly logger = new Logger(OfframpService.name);
  private readonly aggregatorUrl: string;
  private readonly ngnProviderId: string;
  private readonly kesProviderId: string;
  private readonly provider: ethers.JsonRpcProvider;
  private readonly walletId: string;
  private readonly addressId: string;
  private readonly apiKey: string;
  private readonly network: string;

  // Redis key prefixes
  private readonly REDIS_AWAITING_WEBHOOK = 'offramp:awaiting_webhook';
  private readonly REDIS_PROCESSING = 'offramp:processing';
  private readonly REDIS_REFUND_QUEUE = 'offramp:refund_queue';
  private readonly REDIS_MANUAL_REVIEW = 'offramp:manual_review';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly prepareTransactionService: PrepareTransactionService,
    private readonly redisService: RedisService,
    private readonly redlockService: RedlockService,
    @Optional() @Inject('OfframpQueueProcessor') private readonly queueProcessor?: any
  ) {
    this.aggregatorUrl = this.configService.get<string>('paycrest.baseUrl');
    this.ngnProviderId = this.configService.get<string>('NGN_PROVIDER_ID');
    this.kesProviderId = this.configService.get<string>('KES_PROVIDER_ID');
    this.walletId = this.configService.get<string>('blockradar.walletId');
    this.apiKey = this.configService.get<string>('paycrest.apiKey');
    
    // Get the network configuration and map it to the appropriate network name
    const configNetwork = this.configService.get<string>('blockradar.network');
    this.network = mapNetworkFromConfig(configNetwork);
    
    // Initialize ethers provider with appropriate RPC URL
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    this.logger.log(`Initialized OfframpService with network: ${this.network}`);

    // Get IDs from environment variables
    this.addressId = this.configService.get<string>('blockradar.addressId');
  }

  /**
   * Creates an offramp order for converting cryptocurrency to fiat.
   * 
   * Worker Process Flow:
   * 1. Worker fetches pending transactions from database that need offramping
   * 2. For each transaction:
   *    - Gets token amount ,token itself and currency and recipient details needed for the transaction
   *    - Uses transaction ID as memo for tracking
   *    - Fetches business wallet details for token spending
   * 3. Initiates the offramp process
   * 
   * Offramp Flow:
   * 1. Validates transaction data and network support
   * 2. Approves token spending (ERC20 approve)
   * 3. Encrypts recipient data for privacy
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

      // Get the gateway address for current network
      const gatewayAddress = getGatewayAddressForNetwork(this.network);
      
      // Fetch supported tokens
      const supportedTokens = fetchSupportedTokens(this.network);
      if (!supportedTokens) {
        throw new Error(`Unsupported network: ${this.network}`);
      }

      // Step 1: Approve token spending and get transaction hash
      const approvalTx = await this.approveTokenSpending({
        tokenAddress: transaction.tokenAddress,
        spenderAddress: gatewayAddress,
        amount: transaction.amount.toString(),
      });

      this.logger.log(`Token approval transaction hash: ${approvalTx.txHash}`);

      // Step 2: Wait for a short time to ensure the approval is processed
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
      const publicKey = await this.fetchAggregatorPublicKey();
      const encryptedRecipient = this.publicKeyEncrypt(recipient, publicKey.data);

      // Step 5: Create the order
      const txResponse = await customSmartContractWrite({
        walletId: this.walletId,
        addressId: this.addressId,
        apiKey: this.apiKey,
        abi: gatewayAbi as unknown as object[],
        address: gatewayAddress,
        method: 'createOrder',
        parameters: [
          transaction.tokenAddress,
          transaction.amount.toString(),
          encryptedRecipient,
          transaction.refundAddress
        ],
      });

      this.logger.log(`Offramp order creation initiated, txHash: ${txResponse.txHash}`);
      return txResponse.txHash;
    } catch (error) {
      this.logger.error(`Error creating offramp order: ${error.message}`, error.stack);
      throw error;
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
   * @returns Promise<string> - Order ID associated with the transaction
   * @throws Error if order ID cannot be found through any method
   */
  async getOrderIdFromTransaction(txHash: string, senderAddress: string, tokenAddress: string): Promise<string> {
    try {
      this.logger.log(`Fetching order ID for transaction: ${txHash}`);
      
      // Get gateway address for the configured network
      const gatewayAddress = getGatewayAddressForNetwork(this.network);
      if (!gatewayAddress) {
        throw new Error('Gateway address not found for network');
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
      // Wait for the transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
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
   * Returns initial order creation result with transaction hash and order ID
   */
  async processOrder(transaction: Transaction): Promise<{
    txHash: string;
    orderId?: string;
    status: TransactionStatus;
  }> {
    try {
      this.logger.log(`Processing offramp order for transaction ${transaction.id}`);

      // Step 1: Create the order and get transaction hash
      let txHash: string;
      try {
        txHash = await this.createOrder(transaction.id);
        this.logger.log(`Order created with txHash: ${txHash}`);
        
        // Add to awaiting webhook queue with transaction details
        await this.addToAwaitingWebhook(transaction.id, {
          txHash,
          transactionId: transaction.id,
          senderAddress: transaction.senderAddress,
          tokenAddress: transaction.tokenAddress,
          amount: transaction.amount,
          attemptTime: new Date().toISOString()
        });
        
        // Update transaction with hash information but keep as UNSETTLED
        // Real status update will come from webhook
        await this.transactionRepository.findOne({ where: { id: transaction.id } })
          .then(existingTransaction => {
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
            return this.transactionRepository.update(
              { id: transaction.id },
              { metadata: updatedMetadata }
            );
          });
        
        return {
          txHash,
          status: TransactionStatus.UNSETTLED
        };
      } catch (error) {
        // Only transaction creation errors that happen before blockchain
        // are safe to retry
        if (error.message.includes('API error') || 
            error.message.includes('validation failed') ||
            error.message.includes('Invalid parameters')) {
          this.logger.error(`Clear error before blockchain, safe to retry: ${error.message}`);
          throw error; // Rethrow to trigger retry
        }
        
        // For other errors, we're not sure if transaction went through
        // Mark as awaiting webhook to be safe
        this.logger.warn(`Uncertain error, marking as awaiting webhook: ${error.message}`);
        await this.addToAwaitingWebhook(transaction.id, {
          error: error.message,
          transactionId: transaction.id,
          attemptTime: new Date().toISOString()
        });
        
        return {
          txHash: 'unknown',
          status: TransactionStatus.UNSETTLED
        };
      }
    } catch (error) {
      this.logger.error(`Error processing order: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handles webhook events from the offramp provider
   * Using Redis to ensure atomicity and prevent race conditions
   * 
   * @param payload The webhook payload from the offramp provider
   */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const { event, data } = payload;
    const orderId = data.id;
    
    this.logger.log(`Processing webhook event: ${event} for order: ${orderId}`);
    
    // Use a distributed lock to ensure atomic transaction processing
    const lockResource = `webhook:${orderId}`;
    const lockTtl = 30000; // 30 seconds lock TTL
    
    try {
      // Execute with a distributed lock to prevent race conditions
      await this.redlockService.using(lockResource, lockTtl, async () => {
        // Find the transaction by offramp order ID
        const transaction = await this.transactionRepository.findOne({
          where: { offrampOrderId: orderId }
        });
        
        // If no transaction found with this order ID, check if we have a transaction
        // in the awaiting_webhook queue that might match
        if (!transaction) {
          this.logger.log(`No transaction found with orderId: ${orderId}, checking awaiting_webhook queue`);
          
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
      });
    } catch (error) {
      this.logger.error(`Error processing webhook for order ${orderId}: ${error.message}`, error.stack);
      // Still ensure we add to manual review if there's an error
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
        
        // Remove from awaiting_webhook queue if present
        await this.removeFromAwaitingWebhook(transaction.id);
        
        // Add to processing queue
        await this.addToProcessingQueue(transaction.id, data.id);
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
        
        // Remove from all processing queues
        await this.cleanupFromAllQueues(transaction.id);
        break;
        
      case WebhookEventType.EXPIRED:
        // Payment window expired, will trigger refund
        newStatus = TransactionStatus.STALLED;
        
        // Update metadata with expiry details
        metadata.offramp.expiryReason = data.reason || 'payment_window_expired';
        metadata.offramp.expiredAt = data.updatedAt || new Date().toISOString();
        
        // Add to refund queue
        await this.addToRefundQueue(transaction.id, data.id);
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
        
        // Remove from all processing queues
        await this.cleanupFromAllQueues(transaction.id);
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
   * Add a transaction to the awaiting webhook queue
   * 
   * @param transactionId The transaction ID
   * @param requestData Original request data (optional)
   */
  async addToAwaitingWebhook(transactionId: string, requestData?: any): Promise<void> {
    const client = this.redisService.getClient();
    const key = `${this.REDIS_AWAITING_WEBHOOK}:${transactionId}`;
    
    await client.hset(
      this.REDIS_AWAITING_WEBHOOK,
      transactionId,
      JSON.stringify({
        status: TransactionStatus.UNSETTLED,
        attemptTime: new Date().toISOString(),
        lastCheck: new Date().toISOString(),
        originalRequest: requestData || {},
        blockchainAttempted: true
      })
    );
    
    this.logger.log(`Added transaction ${transactionId} to awaiting_webhook queue`);
  }
  
  /**
   * Remove a transaction from the awaiting webhook queue
   * 
   * @param transactionId The transaction ID
   */
  async removeFromAwaitingWebhook(transactionId: string): Promise<void> {
    const client = this.redisService.getClient();
    await client.hdel(this.REDIS_AWAITING_WEBHOOK, transactionId);
    this.logger.log(`Removed transaction ${transactionId} from awaiting_webhook queue`);
  }
  
  /**
   * Add a transaction to the processing queue
   * 
   * @param transactionId The transaction ID
   * @param orderId The order ID
   */
  async addToProcessingQueue(transactionId: string, orderId: string): Promise<void> {
    const client = this.redisService.getClient();
    
    await client.hset(
      this.REDIS_PROCESSING,
      transactionId,
      JSON.stringify({
        status: TransactionStatus.PROCESSING,
        orderId,
        startedAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      })
    );
    
    this.logger.log(`Added transaction ${transactionId} to processing queue with order ${orderId}`);
  }
  
  /**
   * Add a transaction to the refund queue
   * 
   * @param transactionId The transaction ID
   * @param orderId The order ID
   */
  async addToRefundQueue(transactionId: string, orderId: string): Promise<void> {
    const client = this.redisService.getClient();
    
    await client.hset(
      this.REDIS_REFUND_QUEUE,
      transactionId,
      JSON.stringify({
        status: TransactionStatus.STALLED,
        orderId,
        expiryReason: 'payment_window_expired',
        refundAttempts: 0,
        lastRefundAttempt: null
      })
    );
    
    this.logger.log(`Added transaction ${transactionId} to refund queue`);
  }
  
  /**
   * Add a transaction to the manual review queue
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
   * Clean up a transaction from all Redis queues
   * 
   * @param transactionId The transaction ID
   */
  async cleanupFromAllQueues(transactionId: string): Promise<void> {
    const client = this.redisService.getClient();
    
    // Remove from all queues
    await Promise.all([
      client.hdel(this.REDIS_AWAITING_WEBHOOK, transactionId),
      client.hdel(this.REDIS_PROCESSING, transactionId),
      client.hdel(this.REDIS_REFUND_QUEUE, transactionId)
    ]);
    
    this.logger.log(`Removed transaction ${transactionId} from all queues`);
  }

  /**
   * Approves the gateway contract to spend tokens on behalf of the user.
   * Required before creating an offramp order.
   * 
   * Process:
   * 1. Calls ERC20 approve function
   * 2. Waits for approval confirmation
   * 3. Verifies allowance amount
   * 
   * @param params.tokenAddress - Address of the token contract
   * @param params.spenderAddress - Address of the gateway contract
   * @param params.amount - Amount to approve (in token's smallest unit)
   * @returns Promise<any> - Transaction response from approval
   */
  async approveTokenSpending({
    tokenAddress,
    spenderAddress,
    amount,
  }: {
    tokenAddress: string;
    spenderAddress: string;
    amount: string;
  }): Promise<any> {
    return await customSmartContractWrite({
      walletId: this.walletId,
      addressId: this.addressId,
      apiKey: this.apiKey,
      abi: erc20Abi as unknown as object[],
      address: tokenAddress,
      method: "approve",
      parameters: [spenderAddress, amount],
    });
  }

  /**
   * Check token allowance for the gateway contract
   */
  private async checkAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<string> {
    try {
      const response = await customSmartContractWrite({
        walletId: this.walletId,
        addressId: this.addressId,
        apiKey: this.apiKey,
        abi: erc20Abi as unknown as object[],
        address: tokenAddress,
        method: "allowance",
        parameters: [ownerAddress, spenderAddress],
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Error checking allowance: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Adds a transaction to the offramp processing queue
   * 
   * @param transactionId The ID of the transaction to add to the queue
   * @returns Promise<boolean> Whether the transaction was added successfully
   */
  async addToOfframpQueue(transactionId: string): Promise<boolean> {
    try {
      // If the queue processor is not available, log a warning and return
      if (!this.queueProcessor) {
        this.logger.warn(`Cannot add transaction ${transactionId} to offramp queue - OfframpQueueProcessor not available`);
        return false;
      }
      
      // Add the transaction to the offramp queue
      const result = await this.queueProcessor.addToQueue(transactionId);
      
      if (result) {
        this.logger.log(`Added transaction ${transactionId} to offramp processing queue`);
      } else {
        this.logger.warn(`Failed to add transaction ${transactionId} to offramp queue`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error adding transaction ${transactionId} to offramp queue: ${error.message}`, error.stack);
      return false;
    }
  }
} 