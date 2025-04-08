/**
 * Common API response structure
 */
export interface ApiResponse<T> {
  message: string;
  statusCode: number;
  data: T;
}

/**
 * Error response from API
 */
export interface ApiErrorResponse {
  message: string;
  statusCode: number;
  error: string;
  details?: any;
}

/**
 * Interface for HTTP request options
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, any>;
  timeout?: number;
}

/**
 * Interface for HTTP retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
  retryCondition?: (error: any) => boolean;
} 