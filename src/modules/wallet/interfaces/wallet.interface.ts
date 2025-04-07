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
  disableAutoSweep: boolean;
  enableGaslessWithdraw: boolean;
  metadata: {
    business_id: string;
    user_id: string;
    [key: string]: string;
  };
  name: string;
  showPrivateKey: boolean;
}
