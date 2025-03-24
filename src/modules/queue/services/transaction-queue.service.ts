import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from '../queue.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { QueueError } from '../queue.error';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { TransactionRepository } from '../../wallet/repositories/transaction.repository';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class TransactionQueueService {
  private readonly logger = new Logger(TransactionQueueService.name);

  constructor(
    private readonly queueService: QueueService,
    @InjectQueue('transaction-processing')
    private readonly transactionQueue: Queue,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectRepository(TransactionRepository)
    private readonly transactionRepository: TransactionRepository,
  ) {}

  /**
   * Adds transaction ID to Redis SET and queues it if not already present
   * @param transactionId - The transaction ID to process
   * @returns Promise<boolean> - True if transaction was added, false if duplicate
   */
  async queueTransaction(transactionId: string): Promise<boolean> {
    try {
      const job = await this.addTransactionToQueue(transactionId);
      return !!job;
    } catch (error) {
      this.logger.error(`Failed to queue transaction: ${transactionId}`, error.stack);
      throw new QueueError(`Transaction queueing failed: ${error.message}`);
    }
  }

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

  async addTransactionToQueue(transactionId: string): Promise<Job> {
    // BullMQ automatically checks for existing job ID
    const existingJob = await this.transactionQueue.getJob(transactionId);
    
    if (existingJob) {
        this.logger.warn(`Transaction ${transactionId} already in queue`);
        return existingJob; // Prevents duplicate queue entries using Bull's native job ID check
    }

    // Check database for final state
    const transaction = await this.transactionRepository.findOne({
        where: { transactionId },
        select: ['status']
    });

    if (transaction?.status === TransactionStatus.COMPLETED) {
        this.logger.warn(`Transaction ${transactionId} already completed`);
        return null; // Database-level final state check
    }

    // Only add if passed both checks
    return this.transactionQueue.add(
        'process-transaction', 
        { transactionId },
        { jobId: transactionId } // Enforce ID uniqueness
    );
  }

  async recordFailedTransaction(transactionId: string, errorData: any): Promise<void> {
    const job = await this.transactionQueue.getJob(transactionId);
    if (job) {
      await job.moveToFailed(errorData, true);
    }
  }

  async completeTransaction(transactionId: string, metadata: any): Promise<void> {
    const job = await this.transactionQueue.getJob(transactionId);
    if (job) {
      await job.update({ ...job.data, metadata });
      await job.moveToCompleted(metadata, true);
    }
  }

  getRedisClient() {
    return this.redisService.getClient();
  }

  async getJob(transactionId: string): Promise<Job | null> {
    return this.transactionQueue.getJob(transactionId);
  }

  /**
   * Checks if a transaction is already in the queue
   * This is used by the recovery service to avoid duplicate queueing
   * 
   * @param transactionId - The transaction ID to check
   * @returns Boolean indicating if transaction is in the queue
   */
  async isTransactionQueued(transactionId: string): Promise<boolean> {
    try {
      const queue = this.transactionQueue;
      
      // Check active jobs (currently being processed)
      const activeJobs = await queue.getActive();
      const activeMatch = activeJobs.find(job => 
        job.data && job.data.transactionId === transactionId
      );
      
      if (activeMatch) {
        return true;
      }
      
      // Check waiting jobs (not yet processed)
      const waitingJobs = await queue.getWaiting();
      const waitingMatch = waitingJobs.find(job => 
        job.data && job.data.transactionId === transactionId
      );
      
      if (waitingMatch) {
        return true;
      }
      
      // Check delayed jobs (scheduled for future processing)
      const delayedJobs = await queue.getDelayed();
      const delayedMatch = delayedJobs.find(job => 
        job.data && job.data.transactionId === transactionId
      );
      
      return !!delayedMatch;
    } catch (error) {
      this.logger.error(`Error checking if transaction ${transactionId} is queued: ${error.message}`);
      // Default to false if there's an error checking the queue
      // This might result in duplicate queuing, but that's safer than missing transactions
      return false;
    }
  }
} 