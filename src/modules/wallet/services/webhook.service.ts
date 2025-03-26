import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TransactionQueueService } from '../../queue/services/transaction-queue.service';
import { RedisService } from '../../redis/redis.service';
import { WalletConfigService } from '../../../common/utils/wallet-config';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  
  constructor(
    private readonly configService: ConfigService,
    private readonly transactionQueueService: TransactionQueueService,
    private readonly redisService: RedisService,
    private readonly walletConfigService: WalletConfigService,
  ) {}

  /**
   * Validate webhook signature using the appropriate API key for the wallet
   */
  validateSignature(event: any, signature: string): boolean {
    if (!signature) {
      return false;
    }
    
    // Get the wallet-specific configuration
    const walletConfig = this.walletConfigService.getWalletConfig(event);
    
    // If no matching wallet config was found, signature cannot be validated
    if (!walletConfig || !walletConfig.apiKey) {
      this.logger.warn(`No matching wallet configuration found, cannot validate signature`);
      return false;
    }
    
    const generatedSignature = crypto
      .createHmac('sha512', walletConfig.apiKey)
      .update(JSON.stringify(event))
      .digest('hex');
      
    return generatedSignature === signature;
  }

  /**
   * Extract relevant data from webhook payload
   */
  extractWebhookData(payload: any): { 
    transactionId: string; 
    eventType: string;
    chain: string | null;
  } {
    // Direct access to nested properties with fallbacks
    const data = payload?.data || {};
    
    // Get blockchain name using the utility function
    const chain = this.walletConfigService.getBlockchainName(payload);
    
    // Extract only what's needed for processing with defaults
    return {
      transactionId: data.id || payload.id || '',
      eventType: data.event_type || data.eventType || payload.event || '',
      chain: chain || null
    };
  }

  /**
   * Process transaction event from Blockradar webhook
   * Only processes deposit.success events with valid wallet configuration
   */
  async processTransactionEvent(payload: any): Promise<void> {
    // Log sanitized payload in development mode
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`Full webhook payload: ${JSON.stringify(this.sanitizePayload(payload), null, 2)}`);
    }
    
    // CRITICAL: Check FIRST if this is EXACTLY deposit.success event, return early if not
    if (payload?.event !== 'deposit.success' && payload?.data?.event !== 'deposit.success') {
      this.logger.log(`Skipping non-deposit.success event: ${payload?.event || payload?.data?.event}`);
      return;
    }

    const { transactionId, chain } = this.extractWebhookData(payload);
    
    if (!transactionId) {
      this.logger.warn('Received webhook payload without transaction ID, skipping processing');
      return;
    }

    this.logger.log(`Processing deposit.success webhook for transaction ${transactionId} on chain "${chain}"`);

    const client = this.redisService.getClient();
    const idempotencyKey = `idempotency:webhook:${transactionId}`;
    
    try {
      // Check and set idempotency key
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