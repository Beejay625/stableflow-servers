import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TransactionQueueService } from '../../queue/services/transaction-queue.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private apiKey: string;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly transactionQueueService: TransactionQueueService,
    private readonly redisService: RedisService,
  ) {
    // OPTIMIZATION: Cache the API key to avoid repeated config lookups
    this.apiKey = this.configService.get<string>('blockradar.apiKey');
  }

  /**
   * Validate webhook signature
   * OPTIMIZED: Uses cached API key for faster validation
   */
  validateSignature(event: any, signature: string): boolean {
    if (!this.apiKey || !signature) {
      return false;
    }
    
    const generatedSignature = crypto
      .createHmac('sha512', this.apiKey)
      .update(JSON.stringify(event))
      .digest('hex');
      
    return generatedSignature === signature;
  }

  /**
   * Extract relevant data from webhook payload
   * OPTIMIZED: Focused on deposit.success events, minimal extraction
   */
  extractWebhookData(payload: any): { 
    transactionId: string; 
    businessAddress: string; 
    eventType: string;
    walletId: string | null;
  } {
    // Direct access to nested properties with fallbacks
    const data = payload?.data || {};
    
    // Extract only what's needed for processing with defaults
    return {
      transactionId: data.id || payload.id || '',
      businessAddress: data.recipient_address || data.recipientAddress || '',
      eventType: data.event_type || data.eventType || '',
      walletId: data.wallet?.id || null
    };
  }

  /**
   * Process transaction event from Blockradar webhook
   * OPTIMIZED: Only processes deposit.success events
   */
  async processTransactionEvent(payload: any): Promise<void> {
    // Log the full payload in development only
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('Full webhook payload:', JSON.stringify(payload, null, 2));
    }
    
    const { transactionId, eventType } = this.extractWebhookData(payload);
    if (!transactionId) {
      this.logger.warn('Received webhook payload without transaction ID, skipping processing');
      return;
    }

    // STRICT FILTERING: Only process "deposit.success" events
    const isDepositSuccessEvent = eventType === 'deposit.success' || 
                                 (payload?.event === 'deposit.success') ||
                                 (payload?.data?.event === 'deposit.success');
    
    if (!isDepositSuccessEvent) {
      this.logger.log(`Skipping non-deposit.success event: ${eventType || 'unknown'} for transaction ${transactionId}`);
      return;
    }

    this.logger.log(`Processing deposit.success webhook for transaction ${transactionId}`);

    const client = this.redisService.getClient();
    const idempotencyKey = `idempotency:webhook:${transactionId}`;
    
    try {
      // OPTIMIZATION: Use a single Redis call to check and set idempotency
      // This reduces network round trips to Redis
      const processed = await client.set(idempotencyKey, 'processing', 'EX', 86400, 'NX');
      
      // If key already exists, skip processing
      if (!processed) {
        this.logger.warn(`Duplicate webhook for transaction ${transactionId} detected, already processed`);
        return;
      }

      // Queue the transaction
      const queued = await this.transactionQueueService.queueTransaction(transactionId);
      
      if (!queued) {
        this.logger.debug(`Transaction ${transactionId} already in queue, skipped`);
      }
      
      // Update idempotency key to completed state
      await client.set(idempotencyKey, 'completed', 'EX', 86400);
      this.logger.log(`Deposit transaction ${transactionId} webhook processed successfully`);
    } catch (error) {
      this.logger.error(`Error processing webhook for transaction ${transactionId}: ${error.message}`, error.stack);
      // On error, mark as failed but don't rethrow (allows webhook to be acknowledged)
      await client.set(idempotencyKey, `error:${error.message}`, 'EX', 86400);
    }
  }
  
  /**
   * Sanitizes the payload for logging by removing sensitive fields
   */
  private sanitizePayload(payload: any): any {
    if (!payload) return {};
    
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(payload));
    
    // List of potentially sensitive fields to redact
    const sensitiveFields = ['signature', 'apiKey', 'key', 'secret', 'token', 'password', 'credential'];
    
    // Recursively sanitize the object
    const sanitizeObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        // If field name matches sensitive pattern, redact it
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          // Recursively sanitize nested objects
          sanitizeObject(obj[key]);
        }
      });
    };
    
    sanitizeObject(sanitized);
    return sanitized;
  }
}