export interface Blockchain {
  id: string;
  name: string;
  slug: string;
  symbol: string;
  isEvmCompatible: boolean;
  tokenStandard: string;
  logoUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  derivationPath: string;
}

export interface AddressConfiguration {
  disableAutoSweep?: boolean;
  enableGaslessWithdraw?: boolean;
  showPrivateKey?: boolean;
  aml?: {
    message: string;
    provider: string;
    status: string;
  };
}

export interface GenerateAddressRequest {
  disableAutoSweep?: boolean;
  enableGaslessWithdraw?: boolean;
  showPrivateKey?: boolean;
  metadata?: Record<string, any>;
  name?: string;
}

export interface Address {
  id: string;
  address: string;
  name?: string;
  type: string;
  isActive: boolean;
  network: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  derivationPath: string;
  blockchain: Blockchain;
  configurations: AddressConfiguration;
}

export interface BlockradarResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

export interface Transaction {
  id: string;
  hash: string;
  amount: string;
  token: {
    symbol: string;
    decimals: number;
    address?: string;
  };
  from: string;
  to: string;
  status: string;
  network: string;
  blockNumber: number;
  blockHash: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}
