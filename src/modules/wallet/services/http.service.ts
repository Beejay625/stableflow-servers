import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { AxiosError, AxiosRequestConfig } from "axios";
import { DEFAULT_RETRY_ATTEMPTS, DEFAULT_TIMEOUT } from "../constants/timeouts";
import { 
  ApiResponse, 
  ApiErrorResponse, 
  RequestOptions, 
  RetryConfig 
} from "../interfaces";

/**
 * Centralized HTTP service for the Wallet module
 * Provides standardized HTTP methods with retry logic, error handling, and logging
 */
@Injectable()
export class WalletHttpService {
  private readonly logger = new Logger(WalletHttpService.name);
  private readonly defaultRetryConfig: RetryConfig = {
    maxRetries: DEFAULT_RETRY_ATTEMPTS,
    initialDelay: 500,
    maxDelay: 10000,
    factor: 2,
    retryCondition: (error: AxiosError) => {
      // Retry on network errors or 5xx server errors
      return (
        !error.response || 
        (error.response.status >= 500 && error.response.status < 600)
      );
    }
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Make a GET request with retry logic and standardized error handling
   * @param url - The URL to request
   * @param options - Request options
   * @param description - Description of the request for logging purposes
   * @returns Promise with the response data
   */
  async get<T>(
    url: string,
    options?: RequestOptions,
    description: string = "GET request",
  ): Promise<T> {
    this.logger.debug(`Making ${description} to ${url}`);

    try {
      // Convert our RequestOptions to AxiosRequestConfig
      const axiosOptions: AxiosRequestConfig = {
        timeout: options?.timeout || DEFAULT_TIMEOUT,
        headers: options?.headers,
        params: options?.params
      };

      const response = await firstValueFrom(
        this.httpService.get<T>(url, axiosOptions)
      );
      this.logger.debug(`${description} successful`);
      return response.data;
    } catch (error) {
      this.handleHttpError(error as AxiosError, description, url);
      throw error;
    }
  }

  /**
   * Make a POST request with retry logic and standardized error handling
   * @param url - The URL to request
   * @param data - The data to send
   * @param options - Request options
   * @param description - Description of the request for logging purposes
   * @returns Promise with the response data
   */
  async post<T>(
    url: string,
    data: any,
    options?: RequestOptions,
    description: string = "POST request",
  ): Promise<T> {
    this.logger.debug(`Making ${description} to ${url}`);

    try {
      // Convert our RequestOptions to AxiosRequestConfig
      const axiosOptions: AxiosRequestConfig = {
        timeout: options?.timeout || DEFAULT_TIMEOUT,
        headers: options?.headers,
      };

      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, axiosOptions)
      );
      this.logger.debug(`${description} successful`);
      return response.data;
    } catch (error) {
      this.handleHttpError(error as AxiosError, description, url);
      throw error;
    }
  }

  /**
   * Make a PUT request with retry logic and standardized error handling
   * @param url - The URL to request
   * @param data - The data to send
   * @param options - Request options
   * @param description - Description of the request for logging purposes
   * @returns Promise with the response data
   */
  async put<T>(
    url: string,
    data: any,
    options?: RequestOptions,
    description: string = "PUT request",
  ): Promise<T> {
    this.logger.debug(`Making ${description} to ${url}`);

    try {
      // Convert our RequestOptions to AxiosRequestConfig
      const axiosOptions: AxiosRequestConfig = {
        timeout: options?.timeout || DEFAULT_TIMEOUT,
        headers: options?.headers,
      };

      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, axiosOptions)
      );
      this.logger.debug(`${description} successful`);
      return response.data;
    } catch (error) {
      this.handleHttpError(error as AxiosError, description, url);
      throw error;
    }
  }

  /**
   * Standardized error handling for HTTP requests
   * @param error - The AxiosError
   * @param description - Description of the request
   * @param url - The URL that was requested
   */
  private handleHttpError(
    error: AxiosError,
    description: string,
    url: string,
  ): void {
    const statusCode = error.response?.status;
    const responseData = error.response?.data;
    
    this.logger.error(
      `Error in ${description} to ${url}: ${error.message}`,
      error.stack,
    );
    
    if (statusCode) {
      this.logger.error(`Status code: ${statusCode}`);
    }
    
    if (responseData) {
      this.logger.error(`Response data: ${JSON.stringify(responseData)}`);
    }
  }
} 