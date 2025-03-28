import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Transaction as WalletTransaction } from '../wallet/entities/transaction.entity';
import { Transaction } from './interfaces/transaction.interface';
import { getTokenAddress, mapNetworkFromConfig, getTokenInfoByAddress } from './utils';
import { TransactionStatus } from '../wallet/constants/status.enum';
import { PaycrestService } from '../paycrest/paycrest.service';

/**
 * Service responsible for preparing transaction data for offramp processing
 * Acts as a bridge between raw blockchain transactions and the offramp service
 */
@Injectable()
export class PrepareTransactionService {
  private readonly logger = new Logger(PrepareTransactionService.name);
  private readonly configNetwork: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly paycrestService: PaycrestService,
  ) {
    this.configNetwork = this.configService.get<string>('blockradar.network');
    this.logger.log(`PrepareTransactionService initialized for network config: ${this.configNetwork}`);
  }

  /**
   * Fetches and prepares transaction details needed for offramp processing
   * 
   * Steps:
   * 1. Retrieve transaction and associated business data
   * 2. Validate required bank details
   * 3. Map token symbol to blockchain address based on chain and network config
   * 4. Get token rate from Paycrest service
   * 5. Format data for offramp processing
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

      // Step 3: Map network based on config and transaction chain
      const network = mapNetworkFromConfig(this.configNetwork, transaction.chain);
      this.logger.log(`Mapped network ${network} for chain ${transaction.chain} with config ${this.configNetwork}`);

      // Step 4: Get token address from token symbol
      const tokenAddress = getTokenAddress(network, transaction.token);
      if (!tokenAddress) {
        throw new Error(`Token address not found for ${transaction.token} on network ${network}`);
      }
      
      // Step 5: Get token information to retrieve correct decimals
      const tokenInfo = getTokenInfoByAddress(tokenAddress);
      if (!tokenInfo) {
        throw new Error(`Token information not found for ${transaction.token} on network ${network}`);
      }
      
      const tokenDecimals = tokenInfo.decimals;
      this.logger.log(`Using token decimals: ${tokenDecimals} for ${transaction.token}`);
      
      // Step 6: Get token rate from Paycrest service - always use NGN as fiat
      const fiat = 'NGN';
      // Ensure token symbol is uppercase for rate fetching
      const tokenSymbol = transaction.token.toUpperCase();
      
      // Log the transaction amount for debugging
      this.logger.log(`Original transaction amount: ${transaction.tokenAmount}, type: ${typeof transaction.tokenAmount}`);
      const amountStr = transaction.tokenAmount.toString();
      this.logger.log(`Fetching token rate for ${tokenSymbol}/${fiat}, amount: ${amountStr}`);
      
      // Try up to 3 times to get a valid rate
      let rateResponse;
      let retries = 0;
      let rate = 0;
      
      while (retries < 3) {
        rateResponse = await this.paycrestService.getTokenRate(
          tokenSymbol, 
          amountStr,
          fiat
        );
        
        this.logger.log(`[DEBUG] Raw rate response: ${JSON.stringify(rateResponse)}`);
        
        // Handle case where data is the rate itself (as string)
        if (rateResponse.status === 'success') {
          if (typeof rateResponse.data === 'string') {
            rate = parseFloat(rateResponse.data);
          } else if (rateResponse.data && rateResponse.data.rate) {
            // Handle case where data is an object with rate property
            rate = parseFloat(rateResponse.data.rate);
          }
          
          if (rate > 0) {
            this.logger.log(`Received valid rate: ${rate} for ${tokenSymbol}/${fiat}`);
            break;
          }
        }
        
        retries++;
        this.logger.warn(`Attempt ${retries}: Failed to get valid rate for ${tokenSymbol}/${fiat}, received: ${JSON.stringify(rateResponse)}`);
        
        // Wait a short time before retrying
        if (retries < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000)); 
        }
      }
      
      // If we still don't have a valid rate after retries, throw an error
      if (rate <= 0) {
        throw new Error(`Failed to get valid exchange rate for ${tokenSymbol}/${fiat} after ${retries} attempts`);
      }

      // Step 7: Format data for offramp processing
      const currency = bankDetails.bankCode.startsWith('0') ? 'NGN' : 'KES';
      
      // Step 8: Return properly formatted transaction
      return {
        id: transaction.transactionId,
        senderAddress: transaction.businessAddress,
        recipientName: bankDetails.accountName,
        accountIdentifier: bankDetails.accountNumber,
        institution: bankDetails.bankCode,
        tokenAddress,
        token: transaction.token,
        tokenDecimals: tokenDecimals, // Use actual token decimals, never use fallback
        tokenSymbol: transaction.token,
        amount: transaction.tokenAmount,
        currency,
        rate: Math.round(rate * 100), // Convert rate to basis points (multiply by 100)
        refundAddress: transaction.businessAddress,
        status: TransactionStatus.PENDING,
        network,
        chain: transaction.chain,
        walletId: transaction.walletId,
        addressId: transaction.addressId,
        memo: `Offramp for transaction ${transaction.transactionId}`
      };
    } catch (error) {
      this.logger.error(`Error preparing transaction ${transactionId} for offramp: ${error.message}`, error.stack);
      throw error;
    }
  }
}
