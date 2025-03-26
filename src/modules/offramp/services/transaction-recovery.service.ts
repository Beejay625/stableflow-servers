import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { ConfigService } from '@nestjs/config';
import { QueueService } from '../../queue/queue.service';
import { RedisService } from '../../redis/redis.service';
import { OfframpService } from '../offramp.service';
import { ethers } from 'ethers';

/**
 * Service responsible for recovering any UNSETTLED transactions that
 * were successfully saved to the database but failed to be added to the
 * processing queue.
 * 
 * This implements the "Transactional Outbox" pattern's recovery mechanism
 * to ensure eventual consistency between the database and queue.
 */
@Injectable()
export class TransactionRecoveryService {
  private readonly logger = new Logger(TransactionRecoveryService.name);
  private readonly recoveryAgeMinutes: number;
  private readonly isProduction: boolean;
  private readonly provider: ethers.JsonRpcProvider;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly queueService: QueueService,
    private readonly redisService: RedisService,
    private readonly offrampService: OfframpService,
    private readonly configService: ConfigService,
  ) {
    this.recoveryAgeMinutes = parseInt(
      this.configService.get<string>('TRANSACTION_RECOVERY_AGE_MINUTES', '10'),
      10
    );
    
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    this.logger.log(
      `Transaction recovery service initialized. Will recover transactions older than ${this.recoveryAgeMinutes} minutes.`
    );
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async recoverUnprocessedTransactions() {
    this.logger.log('Starting recovery scan for unprocessed transactions...');
    
    try {
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - this.recoveryAgeMinutes);
      
      const unprocessedTransactions = await this.transactionRepository.find({
        where: {
          status: TransactionStatus.UNSETTLED,
          receivedAt: LessThan(cutoffTime)
        },
        select: ['id', 'transactionId', 'businessAddress', 'receivedAt']
      });
      
      if (unprocessedTransactions.length === 0) {
        this.logger.debug('No unprocessed transactions found requiring recovery.');
        return;
      }
      
      this.logger.log(`Found ${unprocessedTransactions.length} potential transactions to recover.`);
      
      let recoveredCount = 0;
      let alreadyQueuedCount = 0;
      
      for (const tx of unprocessedTransactions) {
        const isQueued = await this.redisService.get(`tx:${tx.transactionId}`);
        
        if (!isQueued) {
          await this.queueService.addToQueue('transaction-processing', {
            transactionId: tx.transactionId,
            status: TransactionStatus.UNSETTLED
          });
          
          await this.redisService.setKey(`tx:${tx.transactionId}`, 'queued');
          
          this.logger.log(
            `Recovered transaction ${tx.transactionId} received at ${tx.receivedAt.toISOString()}`
          );
          recoveredCount++;
        } else {
          alreadyQueuedCount++;
          this.logger.debug(`Transaction ${tx.transactionId} already in queue, skipping.`);
        }
      }
      
      this.logger.log(
        `Recovery scan complete. Recovered: ${recoveredCount}, Already queued: ${alreadyQueuedCount}`
      );
      
    } catch (error) {
      this.logger.error(`Error in transaction recovery: ${error.message}`, error.stack);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkStalledTransactions(): Promise<void> {
    try {
      this.logger.log('Checking for stalled transactions');

      const timeThreshold = new Date();
      timeThreshold.setMinutes(timeThreshold.getMinutes() - 15);

      const stalledTransactions = await this.transactionRepository
        .createQueryBuilder('transaction')
        .where('transaction.status = :status', { status: TransactionStatus.UNSETTLED })
        .andWhere('transaction.receivedAt < :threshold', { threshold: timeThreshold })
        .andWhere("transaction.metadata->>'offramp' IS NOT NULL")
        .andWhere("transaction.metadata->'offramp'->>'txHash' IS NOT NULL")
        .getMany();

      if (stalledTransactions.length === 0) {
        this.logger.log('No stalled transactions found');
        return;
      }

      this.logger.log(`Found ${stalledTransactions.length} potentially stalled transactions`);
      
      for (const transaction of stalledTransactions) {
        try {
          const result = await this.offrampService.checkAndRecoverTransaction(transaction.id);
          
          if (result.recovered) {
            this.logger.log(`Successfully recovered stalled transaction ${transaction.id}`);
          } else if (result.status === 'pending_confirmation') {
            this.logger.debug(`Transaction ${transaction.id} is still pending confirmation`);
          } else {
            this.logger.warn(`Could not recover transaction ${transaction.id}: ${result.message}`);
          }
        } catch (error) {
          this.logger.error(`Error processing stalled transaction ${transaction.id}: ${error.message}`, error.stack);
        }
      }
    } catch (error) {
      this.logger.error(`Error checking stalled transactions: ${error.message}`, error.stack);
    }
  }

  async manualRecovery(olderThanMinutes: number = this.recoveryAgeMinutes) {
    this.logger.log(`Manual recovery triggered for transactions older than ${olderThanMinutes} minutes.`);
    
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - olderThanMinutes);
    
    const unprocessedTransactions = await this.transactionRepository.find({
      where: {
        status: TransactionStatus.UNSETTLED,
        receivedAt: LessThan(cutoffTime)
      }
    });
    
    let recovered = 0;
    let alreadyQueued = 0;
    
    for (const tx of unprocessedTransactions) {
      const isQueued = await this.redisService.get(`tx:${tx.transactionId}`);
      
      if (!isQueued) {
        await this.queueService.addToQueue('transaction-processing', {
          transactionId: tx.transactionId,
          status: TransactionStatus.UNSETTLED
        });
        
        await this.redisService.setKey(`tx:${tx.transactionId}`, 'queued');
        recovered++;
      } else {
        alreadyQueued++;
      }
    }
    
    return {
      scannedCount: unprocessedTransactions.length,
      recoveredCount: recovered,
      alreadyQueuedCount: alreadyQueued,
      cutoffTime: cutoffTime.toISOString()
    };
  }
} 