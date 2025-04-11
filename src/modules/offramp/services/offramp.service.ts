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
import { QueueService } from '../../queue/queue.service';

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
    private readonly transactionManager: TransactionManagerService,
    private readonly queueService: QueueService
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
    const pollingInterval = 3000; // 3 seconds
    
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
   * Creates an offramp order using pre-prepared transaction data.
   * 
   * @param transaction - The fully prepared Transaction object
   * @returns Object containing details needed for processing
   * @throws Error if validation fails or contract interaction errors occur
   */
  async createOrder(transaction: Transaction): Promise<{
    originalTransactionId: string;
    offrampTransactionId: string;
    hash: string;
    offrampId?: string;
  }> {
    const transactionId = transaction.id; // Get original ID for context
    try {
      this.logger.log(`Creating offramp order for prepared transaction: ${transactionId}`);

      // Step 1: Basic validations on prepared data
      const transactionNetwork = transaction.network;
      const gatewayAddress = getGatewayAddressForNetwork(transactionNetwork);
      if (!transaction.addressId || !transaction.walletId) {
        throw new Error(`Missing critical wallet info (addressId/walletId) for transaction ${transactionId}`);
      }
      if (!transaction.amountInTokenUnits || !transaction.encryptedRecipient) {
        throw new Error(`Prepared transaction data missing required fields for ${transactionId}`);
      }
      if (!transaction.rate || transaction.rate <= 0) {
        throw new Error(`Invalid rate in prepared transaction: ${transaction.rate}`);
      }

      // Step 2: Get wallet config
      const walletConfig = this.walletConfigService.getWalletConfigForTransaction({
        blockchainName: transaction.chain,
        tokenSymbol: transaction.tokenSymbol,
        walletId: transaction.walletId
      });

      // Step 3: Approve token spending
      this.logger.log(`Step 3: Approving token spending for transaction: ${transactionId}`);
      const approvalTx = await this.orderService.approveTokenSpending(
        transaction.tokenAddress,
        gatewayAddress,
        transaction.amountInTokenUnits, // Use pre-calculated amount
        transaction.senderAddress,
        walletConfig,
        transaction.addressId
      );
      this.logger.log(`Token approval response: ${approvalTx.txId || 'existing-allowance'}`);

       // Check if the approval call itself returned an error
      if (approvalTx.error) {
        throw new Error(`Token approval failed: ${approvalTx.error}`);
      }

      // Step 4: Wait for approval confirmation if needed
      if (approvalTx.txId) {
        this.logger.log(`Waiting for approval transaction ${approvalTx.txId} to be confirmed...`);
        const approvalHash = await this.waitForTransactionConfirmation(
          walletConfig.walletId, 
          approvalTx.txId, 
          walletConfig.apiKey
        );
        if (approvalHash === 'pending-hash') {
          throw new Error(`Approval transaction ${approvalTx.txId} confirmation timed out`);
        }
        this.logger.log(`Approval confirmed with hash: ${approvalHash}. Waiting for processing...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Short delay
      }
      
      // Step 5: Create the order using prepared data
      this.logger.log(`Step 5: Creating gateway order for transaction: ${transactionId}`);
      const rate = transaction.rate.toString();
      const senderFeeRecipient = this.configService.get<string>(SENDER_FEE_RECIPIENT);
      const senderFee = this.configService.get<string>(SENDER_FEE_AMOUNT);
      
      let offrampApiTxId: string;
      let orderTxHash: string;

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
            transaction.amountInTokenUnits, // Use pre-calculated amount
            rate,
            senderFeeRecipient,
            senderFee ? BigInt(senderFee).toString() : "0",
            transaction.refundAddress,
            transaction.encryptedRecipient // Use pre-calculated encrypted data
          ],
        });
        
        offrampApiTxId = txResponse?.data?.id;
        if (!offrampApiTxId) {
          throw new Error('Order creation transaction ID not returned from BlockRadar API');
        }
        this.logger.log(`Order creation initiated with BlockRadar Tx ID: ${offrampApiTxId}, waiting for confirmation...`);
        
        // Step 6: Wait for order creation confirmation
        orderTxHash = await this.waitForTransactionConfirmation(
          walletConfig.walletId, 
          offrampApiTxId, 
          walletConfig.apiKey
        );
        
        if (orderTxHash === 'pending-hash') {
          throw new Error(`Order creation transaction ${offrampApiTxId} confirmation timed out`);
        }
        this.logger.log(`Order creation transaction confirmed with hash: ${orderTxHash}`);

      } catch (error) {
        this.logger.error(`Gateway order creation failed for transaction ${transactionId}: ${error.message}`);
        // Ensure specific error is thrown for processOrder to catch
        throw new Error(`Gateway order creation failed: ${error.message}`);
      }
        
      // Step 7: Extract Order ID from logs (best effort)
      let blockchainOrderId = null;
      if (transaction.rpcUrl && orderTxHash) { // No need to check for 'pending-hash' here
        try {
          this.logger.log(`Attempting to extract Order ID from transaction ${orderTxHash}`);
          blockchainOrderId = await this.blockchainService.getOrderIdFromTransaction(
            orderTxHash, 
            transaction.rpcUrl,
            transactionId // Pass original ID for DB updates
          );
          this.logger.log(blockchainOrderId ? `Found Order ID ${blockchainOrderId}` : `Order ID not found in logs yet`);
        } catch (logError) {
          this.logger.warn(`Failed to extract order logs: ${logError.message}`);
          // Do not throw, log extraction failure is not critical path failure here
        }
      }
      
      return {
        originalTransactionId: transactionId,
        offrampTransactionId: offrampApiTxId, // BlockRadar Tx ID for order creation
        hash: orderTxHash,                  // Blockchain hash for order creation
        offrampId: blockchainOrderId       // Blockchain Order ID from logs (if found)
      };

    } catch (error) {
      this.logger.error(`Error creating offramp order for transaction ${transactionId}: ${error.message}`, error.stack);
      // Rethrow the error to be handled by processOrder
      throw error;
    }
  }

  /**
   * Processes an offramp order: prepares data, creates the order, updates status, and initiates polling.
   * 
   * @param transactionInput - Either a transaction ID (string) or a pre-fetched WalletTransaction entity
   * @returns Object containing transaction hash and status
   */
  async processOrder(transactionInput: string | WalletTransaction): Promise<{
    txHash: string;
    offrampId?: string;
    offrampTransactionId: string;
    status: TransactionStatus;
  }> {
    let transactionId: string;
    let initialTransaction: WalletTransaction | null = null;

    // Determine if input is ID or entity
    if (typeof transactionInput === 'string') {
      transactionId = transactionInput;
    } else {
      initialTransaction = transactionInput;
      transactionId = transactionInput.transactionId; // Use transactionId (UUID), not the primary key id
    }

    this.logger.log(`Starting to process offramp order for transaction ${transactionId}`);

    try {
      // Step 1: Prepare transaction data (fetch if necessary)
      this.logger.log(`Preparing transaction data for ${transactionId}`);
      const preparedTransaction = await this.prepareTransactionService.prepareTransactionForOfframp(transactionId);
      
      // Step 2: Create or update OfframpTransaction record (initial state)
      // We do this early to ensure the record exists before blockchain steps
      this.logger.log(`Creating/updating initial OfframpTransaction record for ${transactionId}`);
      
      await this.transactionManager.createOrUpdateOfframpTransaction({
        transactionId: transactionId, // Use the business identifier UUID, not the database ID
        offrampTransactionId: 'pending-api-id',
        offrampId: 'pending-blockchain-id',
        txHash: 'pending-hash',
        tokenAddress: preparedTransaction.tokenAddress,
        tokenSymbol: preparedTransaction.tokenSymbol,
        amount: preparedTransaction.amount,
        refundAddress: preparedTransaction.refundAddress,
        network: preparedTransaction.network,
        rpcUrl: preparedTransaction.rpcUrl,
        chainId: preparedTransaction.chainId,
        rate: preparedTransaction.rate,
        status: TransactionStatus.UNSETTLED, // Start as UNSETTLED
        institution: preparedTransaction.institution,
        accountIdentifier: preparedTransaction.accountIdentifier,
        recipientName: preparedTransaction.recipientName,
        currency: preparedTransaction.currency,
        metadata: { stage: 'initiated' } // Initial minimal metadata
      });

      // Step 3: Create the order using prepared data
      this.logger.log(`Proceeding to create gateway order for ${transactionId}`);
      const orderResult = await this.createOrder(preparedTransaction);
      
      // Successfully created order, update records
      this.logger.log(`Order creation successful for ${transactionId}. Hash: ${orderResult.hash}, Offramp API TxID: ${orderResult.offrampTransactionId}, Blockchain OrderID: ${orderResult.offrampId}`);
      
      // Step 4: Update WalletTransaction metadata with results
      // BlockchainService handles updating OfframpTransaction status if orderId is found
      await this.transactionManager.updateTransactionMetadataWithBlockchainInfo(
        transactionId,
        orderResult.hash,
        orderResult.offrampId, // Pass potentially null orderId
        orderResult.offrampTransactionId
      );
      
      // Step 5: Initiate status polling if we have chainId and a blockchain order ID
      // The DB update for OfframpTransaction already happened in getOrderIdFromTransaction if successful
      if (orderResult.offrampId && preparedTransaction.chainId) {
        this.logger.log(`Starting order status polling for offrampId ${orderResult.offrampId} on chain ${preparedTransaction.chainId}`);
        // Start polling in background (non-blocking)
        this.pollOrderStatus(preparedTransaction.chainId, orderResult.offrampId, transactionId)
          .catch(pollingError => {
            this.logger.error(`Error in background polling for offrampId ${orderResult.offrampId}: ${pollingError.message}`);
          });
      } else {
        this.logger.warn(`Cannot start order status polling for transaction ${transactionId} - missing offrampId or chainId. Status remains UNSETTLED.`);
      }

      // Return UNSETTLED - final status comes from webhook or polling completion
      return {
        txHash: orderResult.hash,
        offrampId: orderResult.offrampId,
        offrampTransactionId: orderResult.offrampTransactionId,
        status: TransactionStatus.UNSETTLED 
      };

    } catch (error) {
      // Catch errors from prepareTransactionForOfframp or createOrder
      this.logger.error(`Offramp processing failed for transaction ${transactionId}: ${error.message}`, error.stack);
      
      // Determine failure reason based on where the error might have occurred
      let failureReason = "failed during offramp processing";
      if (error.message.includes("approve") || error.message.includes("approval")) {
        failureReason = "failed in token approval";
      } else if (error.message.includes("Gateway order creation failed")) {
        failureReason = "failed in create order";
      } else if (error.message.includes("prepareTransactionForOfframp")) {
        failureReason = "failed during data preparation";
      }
      
      // Update transaction status and metadata to record the failure
      await this.transactionManager.updateTransactionWithError(
        transactionId, 
        error, 
        failureReason
      );
      
      // Add to failed-recovery queue for automated recovery
      try {
        await this.queueService.addToQueue("failed-recovery", {
          transactionId,
          error: error.message,
          context: failureReason || 'Order creation failed'
        });
        this.logger.log(`Transaction ${transactionId} added to failed-recovery queue`);
      } catch (queueError) {
        this.logger.error(`Failed to add ${transactionId} to failed-recovery queue: ${queueError.message}`);
      }
      
      // Return FAILED status
      return {
        txHash: 'error',
        offrampTransactionId: 'error',
        status: TransactionStatus.FAILED
      };
    }
  }

  /**
   * Polls for order status and updates transaction records when finalized
   * Optimized for efficiency with reduced database queries
   * 
   * @param chainId - The blockchain chain ID 
   * @param orderId - The order ID to check
   * @param transactionId - The business identifier of the transaction (UUID)
   * @returns Promise resolving when polling completes or errors
   */
  async pollOrderStatus(
    chainId: number | string,
    orderId: string, 
    transactionId: string
  ): Promise<void> {
    const pollInterval = 1000; // 3 seconds
    const maxAttempts = 2; // 15 seconds total (5 * 3000ms)
    
    // Get transaction data once before starting polling
    const existingTransaction = await this.transactionRepository.findOne({ 
      where: { transactionId: transactionId } 
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
            
            // Add to processing-attempt queue for later retry
            try {
              await this.queueService.addToQueue("processing-attempt", {
                transactionId,
                orderId,
                chainId
              }, {
                priority: 1,  // Highest priority
                lifo: true    // Last In, First Out - puts job at the front of the queue
              });
              
              this.logger.log(`Transaction ${transactionId} added to processing-attempt queue for later retry`);
            } catch (queueError) {
              this.logger.error(`Failed to add transaction ${transactionId} to processing-attempt queue: ${queueError.message}`);
            }
            
            return cleanup();
          }
          
          // Get order status
          const orderDetails = await this.offrampApiService.checkOrderStatusByChainId(chainId, orderId);
          
          // Handle error responses
          if (orderDetails.status === 'error') {
            if (attempts >= maxAttempts) {
              // Add to processing-attempt queue for later retry
              try {
                await this.queueService.addToQueue("processing-attempt", {
                  transactionId,
                  orderId,
                  chainId
                }, {
                  priority: 1,  // Highest priority
                  lifo: true    // Last In, First Out - puts job at the front of the queue
                });
                
                this.logger.log(`Transaction ${transactionId} added to processing-attempt queue due to error response`);
              } catch (queueError) {
                this.logger.error(`Failed to add transaction ${transactionId} to processing-attempt queue: ${queueError.message}`);
              }
              
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
            
            // No need for extra verification
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