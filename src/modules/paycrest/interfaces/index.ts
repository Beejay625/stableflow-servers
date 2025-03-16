export * from './paycrest.interface';

/**
 * Common response format from Paycrest API
 */
export interface PaycrestResponse<T> {
  message: string;
  status: 'success' | 'error';
  data: T;
}

/**
 * Request format for account verification
 */
export interface VerifyAccountRequest {
  institution: string;
  accountIdentifier: string;
}

/**
 * Bank or financial institution
 */
export interface Institution {
  name: string;
  code: string;
  type: 'bank' | 'telco' | 'wallet';
}

/**
 * Currency information
 */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  shortName?: string;
  decimals?: number;
  marketRate?: string;
  networks?: string[];
}

/**
 * Request format for exchange rate
 */
export interface ExchangeRateRequest {
  sourceCurrency: string;
  targetCurrency: string;
  amount: number;
}
