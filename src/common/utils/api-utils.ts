import { HttpException, HttpStatus } from '@nestjs/common';
import { Observable, throwError, timer } from 'rxjs';
import { delay, mergeMap, retryWhen } from 'rxjs/operators';
import { HttpErrorException } from '../exceptions/http-error.exception';
import axios, { AxiosError } from 'axios';

/**
 * Utility function to handle Axios errors and convert them to our custom HttpErrorException
 * @param error - The error caught from Axios
 * @param customMessage - Optional custom message to prefix the error
 */
export const handleAxiosError = (error: any, customMessage?: string): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    
    // Fix type safety by using type assertion
    const responseData = axiosError.response?.data as any;
    let message = responseData?.message || axiosError.message || 'An error occurred with the API request';
    
    // Add custom message prefix if provided
    if (customMessage) {
      message = `${customMessage}: ${message}`;
    }
    
    const code = responseData?.code || axiosError.code || 'UNKNOWN_ERROR';
    
    throw new HttpErrorException(message, status, code);
  }
  
  // If it's not an Axios error, add custom message if provided
  if (customMessage) {
    throw new HttpErrorException(`${customMessage}: ${error.message || 'Unknown error'}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
  
  throw error;
};

/**
 * Retries an observable operation with exponential backoff
 * @param maxRetries Maximum number of retries
 * @param initialRetryDelay Initial delay in milliseconds
 * @returns Observable operator that retries with backoff
 */
export function retryWithBackoff(maxRetries = 3, initialRetryDelay = 1000) {
  let retries = 0;

  return retryWhen(errors =>
    errors.pipe(
      mergeMap(error => {
        if (retries >= maxRetries) {
          return throwError(() => error);
        }
        
        retries++;
        const retryDelay = initialRetryDelay * Math.pow(2, retries - 1);
        console.log(`Retrying after ${retryDelay}ms`);
        
        return timer(retryDelay);
      })
    )
  );
} 