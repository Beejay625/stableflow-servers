import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { Transaction } from '../entities/transaction.entity';

import { TransactionStatus } from '../constants/status.enum';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { QueueService } from '../../queue/queue.service';
import { WalletConfigService } from '../../../common/utils/wallet-config';

// Import the OfframpService
import { OfframpService } from '../../offramp/offramp.service';



@Injectable()
export class SortTransactionService {
  private readonly logger = new Logger(SortTransactionService.name);

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
    // Inject the OfframpService as an optional dependency
    @Optional() @Inject(OfframpService) private readonly offrampService?: OfframpService
  ) {}

  /**
   * Find business for a transaction based on recipient address using the same logic as webhook handler
   * @param recipientAddress - The recipient wallet address
   * @returns Promise<Business> - The business entity if found
   */
  async findBusinessForTransaction(recipientAddress: string): Promise<Business> {
    if (!recipientAddress) {
      this.logger.warn('No recipient address provided');
      return null;
    }

    const business = await this.businessRepository.findOne({
      where: { walletAddress: recipientAddress }
    });

    if (!business) {
      this.logger.warn(`No business found for recipient address ${recipientAddress}`);
      return null;
    }

    this.logger.log(`Found business ${business.id} for address ${recipientAddress}`);
    return business;
  }

  /**
   * Save transaction to a business and queue it for processing using the same logic as webhook handler
   * @param payload - The webhook payload containing transaction data
   * @param business - The business entity
   * @param shouldQueue - Whether to queue the transaction for processing (defaults to true)
   * @returns Promise<Transaction> - The saved transaction
   */
  async saveTransactionToBusiness(
    payload: any,
    business: Business,
    shouldQueue: boolean = true
  ): Promise<Transaction> {
    const transactionId = payload.data?.id;

    try {
      // Start transaction
      return await this.dataSource.transaction(async (transactionalEntityManager) => {
        // Check for duplicate using transactionId as idempotency key
        const existingTx = await transactionalEntityManager
          .getRepository(Transaction)
          .findOne({
            where: { transactionId },
            select: ['id', 'status']
          });

        if (existingTx) {
          // If exists and Unsettled, ensure it's in Redis queue if shouldQueue is true
          if (existingTx.status === TransactionStatus.UNSETTLED && shouldQueue) {
            const isInQueue = await this.redisService.get(`tx:${transactionId}`);
            if (!isInQueue) {
              await this.queueService.addToQueue('transaction-processing', {
                transactionId,
                status: TransactionStatus.UNSETTLED
              });
              await this.redisService.setKey(`tx:${transactionId}`, 'queued', 86400); // 24 hours expiry
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
            tokenAmount: parseFloat(payload.data.amount),
            token: payload.data.asset?.symbol || payload.data.currency,
            chain: this.walletConfigService.getBlockchainName(payload),
            status: TransactionStatus.UNSETTLED,
            senderAddress: payload.data.senderAddress || 'unknown',
            businessAddress: payload.data.recipientAddress,
            addressId: business.addressId,
            metadata: payload.data,
            receivedAt: new Date()
          });

        // Add to queue and Redis after successful save if shouldQueue is true
        if (shouldQueue) {
          await this.queueService.addToQueue('transaction-processing', {
            transactionId,
            status: TransactionStatus.UNSETTLED
          });
          await this.redisService.setKey(`tx:${transactionId}`, 'queued', 86400); // 24 hours expiry
          this.logger.log(`Transaction ${transactionId} saved and queued`);
        } else {
          this.logger.log(`Transaction ${transactionId} saved but not queued (business inactive or not approved)`);
        }
        
        return transaction;
      });
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
    limit: number = 10
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const skip = (page - 1) * limit;

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where: { businessId },
      order: { receivedAt: 'DESC' },
      skip,
      take: limit,
    });

    return { transactions, total };
  }
} 