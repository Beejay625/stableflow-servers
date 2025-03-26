import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { TransactionStatus } from '../constants/status.enum';
import { TransactionQueueService } from '../../queue/services/transaction-queue.service';
import { ConfigService } from '@nestjs/config';

/**
 * Service responsible for recovering any UNSETTLED transactions that
 * were successfully saved to the database but failed to be added to the
 * processing queue.
 * 
 * This implements the "Transactional Outbox" pattern's recovery mechanism
 * to ensure eventual consistency between the database and queue.
 */
@Injectable()
export class TransactionRecoveryService {
  private readonly logger = new Logger(TransactionRecoveryService.name);
  private readonly recoveryAgeMinutes: number;
  private readonly isProduction: boolean;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly transactionQueue: TransactionQueueService,
    private readonly configService: ConfigService,
  ) {
    // Time threshold before attempting recovery (default: 10 minutes)
    this.recoveryAgeMinutes = parseInt(
      this.configService.get<string>('TRANSACTION_RECOVERY_AGE_MINUTES', '10'),
      10
    );
    
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    
    this.logger.log(
      `Transaction recovery service initialized. Will recover transactions older than ${this.recoveryAgeMinutes} minutes.`
    );
  }

  /**
   * Runs every 5 minutes to check for UNSETTLED transactions that weren't
   * properly queued, and adds them to the processing queue.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1PM)
  async recoverUnprocessedTransactions() {
    this.logger.log('Starting recovery scan for unprocessed transactions...');
    
    try {
      // Calculate cutoff time (e.g., transactions older than 10 minutes)
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - this.recoveryAgeMinutes);
      
      // Find UNSETTLED transactions older than the cutoff time
      const unprocessedTransactions = await this.transactionRepository.find({
        where: {
          status: TransactionStatus.UNSETTLED,
          receivedAt: LessThan(cutoffTime)
        },
        select: ['id', 'transactionId', 'businessAddress', 'receivedAt']
      });
      
      if (unprocessedTransactions.length === 0) {
        this.logger.debug('No unprocessed transactions found requiring recovery.');
        return;
      }
      
      this.logger.log(`Found ${unprocessedTransactions.length} potential transactions to recover.`);
      
      // Track recovery metrics
      let recoveredCount = 0;
      let alreadyQueuedCount = 0;
      
      // Process each unprocessed transaction
      for (const tx of unprocessedTransactions) {
        // Check if transaction is already in the queue
        const isQueued = await this.transactionQueue.isTransactionQueued(tx.transactionId);
        
        if (!isQueued) {
          // Add to queue if not already queued
          await this.transactionQueue.queueTransaction(tx.transactionId);
          this.logger.log(
            `Recovered transaction ${tx.transactionId} received at ${tx.receivedAt.toISOString()}`
          );
          recoveredCount++;
        } else {
          alreadyQueuedCount++;
          this.logger.debug(`Transaction ${tx.transactionId} already in queue, skipping.`);
        }
      }
      
      // Log recovery summary
      this.logger.log(
        `Recovery scan complete. Recovered: ${recoveredCount}, Already queued: ${alreadyQueuedCount}`
      );
      
    } catch (error) {
      this.logger.error(`Error in transaction recovery: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual recovery method for explicit recovery calls (e.g., from admin endpoints)
   * @param olderThanMinutes - Override the default age threshold
   * @returns Summary of recovery operations
   */
  async manualRecovery(olderThanMinutes: number = this.recoveryAgeMinutes) {
    this.logger.log(`Manual recovery triggered for transactions older than ${olderThanMinutes} minutes.`);
    
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - olderThanMinutes);
    
    const unprocessedTransactions = await this.transactionRepository.find({
      where: {
        status: TransactionStatus.UNSETTLED,
        receivedAt: LessThan(cutoffTime)
      }
    });
    
    let recovered = 0;
    let alreadyQueued = 0;
    
    for (const tx of unprocessedTransactions) {
      const isQueued = await this.transactionQueue.isTransactionQueued(tx.transactionId);
      
      if (!isQueued) {
        await this.transactionQueue.queueTransaction(tx.transactionId);
        recovered++;
      } else {
        alreadyQueued++;
      }
    }
    
    return {
      scannedCount: unprocessedTransactions.length,
      recoveredCount: recovered,
      alreadyQueuedCount: alreadyQueued,
      cutoffTime: cutoffTime.toISOString()
    };
  }
} 