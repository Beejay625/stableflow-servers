import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { handleAxiosError, retryWithBackoff } from "../../common/utils/http.util";
import {
  Institution,
  PaycrestResponse,
  ExchangeRateRequest,
  Currency,
} from "./interfaces";
import {
  API_PATHS,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_TIMEOUT,
} from "./constants";
import { AxiosResponse } from "axios";

@Injectable()
export class PaycrestService {
  private readonly logger = new Logger(PaycrestService.name);
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: HttpService,
  ) {
    const apiKey = this.configService.get<string>("paycrest.apiKey");
    if (!apiKey) {
      throw new Error("PAYCREST_API is not configured");
    }

    this.baseUrl = this.configService.get<string>("paycrest.baseUrl");
    if (!this.baseUrl) {
      throw new Error("PAYCREST_BASE_URL is not configured");
    }

    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    this.logger.log(
      `PaycrestService initialized with base URL: ${this.baseUrl}`,
    );
  }

  /**
   * Get list of supported financial institutions
   * @param currencyCode Optional currency code to filter institutions
   * @returns Array of institutions
   */
  async getInstitutions(currencyCode?: string): Promise<Institution[]> {
    try {
      this.logger.debug(
        `Getting institutions for currency: ${currencyCode || "all"}`,
      );

      if (currencyCode) {
        const response = await this.httpClient.axiosRef.get<PaycrestResponse<Institution[]>>(
          `institutions/${currencyCode}`,
          {
            baseURL: this.baseUrl,
            headers: this.headers,
            timeout: DEFAULT_TIMEOUT,
          }
        );
        
        if (response.data?.data && Array.isArray(response.data.data)) {
          return response.data.data.map((institution) => ({
            ...institution,
            supportedCurrencies: [currencyCode],
          }));
        }
        
        return [];
      }
      
      // If no currency specified, default to NGN
      return this.getInstitutions("NGN");
    } catch (error) {
      this.logger.error(
        `Error getting institutions for currency ${currencyCode}: ${error.message}`,
        error.stack,
      );
      throw handleAxiosError(error);
    }
  }

  /**
   * Get exchange rate information
   * @param data - Exchange rate request data
   * @returns Promise with exchange rate information
   */
  async getExchangeRate(
    data: ExchangeRateRequest,
  ): Promise<PaycrestResponse<any>> {
    try {
      this.logger.debug(`Getting exchange rate: ${JSON.stringify(data)}`);
      
      const response = await this.httpClient.axiosRef.post<PaycrestResponse<any>>(
        "exchange-rate", 
        data, 
        {
          baseURL: this.baseUrl,
          headers: this.headers,
          timeout: DEFAULT_TIMEOUT,
        }
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error getting exchange rate: ${error.message}`,
        error.stack,
      );
      throw handleAxiosError(error);
    }
  }

  /**
   * Get token rate information
   * @param token - Token symbol
   * @param amount - Amount to convert
   * @param fiat - Fiat currency code
   * @param providerId - Optional provider ID
   * @returns Promise with token rate information
   */
  async getTokenRate(
    token: string,
    amount: string,
    fiat: string,
    providerId?: string,
  ): Promise<PaycrestResponse<any>> {
    try {
      this.logger.debug(`Getting token rate for ${token}/${fiat}`);
      
      const response = await this.httpClient.axiosRef.get<PaycrestResponse<any>>(
        `rates/${token}/${amount}/${fiat}${providerId ? `/${providerId}` : ""}`,
        {
          baseURL: this.baseUrl,
          headers: this.headers,
          timeout: DEFAULT_TIMEOUT,
        }
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error getting token rate: ${error.message}`,
        error.stack,
      );
      throw handleAxiosError(error);
    }
  }
}
