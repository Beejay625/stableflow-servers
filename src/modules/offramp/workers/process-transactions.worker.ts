import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { RedlockService } from '../../redis/redlock.service';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { OfframpService } from '../offramp.service';
import { PrepareTransactionService } from '../preparetransaction.service';

@Injectable()
export class ProcessTransactionsWorker {
  private readonly logger = new Logger(ProcessTransactionsWorker.name);
  private readonly REDIS_NEW_TRANSACTIONS = 'offramp:new_transactions';
  private readonly LOCK_TTL = 60000; // 60 seconds
  private readonly BATCH_SIZE = 10;
  private isProcessing = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly redlockService: RedlockService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly offrampService: OfframpService,
    private readonly prepareTransactionService: PrepareTransactionService
  ) {}

  /**
   * Cron job that runs every minute to process UNSETTLED transactions
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processUnsettledTransactions() {
    // Prevent overlapping processing
    if (this.isProcessing) {
      this.logger.log('Already processing unsettled transactions, skipping');
      return;
    }

    try {
      this.isProcessing = true;
      this.logger.log('Checking for UNSETTLED transactions to process');

      // Find transactions to process
      const transactions = await this.transactionRepository.find({
        where: { 
          status: TransactionStatus.UNSETTLED,
          offrampOrderId: null // Ensure we don't reprocess ones already sent
        },
        take: this.BATCH_SIZE,
        order: { receivedAt: 'ASC' } // Process oldest first
      });

      if (transactions.length === 0) {
        this.logger.log('No UNSETTLED transactions to process');
        return;
      }

      this.logger.log(`Found ${transactions.length} UNSETTLED transactions to process`);

      // Process each transaction with a lock to prevent duplicate processing
      for (const transaction of transactions) {
        const lockResource = `offramp:transaction:${transaction.id}`;
        try {
          await this.redlockService.using(lockResource, this.LOCK_TTL, async () => {
            // Double-check transaction is still UNSETTLED
            const freshTransaction = await this.transactionRepository.findOne({
              where: { id: transaction.id }
            });

            if (!freshTransaction || freshTransaction.status !== TransactionStatus.UNSETTLED) {
              this.logger.log(`Transaction ${transaction.id} is no longer UNSETTLED, skipping`);
              return;
            }

            // Check if transaction is already in an awaiting_webhook state in Redis
            const redisClient = this.redisService.getClient();
            const isAwaiting = await redisClient.hexists(
              'offramp:awaiting_webhook', 
              transaction.id
            );

            if (isAwaiting) {
              this.logger.log(`Transaction ${transaction.id} is already awaiting webhook, skipping`);
              return;
            }

            // Get prepared transaction data
            try {
              this.logger.log(`Processing transaction ${transaction.id}`);
              const preparedTransaction = await this.prepareTransactionService.prepareTransactionForOfframp(transaction.transactionId);
              
              // Process the transaction
              const result = await this.offrampService.processOrder(preparedTransaction);
              
              this.logger.log(`Transaction ${transaction.id} processed with hash ${result.txHash}`);
            } catch (error) {
              this.logger.error(`Error processing transaction ${transaction.id}: ${error.message}`, error.stack);
            }
          });
        } catch (lockError) {
          this.logger.warn(`Could not acquire lock for transaction ${transaction.id}: ${lockError.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing UNSETTLED transactions: ${error.message}`, error.stack);
    } finally {
      this.isProcessing = false;
    }
  }
} 