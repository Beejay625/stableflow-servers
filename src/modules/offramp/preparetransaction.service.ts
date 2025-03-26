import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Transaction as WalletTransaction } from '../wallet/entities/transaction.entity';
import { Transaction } from './interfaces/transaction.interface';
import { getTokenAddress, mapNetworkFromConfig } from './utils';
import { TransactionStatus } from '../wallet/constants/status.enum';

/**
 * Service responsible for preparing transaction data for offramp processing
 * Acts as a bridge between raw blockchain transactions and the offramp service
 */
@Injectable()
export class PrepareTransactionService {
  private readonly logger = new Logger(PrepareTransactionService.name);
  private readonly network: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
  ) {
    this.network = mapNetworkFromConfig(configService.get<string>('blockradar.network'));
    this.logger.log(`PrepareTransactionService initialized for network: ${this.network}`);
  }

  /**
   * Fetches and prepares transaction details needed for offramp processing
   * 
   * Steps:
   * 1. Retrieve transaction and associated business data
   * 2. Validate required bank details
   * 3. Map token symbol to blockchain address
   * 4. Format data for offramp processing
   * 
   * @param transactionId - The ID of the transaction to process
   * @returns Promise<Transaction> - Transaction details formatted for offramp
   * @throws Error if transaction not found or missing required data
   */
  async prepareTransactionForOfframp(transactionId: string): Promise<Transaction> {
    try {
      this.logger.log(`Preparing transaction ${transactionId} for offramp processing`);

      // Step 1: Fetch transaction with related business data
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId },
        relations: ['business', 'business.bankDetails'],
      });

      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      if (!transaction.business) {
        throw new Error(`Transaction ${transactionId} has no associated business`);
      }

      // Step 2: Validate bank account details
      const bankDetails = transaction.business.bankDetails;
      if (!bankDetails) {
        throw new Error(`Business ${transaction.business.id} has no bank details`);
      }

      if (!bankDetails.accountNumber || !bankDetails.accountName || !bankDetails.bankCode) {
        throw new Error(`Missing bank details for business ${transaction.business.id}: 
          accountNumber: ${!!bankDetails.accountNumber},
          accountName: ${!!bankDetails.accountName},
          bankCode: ${!!bankDetails.bankCode}
        `);
      }

      // Step 3: Get token address from token symbol
      const tokenAddress = getTokenAddress(this.network, transaction.token);
      if (!tokenAddress) {
        throw new Error(`Token address not found for ${transaction.token} on network ${this.network}`);
      }

      // Step 4: Format data for offramp processing
      const currency = bankDetails.bankCode.startsWith('0') ? 'NGN' : 'KES';
      
      // Step 5: Return properly formatted transaction
      return {
        id: transaction.transactionId,
        senderAddress: transaction.businessAddress,
        recipientName: bankDetails.accountName,
        accountIdentifier: bankDetails.accountNumber,
        institution: bankDetails.bankCode,
        tokenAddress,
        token: transaction.token,
        tokenDecimals: 18, // Most ERC20 tokens use 18 decimals
        amount: transaction.tokenAmount,
        currency,
        rate: 0, // Rate will be determined by the offramp provider
        refundAddress: transaction.businessAddress,
        status: TransactionStatus.PENDING,
        network: this.network,
        memo: `Offramp for transaction ${transaction.transactionId}`
      };
    } catch (error) {
      this.logger.error(`Error preparing transaction ${transactionId} for offramp: ${error.message}`, error.stack);
      throw error;
    }
  }
}
