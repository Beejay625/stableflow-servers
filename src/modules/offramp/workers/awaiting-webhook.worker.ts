import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { RedlockService } from '../../redis/redlock.service';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';

@Injectable()
export class AwaitingWebhookWorker {
  private readonly logger = new Logger(AwaitingWebhookWorker.name);
  private readonly REDIS_AWAITING_WEBHOOK = 'offramp:awaiting_webhook';
  private readonly REDIS_MANUAL_REVIEW = 'offramp:manual_review';
  private readonly WEBHOOK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly redisService: RedisService,
    private readonly redlockService: RedlockService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>
  ) {}

  /**
   * Cron job that runs every 5 minutes to check for timed out transactions
   * awaiting webhooks
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAwaitingWebhookTimeouts() {
    this.logger.log('Checking for timed out awaiting webhook transactions');

    try {
      const redisClient = this.redisService.getClient();
      const transactions = await redisClient.hgetall(this.REDIS_AWAITING_WEBHOOK);

      for (const [transactionId, dataString] of Object.entries(transactions)) {
        try {
          const data = JSON.parse(dataString);
          const attemptTime = new Date(data.attemptTime).getTime();
          const now = Date.now();

          // Check if transaction has timed out
          if (now - attemptTime > this.WEBHOOK_TIMEOUT_MS) {
            await this.processTimedOutTransaction(transactionId, data);
          }
        } catch (error) {
          this.logger.error(`Error processing transaction ${transactionId}: ${error.message}`, error.stack);
        }
      }
    } catch (error) {
      this.logger.error(`Error checking awaiting webhook timeouts: ${error.message}`, error.stack);
    }
  }

  /**
   * Process a transaction that has timed out waiting for a webhook
   */
  private async processTimedOutTransaction(transactionId: string, data: any) {
    const lockResource = `timeout:${transactionId}`;
    const lockTtl = 10000; // 10 seconds

    try {
      await this.redlockService.using(lockResource, lockTtl, async () => {
        // Double-check the transaction still exists in awaiting_webhook
        const redisClient = this.redisService.getClient();
        const stillExists = await redisClient.hexists(this.REDIS_AWAITING_WEBHOOK, transactionId);

        if (!stillExists) {
          this.logger.log(`Transaction ${transactionId} no longer in awaiting_webhook, skipping timeout processing`);
          return;
        }

        // Fetch the transaction from the database
        const transaction = await this.transactionRepository.findOne({
          where: { transactionId }
        });

        if (!transaction) {
          this.logger.warn(`Transaction ${transactionId} not found in database`);
          return;
        }

        // Check if transaction is still in UNSETTLED state
        if (transaction.status !== TransactionStatus.UNSETTLED) {
          this.logger.log(`Transaction ${transactionId} is no longer UNSETTLED (${transaction.status}), removing from awaiting_webhook`);
          await redisClient.hdel(this.REDIS_AWAITING_WEBHOOK, transactionId);
          return;
        }

        // Transaction has timed out waiting for webhook, add to manual review
        const reviewId = `${transactionId}-${Date.now()}`;
        await redisClient.hset(
          this.REDIS_MANUAL_REVIEW,
          reviewId,
          JSON.stringify({
            transactionId,
            reason: 'webhook_timeout',
            attemptTime: data.attemptTime,
            timeoutAt: new Date().toISOString(),
            originalData: data,
            status: 'pending_review'
          })
        );

        // Remove from awaiting_webhook
        await redisClient.hdel(this.REDIS_AWAITING_WEBHOOK, transactionId);

        // Update transaction metadata to reflect timeout
        const metadata = {
          ...(transaction.metadata || {}),
          offramp: {
            ...(transaction.metadata?.offramp || {}),
            webhookTimeout: true,
            timeoutAt: new Date().toISOString(),
            addedToManualReview: true,
            reviewId
          }
        };

        await this.transactionRepository.update(
          { id: transaction.id },
          { metadata }
        );

        this.logger.log(`Transaction ${transactionId} timed out waiting for webhook, added to manual review`);
      });
    } catch (error) {
      this.logger.error(`Error processing timed out transaction ${transactionId}: ${error.message}`, error.stack);
    }
  }
} 