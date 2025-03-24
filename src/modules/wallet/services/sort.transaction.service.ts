import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { Transaction } from '../entities/transaction.entity';
import { GetTransactionService } from './gettransaction.service';
import { TransactionStatus } from '../constants/status.enum';

@Injectable()
export class SortTransactionService {
  private readonly logger = new Logger(SortTransactionService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly getTransactionService: GetTransactionService
  ) {}

  /**
   * Find business for a transaction based on recipient address
   * OPTIMIZED: Uses a single query with OR conditions instead of multiple queries
   * @param transactionData - Transaction data containing business address
   * @returns Promise<Business> - The business entity if found
   */
  async findBusinessForTransaction(transactionData: any): Promise<Business> {
    const { businessAddress } = transactionData;
    
    if (!businessAddress) {
      this.logger.warn('No business address provided for business lookup');
      return null;
    }

    // OPTIMIZATION: Use a single query with OR conditions for both address fields
    // This reduces the number of database queries from 2 to 1
    this.logger.debug(`Searching for business by address: ${businessAddress}`);
    
    const business = await this.businessRepository.findOne({
      where: [
        { walletAddress: businessAddress },
        { addressId: businessAddress }
      ],
      // OPTIMIZATION: Only select fields we need
      select: ['id', 'name', 'walletAddress', 'addressId'] 
    });
    
    if (business) {
      this.logger.debug(`Business found: ${business.id}`);
      return business;
    }
    
    this.logger.warn(`No business found for address ${businessAddress}`);
    return null;
  }

  /**
   * Save transaction to a business
   * @param transactionId - Transaction ID
   * @param business - The business entity
   * @param tokenAmount - Token amount
   * @param token - Token symbol
   * @param chain - Blockchain name
   * @param businessAddress - Business address (recipient)
   * @param addressId - Address ID
   * @param metadata - Optional metadata to update
   * @param senderAddress - Sender address
   * @param walletId - Wallet ID
   * @returns Promise<Transaction> - The saved transaction
   */
  async saveTransactionToBusiness(
    transactionId: string,
    business: Business,
    tokenAmount: number,
    token: string,
    chain: string,
    businessAddress: string,
    addressId: string,
    metadata?: any,
    senderAddress: string = 'unknown',
    walletId: string = null,
  ): Promise<Transaction> {
    try {
      this.logger.log(
        `Saving transaction to business: ${business.id}, txId: ${transactionId}`,
      );

      // OPTIMIZATION: Prepare data before transaction to minimize transaction time
      const txData = {
        transactionId,
        tokenAmount,
        token,
        chain,
        businessAddress,
        senderAddress,
        walletId,
        addressId,
        business,
        businessId: business.id,
        status: TransactionStatus.UNSETTLED,
        metadata,
      };

      // OPTIMIZATION: Avoid overhead of the create() + save() two-step process
      const tx = await this.transactionRepository.save(txData);

      this.logger.log(
        `Saved transaction: ${tx.id} with amount ${tokenAmount} for business: ${business.id}, txId: ${transactionId}`,
      );

      return tx;
    } catch (error) {
      this.logger.error(
        `Error saving transaction to business: ${error.message}`,
        error.stack,
      );
      throw new Error(`Error saving transaction to business: ${error.message}`);
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
      
      // Use the getTransactionService to get the raw data
      const transactionData = await this.getTransactionService.getTransactionDetails(transactionId);
      
      // Extract fields required for processing
      const extractedDetails = {
        id: transactionId,
        status: transactionData.status,
        type: transactionData.type,
        currency: transactionData.currency,
        senderAddress: transactionData.senderAddress,
        businessAddress: transactionData.recipientAddress,
        tokenName: transactionData.tokenName,
        tokenSymbol: transactionData.tokenSymbol,
        token: transactionData.tokenSymbol || transactionData.currency,
        blockchainName: transactionData.blockchainName,
        blockchainSymbol: transactionData.blockchainSymbol,
        blockchain: transactionData.blockchainSymbol,
        amount: transactionData.amount,
        amountPaid: transactionData.amountPaid,
        convertedAmount: transactionData.convertedAmount,
        convertedGasFee: transactionData.convertedGasFee,
        hash: transactionData.hash || '',
        timestamp: transactionData.timestamp || new Date().toISOString(),
        // Extract walletId properly with type safety
        walletId: (transactionData as any).wallet?.id || null
      };
      
      // OPTIMIZATION: Only log in debug mode to reduce overhead
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug('===== TRANSACTION DETAILS =====');
        this.logger.debug(`Status: ${extractedDetails.status}`);
        this.logger.debug(`Type: ${extractedDetails.type}`);
        this.logger.debug(`Currency: ${extractedDetails.currency}`);
        this.logger.debug(`Sender Address: ${extractedDetails.senderAddress}`);
        this.logger.debug(`Business Address: ${extractedDetails.businessAddress}`);
        this.logger.debug(`Token: ${extractedDetails.tokenName} (${extractedDetails.tokenSymbol})`);
        this.logger.debug(`Blockchain: ${extractedDetails.blockchainName} (${extractedDetails.blockchainSymbol})`);
        this.logger.debug(`Amount: ${extractedDetails.amount}`);
        this.logger.debug(`Amount Paid: ${extractedDetails.amountPaid}`);
        this.logger.debug(`Converted Amount: ${extractedDetails.convertedAmount}`);
        this.logger.debug(`Converted Gas Fee: ${extractedDetails.convertedGasFee}`);
        this.logger.debug(`Transaction Hash: ${extractedDetails.hash || 'N/A'}`);
        this.logger.debug(`Timestamp: ${extractedDetails.timestamp || 'N/A'}`);
        this.logger.debug(`Wallet ID: ${extractedDetails.walletId || 'N/A'}`);
      }
      
      return extractedDetails;
    } catch (error) {
      // Handle errors
      this.logger.error(`Error fetching transaction details: ${error.message}`, error.stack);
      throw error;
    }
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