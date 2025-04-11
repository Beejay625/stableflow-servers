import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

import { Transaction } from '../../wallet/entities/transaction.entity';
import { OfframpTransaction } from '../entities/offramp-transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { RedisService } from '../../redis/redis.service';
import { QueueService } from '../../queue/queue.service';

/**
 * Failed Recovery Processor
 * 
 * Handles transactions that failed during the offramp process:
 * 1. When custom write API calls fail
 * 2. When blockchain calls fail
 * 
 * The processor atomically:
 * - Updates the transaction status back to UNSETTLED
 * - Adds it back to the normal processing queue
 * - Records the recovery attempt
 */
@Injectable()
@Processor('failed-recovery')
export class FailedRecoveryProcessor {
  private readonly logger = new Logger(FailedRecoveryProcessor.name);
  
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(OfframpTransaction)
    private readonly offrampTransactionRepository: Repository<OfframpTransaction>,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    private readonly connection: Connection
  ) {}
  
  /**
   * Process failed transactions by resetting them to UNSETTLED and
   * returning them to the normal processing queue
   * 
   * @param job The job containing the transaction data
   * @returns Object indicating success or failure
   */
  @Process('retry-failed')
  async processFailedTransaction(
    job: Job<{ transactionId: string, error?: string, context?: string }>
  ) {
    const { transactionId, error, context } = job.data;
    
    this.logger.log(`Starting failed recovery for transaction ${transactionId}`);
    
    try {
      // Check if transaction exists and is in FAILED state
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId }
      });
      
      if (!transaction) {
        this.logger.warn(`Transaction ${transactionId} not found, cannot process failed recovery`);
        return { success: false, error: 'Transaction not found' };
      }
      
      // Skip if not in FAILED state - this prevents double processing
      if (transaction.status !== TransactionStatus.FAILED) {
        this.logger.log(`Transaction ${transactionId} is in ${transaction.status} state, not FAILED. Skipping recovery.`);
        return { 
          success: true, 
          message: `Transaction ${transactionId} is not in FAILED state, no action needed` 
        };
      }
      
      // Perform all database operations in a transaction for atomicity
      await this.connection.transaction(async manager => {
        // 1. Update main transaction
        await manager.update(
          Transaction,
          { id: transaction.id },
          { 
            status: TransactionStatus.UNSETTLED,
            metadata: {
              ...(transaction.metadata || {}),
              recovery: {
                ...((transaction.metadata?.recovery as object) || {}),
                lastRecoveryAttempt: new Date().toISOString(),
                previousError: error || 'Unknown error',
                previousContext: context || 'Failed offramp',
                recoveryCount: ((transaction.metadata?.recovery?.recoveryCount as number) || 0) + 1
              }
            }
          }
        );
        
        // 2. Update related offramp transaction if it exists
        const offrampTransaction = await this.offrampTransactionRepository.findOne({
          where: { transactionId: transaction.id }
        });
        
        if (offrampTransaction) {
          await manager.update(
            OfframpTransaction,
            { id: offrampTransaction.id },
            { 
              status: TransactionStatus.UNSETTLED,
              metadata: {
                ...(offrampTransaction.metadata || {}),
                recovery: {
                  ...((offrampTransaction.metadata?.recovery as object) || {}),
                  lastRecoveryAttempt: new Date().toISOString(),
                  previousStatus: offrampTransaction.status,
                  recoveryCount: ((offrampTransaction.metadata?.recovery?.recoveryCount as number) || 0) + 1
                }
              }
            }
          );
        }
      });
      
      // After successful database update, add to the normal processing queue
      await this.queueService.addToQueue("transaction-processing", {
        transactionId,
        status: TransactionStatus.UNSETTLED,
        isRecovery: true
      }, {
        priority: 1, // Highest priority (lower number means higher priority)
        lifo: true   // Last In, First Out - puts job at the front of the queue
      });
      
      // Track recovery attempt in Redis
      const recoveryKey = `failed-recovery:${transactionId}`;
      const attempts = await this.redisService.get(recoveryKey);
      const currentAttempts = attempts ? parseInt(attempts) : 0;
      await this.redisService.setKey(recoveryKey, (currentAttempts + 1).toString(), 86400); // 24 hours TTL
      
      this.logger.log(`Recovery attempt ${currentAttempts + 1} completed for failed transaction ${transactionId}`);
      
      return { 
        success: true, 
        message: `Failed transaction ${transactionId} recovered and returned to processing queue`
      };
    } catch (error) {
      this.logger.error(`Error in failed recovery for ${transactionId}: ${error.message}`, error.stack);
      return { 
        success: false, 
        error: `Failed recovery error: ${error.message}`
      };
    }
  }
}
