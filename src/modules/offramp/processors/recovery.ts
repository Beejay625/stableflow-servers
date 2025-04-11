import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

import { Transaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { RedisService } from '../../redis/redis.service';
import { OfframpService } from '../services/offramp.service';

/**
 * Recovery processor for handling offramp transactions that reached max polling attempts
 * without settling to a final state (SETTLED or REFUNDED).
 * 
 * This processor pulls from a dedicated queue and retries the polling process
 * to see if the transactions can be resolved to a final state.
 */
@Injectable()
@Processor('processing-attempt')
export class RecoveryProcessor {
  private readonly logger = new Logger(RecoveryProcessor.name);
  
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly redisService: RedisService,
    private readonly offrampService: OfframpService,
  ) {}
  
  /**
   * Process recovery attempts for transactions that didn't reach a final state
   * during the initial polling period.
   * 
   * @param job - The job containing transaction data
   * @returns Promise resolving to success/error information
   */
  @Process('retry')
  async processRecovery(
    job: Job<{ transactionId: string, orderId: string, chainId: string | number }>
  ) {
    const { transactionId, orderId, chainId } = job.data;
    
    this.logger.log(`Starting recovery processing for transaction ${transactionId} with order ${orderId}`);
    
    try {
      // Verify the transaction exists and is still in PROCESSING state
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId }
      });
      
      if (!transaction) {
        this.logger.warn(`Transaction ${transactionId} not found, cannot process recovery`);
        return { success: false, error: 'Transaction not found' };
      }
      
      // Check if still needs recovery (still in PROCESSING and not SETTLED/REFUNDED)
      if (![TransactionStatus.PROCESSING].includes(transaction.status as TransactionStatus)) {
        this.logger.log(`Transaction ${transactionId} is already in ${transaction.status} state, skipping recovery`);
        return { success: true, message: 'Transaction already processed' };
      }
      
      // Call the polling function again to check for updates
      // The logic inside pollOrderStatus will update the transaction if a final state is found
      this.logger.log(`Retrying poll for order ${orderId} on chain ${chainId}`);
      await this.offrampService.pollOrderStatus(chainId, orderId, transactionId);
      
      // Record the recovery attempt in Redis
      const recoveryKey = `recovery:${transactionId}`;
      const attempts = await this.redisService.get(recoveryKey);
      const currentAttempts = attempts ? parseInt(attempts) : 0;
      await this.redisService.setKey(recoveryKey, (currentAttempts + 1).toString(), 86400); // 24 hours TTL
      
      this.logger.log(`Recovery attempt ${currentAttempts + 1} completed for transaction ${transactionId}`);
      
      return { 
        success: true, 
        message: `Recovery polling completed for transaction ${transactionId}`
      };
    } catch (error) {
      this.logger.error(`Error in recovery processing for ${transactionId}: ${error.message}`, error.stack);
      return { 
        success: false, 
        error: `Recovery processing error: ${error.message}`
      };
    }
  }
}
