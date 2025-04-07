import { Process, Processor } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Transaction } from "../../wallet/entities/transaction.entity";
import { MailService } from "../../../common/utils/email";
import { PrepareTransactionService } from "../preparetransaction.service";
import { OfframpService } from "../offramp.service";
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
        this.logger.warn(
          `Transaction ${transactionId} not found in database, skipping`,
        );
        return { success: false, error: "Transaction not found" };
      }

      // Check if transaction is still queued in Redis
      const isQueued = await this.redisService.get(`tx:${transactionId}`);
      if (!isQueued) {
        this.logger.warn(
          `Transaction ${transactionId} not found in Redis queue, skipping`,
        );
        return { success: false, error: "Transaction not in queue" };
      }

      // Check if transaction is still in UNSETTLED state
      if (transaction.status !== TransactionStatus.UNSETTLED) {
        this.logger.warn(
          `Transaction ${transactionId} is not in UNSETTLED state (${transaction.status}), skipping`,
        );
        await this.redisService.del(`tx:${transactionId}`);
        return { success: false, error: "Transaction not in UNSETTLED state" };
      }

      // Prepare transaction for offramp
      const preparedTransaction =
        await this.prepareTransactionService.prepareTransactionForOfframp(
          transactionId,
        );

      // Process the offramp
      const result =
        await this.offrampService.processOrder(preparedTransaction);

      if (result.status !== TransactionStatus.UNSETTLED) {
        // Remove from Redis queue on success
        await this.redisService.del(`tx:${transactionId}`);
        this.logger.log(
          `Successfully processed offramp for transaction ${transactionId}`,
        );
        return { success: true };
      } else {
        // If still UNSETTLED, check for terminal errors
        const updatedTransaction = await this.transactionRepository.findOne({
          where: { transactionId },
        });
        const errorMessage =
          updatedTransaction?.metadata?.offramp?.errors?.[0]?.message ||
          "Unknown error during offramp";

        // For non-terminal errors, keep in queue and retry
        if (!updatedTransaction?.metadata?.offramp?.errors?.[0]?.isTerminal) {
          this.logger.warn(
            `Non-terminal error for transaction ${transactionId}, will retry: ${errorMessage}`,
          );
          throw new Error(errorMessage); // This will trigger Bull's retry mechanism
        }

        // For terminal errors, update status and send alert
        await this.transactionRepository.update(
          { transactionId },
          {
            status: TransactionStatus.FAILED,
            metadata: {
              ...updatedTransaction?.metadata,
              offramp: {
                ...updatedTransaction?.metadata?.offramp,
                finalError: errorMessage,
                failedAt: new Date().toISOString(),
              },
            },
          },
        );

        // Remove from Redis queue
        await this.redisService.del(`tx:${transactionId}`);

        // Send alert for terminal errors
        await this.mailService.sendMail(
          "dev-alerts@stableflow.com",
          "CRITICAL: Offramp Processing Failure",
          {
            text: `Transaction ${transactionId} failed offramp processing.\nError: ${errorMessage}`,
          },
        );

        return { success: false, error: errorMessage };
      }
    } catch (error) {
      this.logger.error(
        `Error processing offramp for transaction ${transactionId}: ${error.message}`,
        error.stack,
      );

      // Let Bull handle the retry
      throw error;
    }
  }
}
