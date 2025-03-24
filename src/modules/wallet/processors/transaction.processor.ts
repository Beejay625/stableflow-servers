import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { SortTransactionService } from '../services/sort.transaction.service';
import { TransactionQueueService } from '../../queue/services/transaction-queue.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Business } from '../../business/entities/business.entity';
import { RedlockService } from '../../redis/redlock.service';
import { TransactionStatus } from '../constants/status.enum';
import { MailService } from '../../../common/utils/email';
import { Not } from 'typeorm';
import { GetTransactionService } from '../services/gettransaction.service';

/**
 * Processor for transaction jobs from the queue
 */
@Injectable()
@Processor('transactions')
export class TransactionProcessor {
  private readonly logger = new Logger(TransactionProcessor.name);
  private readonly maxJobConcurrency: number;
  private readonly retryOnError: boolean;

  constructor(
    private readonly sortTransactionService: SortTransactionService,
    private readonly getTransactionService: GetTransactionService,
    private readonly configService: ConfigService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly redlockService: RedlockService,
    private readonly mailService: MailService
  ) {
    // Load configuration values with sensible defaults
    this.maxJobConcurrency = parseInt(
      this.configService.get<string>('TRANSACTION_CONCURRENCY', '10'),
      10
    );
    
    this.retryOnError = this.configService.get<string>('RETRY_TRANSACTIONS', 'true') === 'true';
    
    this.logger.log(`Transaction processor initialized with concurrency: ${this.maxJobConcurrency}`);
    this.logger.log(`Transaction retry on error: ${this.retryOnError ? 'enabled' : 'disabled'}`);
  }

  /**
   * Process transaction jobs from the queue
   * @param job - The job data containing the transaction ID
   */
  @Process({
    name: 'process-transaction',
    concurrency: 5
  })
  async processTransaction(job: Job<{ transactionId: string }>) {
    const { transactionId } = job.data;
    this.logger.log(`Processing transaction with ID: ${transactionId}`);

    try {
      // Fetch transaction data
      const transactionData = await this.sortTransactionService.fetchTransactionDetails(
        transactionId,
      );

      // EARLY RETURN: Skip non-deposit.success events silently
      if (transactionData.type !== 'deposit.success') {
        return { success: true, skipped: true, reason: 'non-deposit.success event' };
      }

      // Find the business for this transaction
      const business = await this.sortTransactionService.findBusinessForTransaction(
        transactionData,
      );

      if (!business) {
        this.logger.error(`No business found for transaction ${transactionId}`);
        return { success: false, error: 'No business found for transaction' };
      }

      // Save or update the transaction with properly extracted walletId
      await this.sortTransactionService.saveTransactionToBusiness(
        transactionData.id,
        business,
        transactionData.amount,
        transactionData.token,
        transactionData.blockchain,
        transactionData.businessAddress,
        business.addressId,
        transactionData,
        transactionData.senderAddress || 'unknown',
        transactionData.walletId || null,
      );

      this.logger.log(`Successfully processed transaction ${transactionId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error processing transaction ${transactionId}: ${error.message}`,
        error.stack,
      );
      return { success: false, error: error.message };
    }
  }

  private async handleFailedJob(job: Job, error: any) {
    const attemptsLeft = job.opts.attempts - job.attemptsMade;
    
    if (attemptsLeft <= 1) {
      await this.mailService.sendMail(
        'dev-alerts@stableflow.com',
        'CRITICAL: Transaction Processing Failure',
        {
          text: `Transaction ${job.id} failed final attempt.\nError: ${error.message}`
        }
      );
    }
  }
} 