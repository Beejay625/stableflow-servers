import { Injectable, Logger, Inject, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, DeepPartial } from "typeorm";
import { Business } from "../../business/entities/business.entity";
import { Transaction } from "../entities/transaction.entity";
import { TransactionStatus } from "../constants/status.enum";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../redis/redis.service";
import { QueueService } from "../../queue/queue.service";
import { WalletConfigService } from "../../../common/utils/wallet-config";
import { WebhookService } from "./webhook.service";
import { WebhookPayload } from "../interfaces/wallet.interface";

/**
 * Service for handling and processing crypto transactions
 * Manages the full lifecycle of transactions from receipt to settlement
 */
@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    private readonly walletConfigService: WalletConfigService,
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookService,
    // Optional injection for offramp service
    @Optional()
    @Inject('OfframpService')
    private readonly offrampService?: any,
  ) {}

  /**
   * Find business for a transaction based on recipient address
   * @param recipientAddress - The recipient wallet address
   * @returns Promise<Business> - The business entity if found
   */
  async findBusinessForTransaction(
    recipientAddress: string,
  ): Promise<Business> {
    if (!recipientAddress) {
      this.logger.warn("No recipient address provided");
      return null;
    }

    const business = await this.businessRepository.findOne({
      where: { walletAddress: recipientAddress },
    });

    if (!business) {
      this.logger.warn(
        `No business found for recipient address ${recipientAddress}`,
      );
      return null;
    }

    this.logger.log(
      `Found business ${business.id} for address ${recipientAddress}`,
    );
    return business;
  }

  /**
   * Save transaction to a business and queue it for processing
   * @param payload - The webhook payload containing transaction data
   * @param business - The business entity
   * @param shouldQueue - Whether to queue the transaction for processing (defaults to true)
   * @returns Promise<Transaction> - The saved transaction
   */
  async saveTransactionToBusiness(
    payload: WebhookPayload,
    business: Business,
    shouldQueue: boolean = true,
  ): Promise<Transaction> {
    const transactionId = payload.data?.id;
    
    // Extract webhook data using the WebhookService
    const webhookData = this.webhookService.extractWebhookData(payload);

    try {
      // Use transaction for DB operations
      const result = await this.dataSource.transaction(
        async (transactionalEntityManager) => {
          // Check for duplicate using transactionId as idempotency key
          const existingTx = await transactionalEntityManager
            .getRepository(Transaction)
            .findOne({
              where: { transactionId },
              select: ["id", "status"],
            });

          if (existingTx) {
            // If exists and Unsettled, ensure it's in Redis queue if shouldQueue is true
            if (
              existingTx.status === TransactionStatus.UNSETTLED &&
              shouldQueue
            ) {
              const isInQueue = await this.redisService.get(
                `tx:${transactionId}`,
              );
              if (!isInQueue) {
                await this.queueService.addToQueue("transaction-processing", {
                  transactionId,
                  status: TransactionStatus.UNSETTLED,
                });
                await this.redisService.setKey(
                  `tx:${transactionId}`,
                  "queued",
                  86400,
                ); // 24 hours expiry
              }
            }
            return existingTx;
          }

          // Save transaction with Unsettled status
          const transaction = await transactionalEntityManager
            .getRepository(Transaction)
            .save({
              transactionId,
              businessId: business.id,
              tokenAmount: parseFloat(payload.data?.amount || "0"),
              token: payload.data?.asset?.symbol || payload.data?.currency,
              chain: webhookData.chain,
              status: TransactionStatus.UNSETTLED,
              senderAddress: payload.data?.senderAddress || "unknown",
              businessAddress: payload.data?.recipientAddress,
              addressId: business.addressId,
              metadata: payload.data,
              receivedAt: new Date(),
            } as DeepPartial<Transaction>);

          // Add to queue and Redis after successful save if shouldQueue is true
          if (shouldQueue) {
            await this.queueService.addToQueue("transaction-processing", {
              transactionId,
              status: TransactionStatus.UNSETTLED,
            });
            await this.redisService.setKey(
              `tx:${transactionId}`,
              "queued",
              86400,
            ); // 24 hours expiry
            this.logger.log(`Transaction ${transactionId} saved and queued`);
          } else {
            this.logger.log(
              `Transaction ${transactionId} saved but not queued (business inactive or not approved)`,
            );
          }

          return transaction;
        },
      );

      return result as Transaction;
    } catch (error) {
      this.logger.error(`Error saving transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transactions for a specific business with pagination
   * @param businessId - The business ID
   * @param page - Page number (default: 1)
   * @param limit - Number of items per page (default: 10)
   * @returns Promise<{ transactions: Transaction[]; total: number }> - Paginated transactions
   */
  async getTransactionsByBusinessId(
    businessId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const skip = (page - 1) * limit;

    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        where: { businessId },
        order: { receivedAt: "DESC" },
        skip,
        take: limit,
      },
    );

    return { transactions, total };
  }

  /**
   * Get transaction statistics for analytics
   * Returns summary data about transaction counts, status, and values
   */
  async getTransactionStats() {
    // Count transactions by status (processing, completed, failed, etc.)
    const statusCounts = await this.transactionRepository
      .createQueryBuilder("transaction")
      .select("transaction.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("transaction.status")
      .getRawMany();

    // Calculate total transaction value across the system
    const totalAmountResult = await this.transactionRepository
      .createQueryBuilder("transaction")
      .select("SUM(transaction.tokenAmount)", "total")
      .getRawOne();

    // Get recent transactions (last 30 days) for trend analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCount = await this.transactionRepository.count({
      where: {
        receivedAt: new Date(thirtyDaysAgo),
      },
    });

    // Identify top 5 businesses by transaction volume
    const businessCounts = await this.transactionRepository
      .createQueryBuilder("transaction")
      .select("transaction.businessId", "businessId")
      .addSelect("COUNT(*)", "count")
      .groupBy("transaction.businessId")
      .orderBy("count", "DESC")
      .limit(5)
      .getRawMany();

    // Structure and return the aggregated data
    return {
      status: statusCounts.reduce((acc, curr) => {
        acc[curr.status] = parseInt(curr.count, 10);
        return acc;
      }, {}),
      total: {
        count: await this.transactionRepository.count(),
        amount: parseFloat(totalAmountResult?.total || "0"),
      },
      recent: {
        last30Days: recentCount,
      },
      byBusiness: businessCounts,
    };
  }

  /**
   * Mark a transaction as completed manually
   * Used for administrative actions to complete transactions in exceptional circumstances
   */
  async completeTransaction(
    transactionId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string; transaction: Transaction }> {
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId },
    });

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Update status and add audit information in metadata for accountability
    transaction.status = "SETTLED";
    transaction.metadata = {
      ...(transaction.metadata || {}),
      manuallyCompleted: true,
      completedBy: userId,
      completedAt: new Date().toISOString(),
    };

    // Save the updated transaction with the audit trail
    const result = await this.transactionRepository.save(transaction);

    return {
      success: true,
      message: `Transaction ${transactionId} manually marked as completed`,
      transaction: result,
    };
  }
} 