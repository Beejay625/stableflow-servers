import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class ResendWebhookService {
  private readonly logger = new Logger(ResendWebhookService.name);
  private readonly baseUrl = 'https://api.blockradar.co/v1';

  constructor(
    private readonly httpService: HttpService
  ) {}

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