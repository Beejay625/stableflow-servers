import { HttpException, HttpStatus } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { delay, mergeMap, retry } from 'rxjs/operators';
import { HttpErrorException } from '../exceptions/http-error.exception';
import axios, { AxiosError } from 'axios';

/**
 * Utility function to handle Axios errors and convert them to our custom HttpErrorException
 * @param error - The error caught from Axios
 */
export const handleAxiosError = (error: any): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    
    // Fix type safety by using type assertion
    const responseData = axiosError.response?.data as any;
    const message = responseData?.message || axiosError.message || 'An error occurred with the API request';
    const code = responseData?.code || axiosError.code || 'UNKNOWN_ERROR';
    
    throw new HttpErrorException(message, status, code);
  }
  
  throw error;
};

/**
 * RxJS operator to retry a failed request with exponential backoff
 * @param maxRetries - Maximum number of retry attempts
 * @param initialDelayMs - Initial delay in milliseconds before the first retry
 */
export const retryWithBackoff = (
  maxRetries = 3,
  initialDelayMs = 1000
) => {
  let retries = 0;

  return (source: Observable<any>) =>
    source.pipe(
      retry({
        count: maxRetries,
        delay: (error) => {
          if (retries >= maxRetries) {
            return throwError(() => error);
          }

          // Calculate backoff delay
          const backoffDelay = initialDelayMs * Math.pow(2, retries);
          retries++;
          
          return throwError(() => error).pipe(
            delay(backoffDelay),
            mergeMap(() => {
              // Continue retry
              return throwError(() => error);
            })
          );
        },
      })
    );
}; 