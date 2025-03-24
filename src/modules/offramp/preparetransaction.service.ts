import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Transaction as WalletTransaction } from '../wallet/entities/transaction.entity';
import { Transaction } from './interfaces/transaction.interface';
import { getTokenAddress, mapNetworkFromConfig } from './utils';
import { TransactionStatus } from '../wallet/constants/status.enum';

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
  }

  /**
   * Fetches and prepares transaction details needed for offramp processing
   * 
   * @param transactionId - The ID of the transaction to process
   * @returns Promise<Transaction> - Transaction details formatted for offramp
   * @throws Error if transaction not found or missing required data
   */
  async prepareTransactionForOfframp(transactionId: string): Promise<Transaction> {
    try {
      this.logger.log(`Preparing transaction ${transactionId} for offramp processing`);

      const transaction = await this.transactionRepository.findOne({
        where: { transactionId },
        relations: ['business', 'business.bankDetails'],
      });

      if (!transaction?.business) {
        throw new Error(`Transaction ${transactionId} not found or has no business`);
      }

      const bankDetails = transaction.business.bankDetails;
      if (!bankDetails?.accountNumber || !bankDetails.accountName || !bankDetails.bankCode) {
        throw new Error(`Missing bank details for business ${transaction.business.id}`);
      }

      const tokenAddress = getTokenAddress(this.network, transaction.token);
      if (!tokenAddress) {
        throw new Error(`Token address not found for ${transaction.token} on network ${this.network}`);
      }

      return {
        id: transaction.transactionId,
        senderAddress: transaction.businessAddress,
        recipientName: bankDetails.accountName,
        accountIdentifier: bankDetails.accountNumber,
        institution: bankDetails.bankCode,
        tokenAddress,
        token: transaction.token,
        tokenDecimals: 18,
        amount: transaction.tokenAmount,
        currency: bankDetails.bankCode.startsWith('0') ? 'NGN' : 'KES',
        rate: 0,
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
