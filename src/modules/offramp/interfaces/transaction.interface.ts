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
  tokenSymbol: string;
  amount: number;
  amountInTokenUnits: string;
  currency: string;
  rate: number;
  refundAddress: string;
  memo?: string;
  status: TransactionStatus;
  network: string;
  chain: string;
  walletId?: string;
  addressId?: string;
  rpcUrl?: string;
  chainId?: number;
  encryptedRecipient: string;
  gatewayAddress?: string;
  apiKey?: string;
  walletConfig?: {
    walletId: string;
    apiKey: string;
    walletName: string;
  };
}

export interface Token {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  rpcUrl: string;
  chainId: number;
  gatewayAddress: string;
}

interface TransactionPreviewProps {
  formValues: any; // No strict typing
} 