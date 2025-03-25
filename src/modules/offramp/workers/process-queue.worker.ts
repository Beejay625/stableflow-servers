import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { RedlockService } from '../../redis/redlock.service';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { OfframpService } from '../offramp.service';
import { PrepareTransactionService } from '../preparetransaction.service';
import { Processor, Worker, Job } from 'bullmq';
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class OfframpQueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(OfframpQueueProcessor.name);
  private worker: Worker;
  private readonly QUEUE_NAME = 'offramp-transactions';
  private readonly LOCK_TTL = 60000; // 60 seconds

  constructor(
    private readonly redisService: RedisService,
    private readonly redlockService: RedlockService,
    private readonly queueService: QueueService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly offrampService: OfframpService,
    private readonly prepareTransactionService: PrepareTransactionService
  ) {}

  async onModuleInit() {
    // Initialize the worker to process jobs from the queue
    this.initializeWorker();
    this.logger.log(`Initialized offramp transaction queue processor`);
  }

  /**
   * Initialize the worker to process transactions from the queue
   */
  private initializeWorker() {
    try {
      // Get Redis connection from the service
      const connection = this.redisService.getClient();
      
      // Create a worker to process jobs from the queue
      this.worker = new Worker(
        this.QUEUE_NAME, 
        async (job) => this.processJob(job),
        { 
          connection,
          concurrency: 5,
          autorun: true
        }
      );

      // Set up event handlers
      this.worker.on('completed', job => {
        this.logger.log(`Job ${job.id} completed for transaction ${job.data.transactionId}`);
      });

      this.worker.on('failed', (job, error) => {
        this.logger.error(`Job ${job?.id} failed for transaction ${job?.data?.transactionId}: ${error.message}`, error.stack);
      });

      this.logger.log('Offramp transaction worker initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize offramp transaction worker: ${error.message}`, error.stack);
    }
  }

  /**
   * Process a job from the queue
   * @param job The job to process
   */
  private async processJob(job: Job) {
    const { transactionId } = job.data;
    
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    this.logger.log(`Processing transaction ${transactionId} from queue`);

    // Use a distributed lock to ensure atomic processing
    const lockResource = `offramp:transaction:${transactionId}`;
    
    try {
      return await this.redlockService.using(lockResource, this.LOCK_TTL, async () => {
        // Get the transaction from the database
        const transaction = await this.transactionRepository.findOne({
          where: { transactionId }
        });

        if (!transaction) {
          throw new Error(`Transaction ${transactionId} not found`);
        }

        // Check if transaction is still in UNSETTLED state
        if (transaction.status !== TransactionStatus.UNSETTLED) {
          this.logger.log(`Transaction ${transactionId} is no longer UNSETTLED (${transaction.status}), skipping`);
          return { status: 'skipped', reason: 'not_unsettled' };
        }

        // Check if transaction is already in processing
        const redisClient = this.redisService.getClient();
        const isAwaiting = await redisClient.hexists(
          'offramp:awaiting_webhook', 
          transaction.id
        );

        if (isAwaiting) {
          this.logger.log(`Transaction ${transactionId} is already awaiting webhook, skipping`);
          return { status: 'skipped', reason: 'already_awaiting' };
        }

        // Get prepared transaction data
        const preparedTransaction = await this.prepareTransactionService.prepareTransactionForOfframp(transactionId);
        
        // Process the transaction
        const result = await this.offrampService.processOrder(preparedTransaction);
        
        this.logger.log(`Transaction ${transactionId} processed with hash ${result.txHash}`);
        
        return { 
          status: 'completed', 
          txHash: result.txHash,
          orderId: result.orderId
        };
      });
    } catch (error) {
      this.logger.error(`Error processing transaction ${transactionId}: ${error.message}`, error.stack);
      throw error; // Rethrow to let BullMQ handle retry logic
    }
  }

  /**
   * Add a transaction to the processing queue
   * @param transactionId The ID of the transaction to process
   */
  async addToQueue(transactionId: string) {
    try {
      await this.queueService.addToQueue(this.QUEUE_NAME, { transactionId });
      this.logger.log(`Added transaction ${transactionId} to offramp processing queue`);
      return true;
    } catch (error) {
      this.logger.error(`Error adding transaction ${transactionId} to queue: ${error.message}`, error.stack);
      return false;
    }
  }
} 