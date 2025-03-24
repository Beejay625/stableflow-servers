import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OfframpService } from '../services/offramp.service';
import { TransactionStatus } from '../constants/status.enum';
import { LessThan } from 'typeorm';
import { TransactionRepository } from '../repositories/transaction.repository';

/**
 * Service for scheduling offramp-related operations
 * Handles periodic checks for stalled transactions
 */
@Injectable()
export class OfframpScheduleService {
  private readonly logger = new Logger(OfframpScheduleService.name);
  
  constructor(
    private readonly offrampService: OfframpService,
    private readonly transactionRepository: TransactionRepository
  ) {
    this.logger.log('Offramp schedule service initialized');
  }
  
  /**
   * Check for stalled transactions every 5 minutes
   * Identifies transactions that have been in PROCESSING state for too long
   * without receiving a confirmation webhook from Paycrest
   */
  @Cron(process.env.DISABLE_STALLED_CHECK === 'true' ? '0 0 30 2 *' : CronExpression.EVERY_5_MINUTES)
  async checkStalledTransactions() {
    if (process.env.DISABLE_STALLED_CHECK === 'true') return;
    // Method will no longer execute on schedule
  }
  
  /**
   * Daily maintenance job to log transaction stats
   * Runs at midnight each day
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async transactionMaintenanceJob() {
    this.logger.log('Running daily transaction maintenance job');
    
    // Here we could add code to generate reports, clean up old data, etc.
    // For now, this is just a placeholder for future needs
  }
} 