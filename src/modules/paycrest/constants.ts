/**
 * Injection token for Paycrest configuration
 */
export const PAYCREST_CONFIG_TOKEN = 'PAYCREST_CONFIG';

/**
 * Base API paths for Paycrest endpoints
 */
export const PAYCREST_API_PATHS = {
  VERIFY_ACCOUNT: '/v1/verify-account',
  CURRENCIES: '/v1/currencies',
  INSTITUTIONS: '/v1/institutions',
  RATES: '/v1/rates',
  SENDER_ORDERS: '/v1/sender/orders',
};

/**
 * API paths for Paycrest endpoints
 */
export const API_PATHS = {
  VERIFY_ACCOUNT: '/v1/verify-account',
  INSTITUTIONS: '/v1/institutions',
  CURRENCIES: '/v1/currencies',
  EXCHANGE_RATE: '/v1/exchange-rate',
};

/**
 * Default timeout for API requests in milliseconds
 */
export const DEFAULT_TIMEOUT = 10000;

/**
 * Default number of retry attempts for API requests
 */
export const DEFAULT_RETRY_ATTEMPTS = 3; 