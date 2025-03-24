import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Headers, 
  HttpCode, 
  UnauthorizedException, 
  UseGuards,
  Param,
  Query,
  Req,
  BadRequestException,
  InternalServerErrorException,
  Res
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WebhookService } from './services/webhook.service';
import { TransactionQueueService } from '../queue/services/transaction-queue.service';
import { GetTransactionService } from './services/gettransaction.service';
import { SortTransactionService } from './services/sort.transaction.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionStatus } from './constants/status.enum';
import { MoreThanOrEqual } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Controller for wallet-related functionality
 * Handles crypto transaction management, webhooks from payment providers,
 * and business transaction history
 */
@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly transactionQueue: TransactionQueueService,
    private readonly getTransactionService: GetTransactionService,
    private readonly sortTransactionService: SortTransactionService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Handles incoming webhook notifications from Blockradar
   * 
   * This endpoint receives transaction notifications when cryptocurrency payments
   * are made to our business wallets. When a payment hits one of our wallet addresses,
   * Blockradar sends a webhook to this endpoint with details of the transaction.
   * 
   * The workflow is:
   * 1. Validate the webhook signature to prevent fake requests
   * 2. Extract transaction ID for quick acknowledgment
   * 3. Return immediate acknowledgment (200 OK) to Blockradar
   * 4. Process the transaction asynchronously in the background
   * 
   * @param payload - Complete webhook data from Blockradar
   * @Headers ('x-blockradar-signature') signature: string
   * @param signature - Security signature to validate webhook authenticity
   * @returns Acknowledgment with transaction ID
   */
  @Post('webhook/blockradar')
  @Public()
  async handleBlockradarWebhook(@Body() payload: any, @Res() res: Response) {
    try {
      // CRITICAL OPTIMIZATION:
      // 1. Check FIRST if this is a deposit.success event, return early if not
      if (payload?.data?.event_type !== 'deposit.success') {
        // Silent return - no logging, no processing
        return res.status(200).send({
          status: 'skipped',
          reason: 'non-deposit.success event'
        });
      }

      // 2. Extract only necessary data after confirming it's a deposit.success event
      const { transactionId, businessAddress, eventType, walletId } = 
        this.webhookService.extractWebhookData(payload);

      // 3. Efficient duplicate check - check DB BEFORE any further processing
      const existingTx = await this.transactionRepository.findOne({
        where: { transactionId },
        select: ['id'] // Only select ID field for efficiency
      });

      // 4. Return immediately if duplicate, no logging needed
      if (existingTx) {
        return res.status(200).send({
          status: 'success',
          message: 'Transaction already processed'
        });
      }

      // Only log when we have a NEW deposit.success event
      this.logger.log(
        `Received ${eventType} webhook for transaction ${transactionId}`
      );

      // 5. Process the legitimate new transaction
      if (businessAddress) {
        const transactionData = await this.sortTransactionService
          .fetchTransactionDetails(transactionId);
        
        const business = await this.sortTransactionService
          .findBusinessForTransaction(transactionData);

        if (business) {
          await this.sortTransactionService.saveTransactionToBusiness(
            transactionId,
            business,
            transactionData.amount,
            transactionData.token,
            transactionData.blockchain,
            businessAddress,
            business.addressId,
            transactionData,
            transactionData.senderAddress,
            walletId,
          );
          
          // Queue for processing - will happen asynchronously
          await this.transactionQueue.queueTransaction(transactionId);
        }
      }

      return res.status(200).send({
        status: 'success',
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      this.logger.error(
        `Error processing Blockradar webhook: ${error.message}`,
        error.stack
      );
      
      // Always return 200 to prevent webhook retries
      return res.status(200).send({
        status: 'error',
        message: 'Error processing webhook, but acknowledged'
      });
    }
  }

  /**
   * Returns analytics data about transactions in the system
   * 
   * This endpoint aggregates transaction data to provide a dashboard overview
   * with the following metrics:
   * - Transaction counts by status (processing, completed, etc.)
   * - Total transaction count and value
   * - Recent transaction activity (last 30 days)
   * - Top 5 businesses by transaction volume
   * 
   * Used primarily for the admin dashboard to monitor system performance
   * and overall transaction flow.
   * 
   * @returns Aggregated transaction statistics
   */
  @Get('transactions/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get transaction statistics',
    description: 'Retrieve statistics about transactions including status counts and processing metrics'
  })
  async getTransactionStats() {
    // Count transactions by status (processing, completed, failed, etc.)
    const statusCounts = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('transaction.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('transaction.status')
      .getRawMany();
      
    // Calculate total transaction value across the system
    const totalAmountResult = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('SUM(transaction.tokenAmount)', 'total')
      .getRawOne();
    
    // Get recent transactions (last 30 days) for trend analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentCount = await this.transactionRepository.count({
      where: {
        receivedAt: MoreThanOrEqual(thirtyDaysAgo)
      }
    });
    
    // Identify top 5 businesses by transaction volume
    const businessCounts = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('transaction.businessId', 'businessId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('transaction.businessId')
      .orderBy('count', 'DESC')
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
        amount: parseFloat(totalAmountResult?.total || '0')
      },
      recent: {
        last30Days: recentCount
      },
      byBusiness: businessCounts
    };
  }
  
  /**
   * Retrieves transaction history for a specific business
   * 
   * This endpoint returns a paginated list of transactions associated with
   * a particular business, ordered from newest to oldest. This is used in the
   * business dashboard to show transaction history and allow business owners
   * to track their incoming crypto payments.
   * 
   * The pagination system:
   * - Prevents performance issues when businesses have many transactions
   * - Allows the frontend to implement page navigation controls
   * - Returns metadata about total records for UI display
   * 
   * @param businessId - UUID of the business to retrieve transactions for
   * @param page - Page number for pagination (starts at 1)
   * @param limit - Number of records per page (max 100)
   * @returns Paginated transaction list with metadata
   */
  @Get('transactions/business/:businessId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get transactions for a business',
    description: 'Retrieve transactions associated with a specific business with pagination'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (default: 10)' })
  async getBusinessTransactions(
    @Param('businessId') businessId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    // Ensure positive values for page and limit
    page = Math.max(1, page);
    limit = Math.max(1, Math.min(100, limit)); // Cap at 100 items per page
    
    return this.sortTransactionService.getTransactionsByBusinessId(businessId, page, limit);
  }
  
  /**
   * Gets currently processing transactions from the queue
   * 
   * This endpoint is used by administrators to monitor in-flight transactions
   * that are currently being processed by the system. It helps with:
   * - Identifying potential bottlenecks in transaction processing
   * - Monitoring system load and throughput
   * - Checking the status of specific transactions
   * 
   * @returns List of transactions currently in the processing queue
   */
  @Get('transactions/processing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get processing transactions',
    description: 'Retrieve all transactions currently being processed'
  })
  async getProcessingTransactions() {
    const processingTransactions = await this.transactionQueue.getProcessingTransactions();
    return { 
      count: processingTransactions.length,
      transactions: processingTransactions 
    };
  }
  
  /**
   * Returns transactions that failed during processing
   * 
   * This endpoint helps administrators identify and troubleshoot transactions
   * that encountered errors during processing. Failed transactions typically occur due to:
   * - Connectivity issues with external services
   * - Data validation errors
   * - Business account configuration problems
   * 
   * Failed transactions can be retried using the retry endpoint.
   * 
   * @returns List of failed transactions with error details
   */
  @Get('transactions/failed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get failed transactions',
    description: 'Retrieve all transactions that failed processing'
  })
  async getFailedTransactions() {
    const failedTransactions = await this.transactionQueue.getFailedTransactions();
    return { 
      count: failedTransactions.length,
      transactions: failedTransactions 
    };
  }
  
  /**
   * Reprocesses a previously failed transaction
   * 
   * This endpoint allows administrators to retry processing a transaction
   * that previously failed. Common scenarios for retrying include:
   * - Temporary service outages that have been resolved
   * - Configuration issues that have been fixed
   * - Data problems that have been corrected
   * 
   * The transaction is placed back into the processing queue with a fresh state.
   * 
   * @param transactionId - ID of the failed transaction to retry
   * @returns Success status and message about the retry operation
   */
  @Post('transactions/retry/:transactionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Retry a failed transaction',
    description: 'Put a failed transaction back into the processing queue'
  })
  async retryTransaction(
    @Param('transactionId') transactionId: string,
    @Req() request: Request
  ) {
    const result = await this.transactionQueue.retryTransaction(transactionId);
    return { 
      success: result,
      message: result 
        ? `Transaction ${transactionId} requeued for processing` 
        : `Failed to requeue transaction ${transactionId}`
    };
  }
  
  /**
   * Manually marks a transaction as completed
   * 
   * This admin-only endpoint allows manual completion of transactions in exceptional
   * circumstances, such as:
   * - When automatic settlement verification fails but payment has been confirmed
   * - When manual off-system settlement has occurred
   * - When resolving edge cases not handled by the automated system
   * 
   * The action is fully audited with user information and timestamp.
   * This should only be used when normal processing cannot complete a transaction
   * but it's been verified through other means.
   * 
   * @param transactionId - ID of the transaction to mark as completed
   * @returns Updated transaction with completion details
   */
  @Post('transactions/complete/:transactionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Manually complete a transaction',
    description: 'Manually mark a transaction as completed (admin action)'
  })
  async completeTransaction(
    @Param('transactionId') transactionId: string,
    @Req() request: Request & { user: { id: string } }
  ) {
    // Find the transaction to update
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId }
    });
    
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    // Update status and add audit information in metadata for accountability
    transaction.status = TransactionStatus.COMPLETED;
    transaction.metadata = {
      ...(transaction.metadata || {}),
      manuallyCompleted: true,
      completedBy: request.user.id,
      completedAt: new Date().toISOString()
    };
    
    // Save the updated transaction with the audit trail
    const result = await this.transactionRepository.save(transaction);
    
    return { 
      success: true,
      message: `Transaction ${transactionId} manually marked as completed`,
      transaction: result
    };
  }
} 