import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../../common/utils/email';

export enum WebhookEventType {
  PENDING = 'payment_order.pending',
  SETTLED = 'payment_order.settled',
  EXPIRED = 'payment_order.expired',
  REFUNDED = 'payment_order.refunded',
}

export interface WebhookRecipient {
  currency: string;
  institution: string;
  accountIdentifier: string;
  accountName: string;
  memo?: string;
}

export interface WebhookPayload {
  event: WebhookEventType;
  data: {
    id: string;
    amount?: string;
    amountPaid?: string;
    amountReturned?: string;
    percentSettled?: string;
    senderFee?: string;
    networkFee?: string;
    rate?: string;
    network?: string;
    gatewayId?: string;
    reference?: string;
    senderId?: string;
    recipient?: WebhookRecipient;
    fromAddress?: string;
    returnAddress?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    txHash?: string;
    reason?: string;
  };
}

@Injectable()
export class WebhookHandler {
  private readonly logger = new Logger(WebhookHandler.name);
  private readonly REDIS_MANUAL_REVIEW = 'offramp:manual-review';

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Main webhook handler that processes incoming webhook events
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
      
      // If no transaction found with this order ID, check by reference field
      if (!transaction) {
        this.logger.log(`No transaction found with orderId: ${orderId}, checking by reference`);
        
        // If we have reference, try to match with transaction ID
        if (data.reference) {
          const transactionByRef = await this.transactionRepository.findOne({
            where: { transactionId: data.reference }
          });
          
          if (transactionByRef) {
            this.logger.log(`Found transaction by reference: ${data.reference}`);
            
            // Update the transaction with the order ID
            await this.transactionRepository.update(
              { id: transactionByRef.id },
              { offrampOrderId: orderId }
            );
            
            // Process the webhook for this transaction
            await this.processWebhookEvent(transactionByRef, event, data);
            return;
          }
        }
        
        // No match found, add to manual review queue
        this.logger.warn(`No matching transaction found for webhook. Order ID: ${orderId}, Event: ${event}`);
        await this.addToManualReview(orderId, event, data, 'no_matching_transaction');
        return;
      }
      
      // Process the webhook event for the found transaction
      await this.processWebhookEvent(transaction, event, data);
    } catch (error) {
      this.logger.error(`Error processing webhook for order ${orderId}: ${error.message}`, error.stack);
      // Add to manual review for any processing errors
      await this.addToManualReview(orderId, event, data, `error: ${error.message}`);
    }
  }
  
  /**
   * Processes a webhook event and updates transaction status and metadata based on event type
   */
  private async processWebhookEvent(
    transaction: Transaction,
    event: WebhookEventType,
    data: any
  ): Promise<void> {
    this.logger.log(`Processing ${event} for transaction: ${transaction.id}`);
    
    // Prepare metadata structure with existing data
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
    
    // Handle specific event types with appropriate status updates
    switch (event) {
      case WebhookEventType.PENDING:
        // Payment initiated but not yet settled
        newStatus = TransactionStatus.PROCESSING;
        
        // Update metadata with transaction details
        metadata.offramp = {
          ...metadata.offramp,
          orderId: data.id,
          txHash: data.txHash,
          blockchainNetwork: data.network,
          fromAddress: data.fromAddress,
          gatewayId: data.gatewayId,
          pendingAt: data.createdAt || new Date().toISOString()
        };
        break;
        
      case WebhookEventType.SETTLED:
        // Final successful state - fiat sent
        newStatus = TransactionStatus.SETTLED;
        
        // Update metadata with comprehensive settlement details
        metadata.offramp = {
          ...metadata.offramp,
          settlementDetails: {
            amount: parseFloat(data.amount || '0'),
            amountPaid: parseFloat(data.amountPaid || '0'),
            rate: parseFloat(data.rate || '0'),
            completedAt: data.updatedAt || new Date().toISOString(),
            bankReference: data.reference,
            percentSettled: parseFloat(data.percentSettled || '100'),
            recipient: data.recipient,
            senderFee: parseFloat(data.senderFee || '0'),
            networkFee: parseFloat(data.networkFee || '0')
          },
          settledAt: data.updatedAt || new Date().toISOString(),
          txHash: data.txHash || metadata.offramp.txHash
        };
        break;
        
      case WebhookEventType.EXPIRED:
        // Payment window expired, will trigger refund
        newStatus = TransactionStatus.STALLED;
        
        // Update metadata with expiry details
        metadata.offramp = {
          ...metadata.offramp,
          expiryReason: data.reason || 'payment_window_expired',
          expiredAt: data.updatedAt || new Date().toISOString()
        };
        break;
        
      case WebhookEventType.REFUNDED:
        // Final failure state - funds returned
        newStatus = TransactionStatus.REFUNDED;
        
        // Update metadata with comprehensive refund details
        metadata.offramp = {
          ...metadata.offramp,
          refundDetails: {
            amount: parseFloat(data.amountReturned || data.amount || '0'),
            completedAt: data.updatedAt || new Date().toISOString(),
            refundTxHash: data.txHash,
            returnAddress: data.returnAddress,
            reason: data.reason || 'Unknown refund reason'
          },
          refundedAt: data.updatedAt || new Date().toISOString()
        };
        break;
        
      default:
        this.logger.warn(`Unknown event type: ${event}, keeping current status`);
        newStatus = transaction.status as TransactionStatus;
    }
    
    // Update the transaction with new status and metadata
    await this.transactionRepository.update(
      { id: transaction.id },
      {
        status: newStatus,
        metadata,
        processedAt: new Date()
      }
    );
    
    this.logger.log(`Updated transaction ${transaction.id} to status: ${newStatus}`);
    
    // Send notification for critical status changes
    if (newStatus === TransactionStatus.SETTLED || 
        newStatus === TransactionStatus.STALLED || 
        newStatus === TransactionStatus.REFUNDED) {
      await this.sendStatusNotification(transaction.id, newStatus, data);
    }
  }
  
  /**
   * Sends notification for important transaction status changes
   */
  private async sendStatusNotification(
    transactionId: string, 
    status: TransactionStatus, 
    data: any
  ): Promise<void> {
    // Different email subjects based on status
    const subjects = {
      [TransactionStatus.SETTLED]: 'Offramp Transaction Settled Successfully',
      [TransactionStatus.STALLED]: 'Offramp Transaction Expired',
      [TransactionStatus.REFUNDED]: 'Offramp Transaction Refunded'
    };
    
    try {
      await this.mailService.sendMail(
        'notifications@stableflow.com',
        subjects[status] || 'Offramp Transaction Status Update',
        {
          text: `Transaction ${transactionId} status updated to ${status}.\nDetails: ${JSON.stringify(data, null, 2)}`
        }
      );
      this.logger.log(`Sent notification for transaction ${transactionId} status: ${status}`);
    } catch (error) {
      this.logger.error(`Failed to send notification for transaction ${transactionId}: ${error.message}`);
    }
  }
  
  /**
   * Adds a transaction to the manual review queue when it requires human intervention
   */
  private async addToManualReview(
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
    
    // Send alert email for manual review
    try {
      await this.mailService.sendMail(
        'support@stableflow.com',
        'Offramp Transaction Requires Manual Review',
        {
          text: `Order ${orderId} requires manual review.\nReason: ${reason}\nEvent: ${event}\nDetails: ${JSON.stringify(data, null, 2)}`
        }
      );
    } catch (error) {
      this.logger.error(`Failed to send manual review alert: ${error.message}`);
    }
  }
} 