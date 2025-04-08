/**
 * Interface for BlockRadar API Wallet Address Response
 */
export interface BlockRadarAddressResponse {
  message: string;
  statusCode: number;
  data: {
    id: string;
    address: string;
    name: string;
    type: string;
    derivationPath: string;
    metadata: {
      [key: string]: any;
      business_id?: string;
      user_id?: string;
    };
    configurations: {
      disableAutoSweep: boolean;
      enableGaslessWithdraw: boolean;
      showPrivateKey: boolean;
    };
    network: string;
    blockchain?: {
      isEvmCompatible: boolean;
      [key: string]: any;
    };
    publicMetadata?: {
      [key: string]: any;
    };
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Interface for wallet address creation request payload
 */
export interface WalletAddressRequest {
  name: string;
  disableAutoSweep: boolean;
  enableGaslessWithdraw: boolean;
  showPrivateKey: boolean;
  metadata: {
    business_id: string;
    user_id: string;
    wallet_type: string;
  };
}

/**
 * Interface representing token data from BlockRadar API
 */
export interface TokenData {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  blockchainId: string;
  blockchainName: string;
  network: string;
}

/**
 * Interface for token balance data returned from the API
 */
export interface TokenBalance {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  balance: string;
  convertedBalance: string;
  blockchain: string;
  blockchainId: string;
  address: string;
}

/**
 * Webhook payload format
 */
export interface WebhookPayload {
  id?: string;
  event?: string;
  data?: {
    id?: string;
    event?: string;
    event_type?: string;
    eventType?: string;
    recipientAddress?: string;
    senderAddress?: string;
    amount?: string;
    asset?: {
      symbol?: string;
    };
    currency?: string;
    [key: string]: any;
  };
  [key: string]: any;
}
