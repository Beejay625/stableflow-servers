import { HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';
import { HttpErrorException } from '../exceptions';

interface ErrorResponse {
  message?: string;
  error?: string;
  [key: string]: any;
}

/**
 * Formats query parameters for HTTP requests
 * Removes undefined and null values
 * @param params Object containing query parameters
 * @returns Formatted query string
 */
export const formatQueryParams = (params: Record<string, any>): string => {
  const validParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return validParams;
};

/**
 * Handles Axios errors and transforms them into HttpErrorException
 * @param error Axios error object
 * @throws HttpErrorException
 */
export const handleAxiosError = (error: AxiosError<ErrorResponse>): never => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const status = error.response.status;
    const message = error.response.data?.message || error.response.data?.error || error.message;
    throw new HttpErrorException(message, status, 'HTTP_REQUEST_FAILED', {
      url: error.config?.url,
      method: error.config?.method,
      response: error.response.data
    });
  } else if (error.request) {
    // The request was made but no response was received
    throw new HttpErrorException(
      'Service Unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
      'SERVICE_UNAVAILABLE',
      { url: error.config?.url }
    );
  } else {
    // Something happened in setting up the request that triggered an Error
    throw new HttpErrorException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'REQUEST_SETUP_FAILED'
    );
  }
};

interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
}

/**
 * Retries a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry options
 * @returns Promise that resolves with the function result
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> => {
  const { maxAttempts, initialDelay } = options;
  let attempt = 1;
  let delay = initialDelay;

  while (attempt <= maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, delay));

      // Exponential backoff
      delay *= 2;
      attempt++;
    }
  }

  throw new Error('Max retry attempts reached');
}; 