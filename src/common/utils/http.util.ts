import { HttpException, HttpStatus } from "@nestjs/common";
import { HttpErrorException } from "../exceptions/http-error.exception";
import axios, { AxiosError } from "axios";

interface ErrorResponse {
  message?: string;
  error?: string;
  code?: string;
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
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  return validParams;
};

/**
 * Handles Axios errors and transforms them into HttpErrorException
 * @param error Axios error object
 * @param customMessage Optional custom message to prefix the error
 * @throws HttpErrorException
 */
export const handleAxiosError = (error: any, customMessage?: string): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ErrorResponse>;
    const status =
      axiosError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract message from response data or error object
    const responseData = axiosError.response?.data as ErrorResponse;
    let message =
      responseData?.message ||
      responseData?.error ||
      axiosError.message ||
      "An error occurred with the API request";

    // Add custom message prefix if provided
    if (customMessage) {
      message = `${customMessage}: ${message}`;
    }

    // Add details to message for better debugging
    const detailedMessage = `${message} - URL: ${axiosError.config?.url || "unknown"}, Method: ${axiosError.config?.method || "unknown"}`;
    
    const code = responseData?.code || "HTTP_REQUEST_FAILED";

    throw new HttpErrorException(detailedMessage, status, code);
  } else if (error.request) {
    // The request was made but no response was received
    const detailedMessage = `Service Unavailable - URL: ${error.config?.url || "unknown"}`;
    const message = customMessage
      ? `${customMessage}: ${detailedMessage}`
      : detailedMessage;
    throw new HttpErrorException(
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      "SERVICE_UNAVAILABLE",
    );
  } else {
    // Something happened in setting up the request that triggered an Error
    const message = customMessage
      ? `${customMessage}: ${error.message || "Unknown error"}`
      : "Internal Server Error";
    throw new HttpErrorException(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      "REQUEST_SETUP_FAILED",
    );
  }
};

/**
 * Options for retry operations
 */
export interface RetryOptions {
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
  options: RetryOptions,
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

      // Optionally log retry attempts
      console.log(`Retrying after ${delay}ms (attempt ${attempt}/${maxAttempts})`);

      // Wait for the calculated delay
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Exponential backoff
      delay *= 2;
      attempt++;
    }
  }

  throw new Error("Max retry attempts reached");
};
