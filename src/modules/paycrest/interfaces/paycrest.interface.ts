/**
 * Configuration options for the Paycrest module
 */
export interface PaycrestConfig {
  /**
   * Base URL for the Paycrest API
   */
  baseUrl: string;
  
  /**
   * API key for authenticating with the Paycrest API
   */
  apiKey: string;
  
  /**
   * Enable response caching (optional)
   */
  enableCaching?: boolean;
  
  /**
   * Cache TTL in seconds (optional, default: 300 seconds)
   */
  cacheTtl?: number;
}

/**
 * Standard response format from Paycrest API
 */
export interface PaycrestResponse<T> {
  message: string;
  status: 'success' | 'error';
  data: T;
}

/**
 * Financial institution details
 */
export interface Institution {
  name: string;
  code: string;
  type: 'bank' | 'mobile_money';
}

/**
 * Currency details
 */
export interface Currency {
  code: string;
  name: string;
  shortName: string;
  decimals: number;
  symbol: string;
  marketRate: string;
}

/**
 * Request to verify a bank account
 */
export interface VerifyAccountRequest {
  institution: string;
  accountIdentifier: string;
}

/**
 * Recipient details for payment orders
 */
export interface Recipient {
  institution: string;
  accountIdentifier: string;
  accountName?: string;
  memo?: string;
  currency?: string;
}

/**
 * Transaction details
 */
export interface Transaction {
  id: string;
  gatewayId: string;
  status: string;
  txHash: string;
  createdAt: string;
}

/**
 * Payment order details
 */
export interface PaymentOrder {
  id: string;
  amount: string;
  amountPaid: string;
  amountReturned: string;
  token: string;
  senderFee: string;
  transactionFee?: string;
  networkFee?: string;
  rate: string;
  network: string;
  gatewayId: string;
  reference: string;
  senderId?: string;
  recipient: Recipient;
  fromAddress: string;
  returnAddress: string;
  receiveAddress?: string;
  feeAddress?: string;
  createdAt: string;
  updatedAt: string;
  txHash: string;
  status: string;
  transactions?: Transaction[];
  percentSettled?: string;
}

/**
 * Payment orders list response
 */
export interface PaymentOrdersList {
  total: number;
  page: number;
  pageSize: number;
  orders: PaymentOrder[];
}

/**
 * Webhook event data
 */
export interface WebhookEvent {
  event: string;
  data: PaymentOrder;
}

/**
 * Cache entry format
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number;
} 