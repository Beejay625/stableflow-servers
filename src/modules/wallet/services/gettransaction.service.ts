import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

interface TransactionDetails {
  status: string;
  type: string;
  currency: string;
  senderAddress: string;
  recipientAddress: string;
  tokenName: string;
  tokenSymbol: string;
  blockchainName: string;
  blockchainSymbol: string;
  amount: string;
  amountPaid: string;
  convertedAmount: string;
  convertedGasFee: number;
  hash?: string;
  timestamp?: string;
}

@Injectable()
export class GetTransactionService {
  private readonly logger = new Logger(GetTransactionService.name);
  private readonly apiKey: string;
  private readonly walletId: string;
  private readonly baseUrl = 'https://api.blockradar.co/v1';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('blockradar.apiKey') ||
                  this.configService.get<string>('BLOCKRADAR_API_KEY');
                  
    this.walletId = this.configService.get<string>('blockradar.walletId') ||
                    this.configService.get<string>('BLOCKRADAR_WALLET_ID');
                  

    if (!this.apiKey) {
      this.logger.error('BlockRadar API key is not configured');
      throw new Error('BlockRadar API key is not configured');
    }

    if (!this.walletId) {
      this.logger.error('Wallet ID is not configured');
      throw new Error('Wallet ID must be set in BLOCKRADAR_WALLET_ID or WALLET_ID environment variables');
    }
  }

  /**
   * Get transaction details from BlockRadar API
   * @param transactionId - The transaction ID
   * @returns Transaction details
   */
  async getTransactionDetails(transactionId: string): Promise<TransactionDetails> {
    try {
      const url = `${this.baseUrl}/wallets/${this.walletId}/transactions/${transactionId}`;
      this.logger.debug(`Fetching transaction ${transactionId} for wallet ${this.walletId}`);
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { 'x-api-key': this.apiKey }
        })
      );
      
      if (!response.data?.data) {
        throw new Error('Invalid response from BlockRadar API');
      }

      const transactionData = response.data.data;
      
      return {
        status: transactionData.status,
        type: transactionData.type,
        currency: transactionData.currency,
        senderAddress: transactionData.senderAddress,
        recipientAddress: transactionData.recipientAddress,
        tokenName: transactionData.asset?.name,
        tokenSymbol: transactionData.asset?.symbol,
        blockchainName: transactionData.blockchain?.name,
        blockchainSymbol: transactionData.blockchain?.symbol,
        amount: transactionData.amount,
        amountPaid: transactionData.amountPaid,
        convertedAmount: transactionData.convertedAmount,
        convertedGasFee: transactionData.convertedGasFee,
        hash: transactionData.hash || transactionData.transactionHash,
        timestamp: transactionData.timestamp || transactionData.createdAt || new Date().toISOString()
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Error fetching transaction details: ${axiosError.message}`,
        axiosError.stack
      );
      throw new Error(`Failed to fetch transaction: ${axiosError.response?.statusText}`);
    }
  }

  /**
   * Get transaction details in batch
   * @param transactionIds - Array of transaction IDs
   * @returns Array of transaction details
   */
  async getTransactionDetailsBatch(transactionIds: string[]): Promise<TransactionDetails[]> {
    this.logger.log(`Fetching details for ${transactionIds.length} transactions in batch for wallet ${this.walletId}`);
    
    try {
      return await Promise.all(
        transactionIds.map(id => this.getTransactionDetails(id))
      );
    } catch (error) {
      this.logger.error(`Batch transaction fetch failed: ${error.message}`);
      throw new Error('Partial transaction data - some items failed to load');
    }
  }

  /**
   * Request Blockradar to resend a transaction webhook
   * @param transactionId - The transaction ID to resend webhook for
   * @returns Success status and message
   */
  async requestWebhookResend(transactionId: string): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Requesting webhook resend for transaction: ${transactionId}`);
      const url = `${this.baseUrl}/wallets/${this.walletId}/transactions/webhooks/resend`;
      
      const response = await firstValueFrom(
        this.httpService.post(
          url, 
          { id: transactionId },
          {
            headers: { 'x-api-key': this.apiKey }
          }
        )
      );
      
      this.logger.debug(`Webhook resend response for ${transactionId}: ${JSON.stringify(response.data)}`);
      
      return {
        success: true,
        message: `Webhook resend requested for transaction ${transactionId}`
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Error requesting webhook resend: ${axiosError.message}`,
        axiosError.stack
      );
      
      return {
        success: false,
        message: `Failed to request webhook resend: ${axiosError.response?.data ? (axiosError.response.data as any).message : axiosError.message}`
      };
    }
  }
}
