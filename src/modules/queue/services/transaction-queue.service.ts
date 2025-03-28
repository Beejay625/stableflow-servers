import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { RedisService } from '../../redis/redis.service';
import { QueueError } from '../queue.error';
import { TransactionRepository } from '../../wallet/repositories/transaction.repository';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class TransactionQueueService {
  private readonly logger = new Logger(TransactionQueueService.name);

  constructor(
    @InjectQueue('transaction-processing')
    private readonly transactionQueue: Queue,
    private readonly redisService: RedisService,
    @InjectRepository(TransactionRepository)
    private readonly transactionRepository: TransactionRepository,
  ) {}

  /**
   * Get transactions currently being processed
   * @returns Promise<any[]> - List of processing transactions
   */
  async getProcessingTransactions(): Promise<any[]> {
    try {
      const activeJobs = await this.transactionQueue.getActive();
      return activeJobs.map(job => ({
        id: job.id,
        data: job.data,
        processedOn: job.processedOn ? new Date(job.processedOn) : null,
        duration: job.processedOn ? (Date.now() - job.processedOn) : null,
      }));
    } catch (error) {
      this.logger.error(`Error fetching processing transactions: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get failed transactions
   * @returns Promise<any[]> - List of failed transactions
   */
  async getFailedTransactions(): Promise<any[]> {
    try {
      const failedJobs = await this.transactionQueue.getFailed();
      return failedJobs.map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        failedAt: job.finishedOn ? new Date(job.finishedOn) : null,
        attemptsMade: job.attemptsMade,
      }));
    } catch (error) {
      this.logger.error(`Error fetching failed transactions: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Retry a failed transaction
   * @param transactionId - The ID of the transaction to retry
   * @returns Promise<boolean> - Whether the transaction was requeued successfully
   */
  async retryTransaction(transactionId: string): Promise<boolean> {
    try {
      // Find the failed job first
      const failedJobs = await this.transactionQueue.getFailed();
      const job = failedJobs.find(job => job.data.transactionId === transactionId);
      
      if (!job) {
        this.logger.warn(`Failed job for transaction ${transactionId} not found`);
        return false;
      }
      
      // Retry the job
      await job.retry();
      this.logger.log(`Transaction ${transactionId} requeued for processing`);
      return true;
    } catch (error) {
      this.logger.error(`Error retrying transaction ${transactionId}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Checks if a transaction is already in the queue
   * @param transactionId - The transaction ID to check
   * @returns Boolean indicating if transaction is in the queue
   */
  async isTransactionQueued(transactionId: string): Promise<boolean> {
    try {
      const queue = this.transactionQueue;
      
      // Check active jobs (currently being processed)
      const activeJobs = await queue.getActive();
      if (activeJobs.find(job => job.data?.transactionId === transactionId)) {
        return true;
      }
      
      // Check waiting jobs (not yet processed)
      const waitingJobs = await queue.getWaiting();
      if (waitingJobs.find(job => job.data?.transactionId === transactionId)) {
        return true;
      }
      
      // Check delayed jobs (scheduled for future processing)
      const delayedJobs = await queue.getDelayed();
      return !!delayedJobs.find(job => job.data?.transactionId === transactionId);
    } catch (error) {
      this.logger.error(`Error checking if transaction ${transactionId} is queued: ${error.message}`);
      return false;
    }
  }
} 