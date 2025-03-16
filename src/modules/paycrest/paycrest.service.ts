import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { handleAxiosError, retryWithBackoff } from '../../common/utils/api-utils';
import { 
  Currency, 
  Institution, 
  VerifyAccountRequest, 
  PaycrestResponse,
  ExchangeRateRequest,
} from './interfaces';
import { API_PATHS, DEFAULT_RETRY_ATTEMPTS, DEFAULT_TIMEOUT } from './constants';
import { AxiosResponse } from 'axios';

@Injectable()
export class PaycrestService {
  private readonly logger = new Logger(PaycrestService.name);
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly httpClient: HttpService;

  constructor(
    private readonly configService: ConfigService,
    httpClient: HttpService,
  ) {
    this.httpClient = httpClient;
    this.baseUrl = this.configService.get<string>('paycrest.baseUrl') || 'https://api.paycrest.io';
    
    // Set up headers with API key for all requests
    const apiKey = this.configService.get<string>('paycrest.apiKey');
    this.headers = {
      'API-Key': apiKey,
      'Content-Type': 'application/json',
    };
    
    this.logger.log(`PaycrestService initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Verify a bank account
   * @param data - Account verification data
   * @returns Promise with verification result
   */
  async verifyAccount(data: VerifyAccountRequest): Promise<PaycrestResponse<string>> {
    try {
      this.logger.debug(`Verifying account: ${JSON.stringify(data)}`);
      const response = await lastValueFrom(
        this.httpClient.post<PaycrestResponse<string>>(API_PATHS.VERIFY_ACCOUNT, data, {
          baseURL: this.baseUrl,
          headers: this.headers,
        }).pipe(retryWithBackoff(DEFAULT_RETRY_ATTEMPTS, DEFAULT_TIMEOUT)),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error verifying account: ${error.message}`, error.stack);
      throw handleAxiosError(error);
    }
  }

  /**
   * Get list of supported institutions
   * @returns Promise with list of supported institutions
   */
  async getSupportedInstitutions(): Promise<PaycrestResponse<Institution[]>> {
    try {
      this.logger.debug('Getting supported institutions');
      const response = await lastValueFrom(
        this.httpClient.get<PaycrestResponse<Institution[]>>(API_PATHS.INSTITUTIONS, {
          baseURL: this.baseUrl,
          headers: this.headers,
        }).pipe(retryWithBackoff(DEFAULT_RETRY_ATTEMPTS, DEFAULT_TIMEOUT)),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error getting institutions: ${error.message}`, error.stack);
      throw handleAxiosError(error);
    }
  }

  /**
   * Get supported currencies
   * @returns Promise with list of supported currencies
   */
  async getSupportedCurrencies(): Promise<PaycrestResponse<Currency[]>> {
    try {
      this.logger.debug('Getting supported currencies');
      const response = await lastValueFrom(
        this.httpClient.get<PaycrestResponse<Currency[]>>(API_PATHS.CURRENCIES, {
          baseURL: this.baseUrl,
          headers: this.headers,
        }).pipe(retryWithBackoff(DEFAULT_RETRY_ATTEMPTS, DEFAULT_TIMEOUT)),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error getting currencies: ${error.message}`, error.stack);
      throw handleAxiosError(error);
    }
  }

  /**
   * Get exchange rate information
   * @param data - Exchange rate request data
   * @returns Promise with exchange rate information
   */
  async getExchangeRate(data: ExchangeRateRequest): Promise<PaycrestResponse<any>> {
    try {
      this.logger.debug(`Getting exchange rate: ${JSON.stringify(data)}`);
      const response = await lastValueFrom(
        this.httpClient.post<PaycrestResponse<any>>(API_PATHS.EXCHANGE_RATE, data, {
          baseURL: this.baseUrl,
          headers: this.headers,
        }).pipe(retryWithBackoff(DEFAULT_RETRY_ATTEMPTS, DEFAULT_TIMEOUT)),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error getting exchange rate: ${error.message}`, error.stack);
      throw handleAxiosError(error);
    }
  }
} 