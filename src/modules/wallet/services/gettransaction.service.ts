import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { WalletConfigService } from '../../../common/utils/wallet-config';

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
  private readonly baseUrl = 'https://api.blockradar.co/v1';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly walletConfigService: WalletConfigService,
  ) {}

  /**
   * Get transaction details from BlockRadar API
   * @param transactionId - The transaction ID
   * @param requestOptions - Request configuration with wallet information
   * @returns Transaction details
   */
  async getTransactionDetails(
    transactionId: string, 
    requestOptions: { 
      walletId: string, 
      apiKey: string
    }
  ): Promise<TransactionDetails> {
    try {
      const { walletId, apiKey } = requestOptions;
      
      if (!walletId || !apiKey) {
        throw new Error('Wallet ID and API Key are required for transaction details');
      }
      
      const url = `${this.baseUrl}/wallets/${walletId}/transactions/${transactionId}`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { 'x-api-key': apiKey }
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
        blockchainName: transactionData.blockchain?.name || '',
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
      throw new Error(`Failed to fetch transaction: ${axiosError.response?.statusText || axiosError.message}`);
    }
  }

  /**
   * Get transaction details based on wallet properties in the transaction data
   * @param transactionId - The transaction ID 
   * @param transactionData - Partial transaction data with blockchain and token information
   * @returns Transaction details
   * @throws NotFoundException when no matching wallet configuration is found
   */
  async getTransactionDetailsWithWalletConfig(
    transactionId: string,
    transactionData: any
  ): Promise<TransactionDetails> {
    if (!transactionData) {
      throw new NotFoundException('Transaction data required to determine wallet configuration');
    }
    
    const walletConfig = this.walletConfigService.getWalletConfigForTransaction(transactionData);
    
    if (!walletConfig) {
      throw new NotFoundException(
        `No matching wallet configuration found for blockchain: ${transactionData.blockchainName}, token: ${transactionData.tokenSymbol}`
      );
    }
    
    if (!walletConfig.apiKey) {
      throw new NotFoundException(`API key missing for wallet configuration: ${walletConfig.walletName}`);
    }
    
    if (!walletConfig.walletId) {
      throw new NotFoundException(`Wallet ID missing for wallet configuration: ${walletConfig.walletName}`);
    }
    
    return this.getTransactionDetails(transactionId, {
      walletId: walletConfig.walletId,
      apiKey: walletConfig.apiKey
    });
  }

  /**
   * Get transaction details in batch
   * @param transactionIds - Array of transaction IDs
   * @param walletConfig - Wallet configuration to use
   * @returns Array of transaction details
   * @throws NotFoundException when no wallet configuration is provided
   */
  async getTransactionDetailsBatch(
    transactionIds: string[],
    walletConfig: { walletId: string, apiKey: string }
  ): Promise<TransactionDetails[]> {
    if (!walletConfig || !walletConfig.walletId || !walletConfig.apiKey) {
      throw new NotFoundException('Wallet configuration required for batch transaction fetch');
    }
    
    this.logger.log(`Fetching details for ${transactionIds.length} transactions in batch for wallet ${walletConfig.walletId}`);
    
    try {
      return await Promise.all(
        transactionIds.map(id => this.getTransactionDetails(id, walletConfig))
      );
    } catch (error) {
      this.logger.error(`Batch transaction fetch failed: ${error.message}`);
      throw new Error('Partial transaction data - some items failed to load');
    }
  }

  /**
   * Request Blockradar to resend a transaction webhook
   * @param transactionId - The transaction ID to resend webhook for
   * @param walletConfig - Wallet configuration to use
   * @returns Success status and message
   * @throws NotFoundException when no wallet configuration is provided
   */
  async requestWebhookResend(
    transactionId: string,
    walletConfig: { walletId: string, apiKey: string }
  ): Promise<{ success: boolean; message: string }> {
    if (!walletConfig || !walletConfig.walletId || !walletConfig.apiKey) {
      throw new NotFoundException('Wallet configuration required for webhook resend');
    }
    
    try {
      this.logger.log(`Requesting webhook resend for transaction: ${transactionId}`);
      const url = `${this.baseUrl}/wallets/${walletConfig.walletId}/transactions/webhooks/resend`;
      
      const response = await firstValueFrom(
        this.httpService.post(
          url, 
          { id: transactionId },
          {
            headers: { 'x-api-key': walletConfig.apiKey }
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
