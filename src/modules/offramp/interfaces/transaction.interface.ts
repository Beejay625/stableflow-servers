import { TransactionStatus } from '../../wallet/constants/status.enum';
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