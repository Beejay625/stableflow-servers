export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  STALLED = 'stalled',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
}

export interface Transaction {
  id: string;
  senderAddress: string;
  recipientName: string;
  accountIdentifier: string;
  institution: string;
  tokenAddress: string;
  token: string;
  tokenDecimals: number;
  amount: number;
  currency: string;
  rate: number;
  refundAddress: string;
  memo?: string;
  status: TransactionStatus;
  network: string;
}

export interface Token {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
}

interface TransactionPreviewProps {
  formValues: any; // No strict typing
} 