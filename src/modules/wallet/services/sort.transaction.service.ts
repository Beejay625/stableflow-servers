import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { Transaction } from '../entities/transaction.entity';
import { GetTransactionService } from './gettransaction.service';
import { TransactionStatus } from '../constants/status.enum';
import { ConfigService } from '@nestjs/config';

// Import the OfframpService
import { OfframpService } from '../../offramp/offramp.service';

// Import WalletConfigService
import { WalletConfigService } from '../../../common/utils/wallet-config';

@Injectable()
export class SortTransactionService {
  private readonly logger = new Logger(SortTransactionService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly getTransactionService: GetTransactionService,
    private readonly walletConfigService: WalletConfigService,
    private readonly configService: ConfigService,
    // Inject the OfframpService as an optional dependency
    @Optional() @Inject(OfframpService) private readonly offrampService?: OfframpService
  ) {}

  /**
   * Find business for a transaction based on recipient address
   * @param transactionData - Transaction data containing recipient address
   * @returns Promise<Business> - The business entity if found
   */
  async findBusinessForTransaction(transactionData: any): Promise<Business> {
    const recipientAddress = transactionData.recipientAddress;
    if (!recipientAddress) {
      this.logger.warn('No recipient address found in transaction data');
      return null;
    }

    // OPTIMIZATION: Use findOneBy for simple exact match - faster than query builder
    const business = await this.businessRepository.findOneBy({
      walletAddress: recipientAddress
    });
    
    if (business) {
      this.logger.log(`Found business ${business.id}`);
      return business;
    }
    
    this.logger.warn(`No business found for ${recipientAddress}`);
    return null;
  }

  /**
   * Save transaction to a business
   * @param transactionId - Transaction ID
   * @param business - The business entity
   * @param tokenAmount - Token amount
   * @param token - Token symbol
   * @param chain - Blockchain name
   * @param recipientAddress - Business address (recipient)
   * @param senderAddress - Sender address
   * @param metadata - Optional metadata to update
   * @returns Promise<Transaction> - The saved transaction
   */
  async saveTransactionToBusiness(
    transactionId: string,
    business: Business,
    tokenAmount: number,
    token: string,
    chain: string,
    recipientAddress: string,
    senderAddress: string = 'unknown',
    metadata?: any,
  ): Promise<Transaction> {
    try {
      this.logger.log(`Step 3: Saving transaction ${transactionId} for business ${business.id}`);

      const txData = {
        transactionId,
        tokenAmount,
        token,
        chain,
        recipientAddress,
        senderAddress,
        business,
        businessId: business.id,
        status: TransactionStatus.UNSETTLED,
        metadata,
      };

      const tx = await this.transactionRepository.save(txData);
      this.logger.log(`Step 4: Transaction ${transactionId} saved successfully`);

      // Process via offramp if available
      if (this.offrampService) {
        try {
          this.logger.log(`Step 5: Starting offramp processing for transaction ${transactionId}`);
          await this.offrampService.processTransaction(tx.id);
        } catch (processError) {
          this.logger.error(`Failed offramp processing for ${transactionId}: ${processError.message}`);
        }
      }

      return tx;
    } catch (error) {
      this.logger.error(`Failed to save transaction ${transactionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch transaction details from Blockradar API
   * @param transactionId - The transaction ID
   * @returns Promise<any> - Transaction details
   */
  async fetchTransactionDetails(transactionId: string): Promise<any> {
    try {
      this.logger.debug(`Fetching details for Transaction ID: ${transactionId}`);
      
      // First get the transaction details directly to determine wallet configuration
      // We need to construct an initial request with some blockchain/token data to get wallet configuration
      // This is just to bootstrap the process
      const initialData = {
        // Construct a minimal, dummy transaction data object to start the process
        transactionId: transactionId,
        // These will be populated by the API response
        blockchainName: '',
        tokenSymbol: '',
        walletId: ''
      };
      
      // Get transaction details using wallet-specific configuration
      // No fallbacks - we strictly use the wallet configuration based on blockchain and token
      const transactionData = await this.getTransactionService.getTransactionDetailsWithWalletConfig(
        transactionId,
        initialData
      );
      
      // Extract fields required for processing
      const extractedDetails = this.extractTransactionDetails(transactionData, transactionId);
      return extractedDetails;
    } catch (error) {
      // Log the error and rethrow
      this.logger.error(`Error fetching transaction details: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Extract transaction details from API response
   * @param transactionData - Raw transaction data from API
   * @param transactionId - Transaction ID
   * @returns Extracted transaction details
   */
  private extractTransactionDetails(transactionData: any, transactionId: string): any {
    // Only log for deposit.success
    if (transactionData.type === 'deposit.success') {
      this.logger.log(`Processing deposit.success - ID: ${transactionId}, Amount: ${transactionData.amount} ${transactionData.tokenSymbol || transactionData.currency}`);
    }
    
    return {
      id: transactionId,
      status: transactionData.status,
      type: transactionData.type,
      currency: transactionData.currency,
      senderAddress: transactionData.senderAddress,
      recipientAddress: transactionData.recipientAddress,
      tokenName: transactionData.tokenName,
      tokenSymbol: transactionData.tokenSymbol,
      token: transactionData.tokenSymbol || transactionData.currency,
      blockchainName: transactionData.blockchainName || '',
      blockchainSymbol: transactionData.blockchainSymbol,
      blockchain: transactionData.blockchainName || '',
      amount: transactionData.amount,
      amountPaid: transactionData.amountPaid,
      convertedAmount: transactionData.convertedAmount,
      convertedGasFee: transactionData.convertedGasFee,
      hash: transactionData.hash || '',
      timestamp: transactionData.timestamp || new Date().toISOString(),
      walletId: transactionData.walletId || null
    };
  }

  /**
   * Get transactions for a specific business with pagination
   * @param businessId - The business ID
   * @param page - Page number (default: 1)
   * @param limit - Number of items per page (default: 10)
   * @returns Promise<{ data: Transaction[]; total: number; page: number; limit: number; }> - Paginated transactions
   */
  async getTransactionsByBusinessId(
    businessId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: Transaction[]; total: number; page: number; limit: number; }> {
    this.logger.debug(`Fetching transactions for business: ${businessId} (page ${page}, limit ${limit})`);
    
    // Calculate skip for pagination
    const skip = (page - 1) * limit;
    
    // OPTIMIZATION: Use countBy instead of count with where clause
    const total = await this.transactionRepository.countBy({ businessId });
    
    // Get paginated data
    const transactions = await this.transactionRepository.find({
      where: { businessId },
      order: { receivedAt: 'DESC' }, // Most recent transactions first
      skip: skip,
      take: limit
    });
    
    this.logger.debug(`Found ${transactions.length} transactions for business: ${businessId}`);
    
    // Return paginated result
    return {
      data: transactions,
      total,
      page,
      limit
    };
  }

  /**
   * Update transaction status
   * @param transactionId - Transaction ID
   * @param newStatus - New status to set
   * @param metadata - Optional metadata to update
   */
  async updateTransactionStatus(
    transactionId: string, 
    newStatus: TransactionStatus,
    metadata?: Record<string, any>
  ) {
    // OPTIMIZATION: Only update metadata if provided
    const updateData: Partial<Transaction> = { status: newStatus };
    
    if (metadata) {
      updateData.metadata = metadata;
    }
    
    return this.transactionRepository.update(
      { transactionId },
      updateData
    );
  }
} 