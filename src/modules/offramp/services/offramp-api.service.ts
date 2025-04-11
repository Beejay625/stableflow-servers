import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { fetchAggregatorPublicKey, publicKeyEncrypt } from '../utils';

/**
 * Service for handling external API calls for the offramp process
 * Isolates API-specific functionality for better separation of concerns
 */
@Injectable()
export class OfframpApiService {
  private readonly logger = new Logger(OfframpApiService.name);
  private readonly aggregatorUrl: string;
  private readonly ngnProviderId: string;
  private readonly kesProviderId: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.aggregatorUrl = this.configService.get<string>('paycrest.baseUrl');
    this.ngnProviderId = this.configService.get<string>('NGN_PROVIDER_ID');
    this.kesProviderId = this.configService.get<string>('KES_PROVIDER_ID');
  }

  /**
   * Prepares and encrypts recipient data for offramp transaction
   * 
   * @param accountIdentifier Recipient's account identifier
   * @param recipientName Recipient's name
   * @param institution Recipient's bank/institution
   * @param currency Currency code (e.g., 'NGN')
   * @param memo Optional memo for the transaction
   * @returns Encrypted recipient data string
   */
  async prepareEncryptedRecipientData(
    accountIdentifier: string,
    recipientName: string,
    institution: string,
    currency: string,
    memo: string = ''
  ): Promise<string> {
    try {
      // Prepare recipient data
      const recipient = {
        accountIdentifier,
        accountName: recipientName,
        institution,
        providerId: currency === 'NGN' ? this.ngnProviderId : this.kesProviderId,
        memo: memo || '',
      };

      // Encrypt recipient data using aggregator's public key
      const publicKey = await fetchAggregatorPublicKey(this.aggregatorUrl);
      return publicKeyEncrypt(recipient, publicKey.data);
    } catch (error) {
      this.logger.error(`Error preparing encrypted recipient data: ${error.message}`);
      throw new Error(`Failed to encrypt recipient data: ${error.message}`);
    }
  }

  /**
   * Checks the order status using chainId and orderId parameters
   * Returns the raw response data without additional processing
   * 
   * @param chainId - The blockchain chain ID
   * @param orderId - The order ID to check
   * @returns The raw response data from the API
   */
  async checkOrderStatusByChainId(
    chainId: number | string,
    orderId: string
  ): Promise<any> {
    try {
      const response = await axios.get(
        `${this.aggregatorUrl}/orders/${chainId}/${orderId}`
      );
      
      this.logger.log(`Order status check for ${orderId} on chain ${chainId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error checking order status: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }
} 