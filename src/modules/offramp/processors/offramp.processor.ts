import { Process, Processor } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Transaction } from "../../wallet/entities/transaction.entity";
import { MailService } from "../../../common/utils/email";
import { PrepareTransactionService } from "../preparetransaction.service";
import { OfframpService } from "../services/offramp.service";
import { TransactionStatus } from "../../wallet/constants/status.enum";
import { RedisService } from "../../redis/redis.service";

/**
 * Processor for handling offramp operations for transactions
 * This processor takes UNSETTLED transactions from the queue and processes them through the offramp service
 */
@Injectable()
@Processor("transaction-processing")
export class OfframpProcessor {
  private readonly logger = new Logger(OfframpProcessor.name);

  constructor(
    private readonly prepareTransactionService: PrepareTransactionService,
    private readonly offrampService: OfframpService,
    private readonly redisService: RedisService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly mailService: MailService,
  ) {
    this.logger.log("Offramp processor initialized");
  }

  /**
   * Process offramp for unsettled transactions from the queue
   * @param job - The job data containing the transaction ID and status
   */
  @Process("process")
  async processOfframp(
    job: Job<{ transactionId: string; status: TransactionStatus }>,
  ) {
    const { transactionId } = job.data;
    this.logger.log(`Processing offramp for transaction: ${transactionId}`);

    try {
      // Find transaction by transactionId (our idempotency key)
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId },
      });

      if (!transaction) {
        this.logger.warn(`Transaction ${transactionId} not found in database, skipping`);
        return { success: false, error: "Transaction not found" };
      }

      // Check if transaction is still queued in Redis
      const isQueued = await this.redisService.get(`tx:${transactionId}`);
      if (!isQueued) {
        this.logger.warn(`Transaction ${transactionId} not found in Redis queue, skipping`);
        return { success: false, error: "Transaction not in queue" };
      }

      // Check if transaction is still in UNSETTLED state
      if (transaction.status !== TransactionStatus.UNSETTLED) {
        this.logger.warn(`Transaction ${transactionId} is not in UNSETTLED state (${transaction.status}), skipping`);
        return { success: false, error: "Transaction not in UNSETTLED state" };
      }

      // Process the offramp using the transaction ID
      // processOrder will handle preparation internally
      const result = 
        await this.offrampService.processOrder(transactionId);

      if (result.status !== TransactionStatus.FAILED) {
        this.logger.log(`Successfully initiated offramp processing for transaction ${transactionId}, status: ${result.status}`);
        // Remove from Redis queue only if processing initiated successfully (not FAILED immediately)
        await this.redisService.del(`tx:${transactionId}`);
        return { success: true, status: result.status };
      } else {
        // If processOrder returned FAILED immediately, handle the error
        const updatedTransaction = await this.transactionRepository.findOne({
          where: { transactionId },
        });
        const errorMessage =
          updatedTransaction?.metadata?.offramp?.failureReason ||
          "Unknown error during offramp";
        
        this.logger.error(`Offramp processing failed immediately for ${transactionId}: ${errorMessage}`);

        // Send alert for immediate failures
        await this.mailService.sendMail(
          "dev-alerts@stableflow.com",
          "CRITICAL: Offramp Processing Immediate Failure",
          {
            text: `Transaction ${transactionId} failed offramp processing immediately.\nReason: ${errorMessage}`,
          },
        );

        // Remove from Redis queue even on immediate failure to prevent retries
        await this.redisService.del(`tx:${transactionId}`);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      this.logger.error(`Unhandled error processing offramp for transaction ${transactionId}: ${error.message}`, error.stack);
      
      // Attempt to update the transaction as failed with a generic error
      try {
        await this.transactionRepository.update(
          { transactionId },
          {
            status: TransactionStatus.FAILED,
            metadata: {
              ...(await this.transactionRepository.findOne({ where: { transactionId } })).metadata,
              offramp: {
                ...(await this.transactionRepository.findOne({ where: { transactionId } })).metadata?.offramp,
                failureReason: "Unhandled processor error",
                error: error.message,
                failedAt: new Date().toISOString(),
              },
            },
          },
        );
      } catch (dbError) {
        this.logger.error(`Failed to update transaction ${transactionId} status after unhandled processor error: ${dbError.message}`);
      }
      
      // Remove from Redis queue on unhandled error
      await this.redisService.del(`tx:${transactionId}`);
      // Return error information without retrying
      return { success: false, error: `Unhandled processor error: ${error.message}` };
    }
  }
}
