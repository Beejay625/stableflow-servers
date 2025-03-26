import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { MailService } from '../../../common/utils/email';
import { PrepareTransactionService } from '../preparetransaction.service';
import { OfframpService } from '../offramp.service';
import { TransactionStatus } from '../../wallet/constants/status.enum';

/**
 * Processor for handling offramp operations for transactions
 * This processor takes UNSETTLED transactions and processes them through the offramp service
 */
@Injectable()
@Processor('transactions')
export class OfframpProcessor {
  private readonly logger = new Logger(OfframpProcessor.name);

  constructor(
    private readonly prepareTransactionService: PrepareTransactionService,
    private readonly offrampService: OfframpService,
    private readonly configService: ConfigService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly mailService: MailService
  ) {
    this.logger.log('Offramp processor initialized');
  }

  /**
   * Process offramp for unsettled transactions
   * @param job - The job data containing the transaction ID
   */
  @Process({
    name: 'process-transaction',
    concurrency: 5
  })
  async processOfframp(job: Job<{ transactionId: string }>) {
    const { transactionId } = job.data;
    this.logger.log(`Processing offramp for transaction: ${transactionId}`);

    try {
      // Prepare transaction for offramp
      const preparedTransaction = await this.prepareTransactionService.prepareTransactionForOfframp(transactionId);
      
      // Update status to processing
      await this.transactionRepository.update(
        { transactionId },
        { 
          status: TransactionStatus.PROCESSING,
          metadata: { 
            ...preparedTransaction,
            processingStartedAt: new Date().toISOString() 
          }
        }
      );

      // Process the offramp
      const offrampResult = await this.offrampService.processOfframp(preparedTransaction);

      // Update transaction with offramp result
      await this.transactionRepository.update(
        { transactionId },
        { 
          status: TransactionStatus.SETTLED,
          metadata: { 
            ...preparedTransaction,
            ...offrampResult,
            settledAt: new Date().toISOString()
          }
        }
      );

      this.logger.log(`Successfully processed offramp for transaction ${transactionId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error processing offramp for transaction ${transactionId}: ${error.message}`,
        error.stack
      );

      // Only update status if it's a terminal error
      if (error.isTerminal) {
        await this.transactionRepository.update(
          { transactionId },
          { 
            status: TransactionStatus.FAILED,
            metadata: { 
              error: error.message,
              failedAt: new Date().toISOString()
            }
          }
        );

        // Send alert for terminal errors
        await this.mailService.sendMail(
          'dev-alerts@stableflow.com',
          'CRITICAL: Offramp Processing Failure',
          {
            text: `Transaction ${transactionId} failed offramp processing.\nError: ${error.message}`
          }
        );
      }

      return { success: false, error: error.message };
    }
  }
} 