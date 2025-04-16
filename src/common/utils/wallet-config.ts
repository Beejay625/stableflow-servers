import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface WalletConfigData {
  apiKey: string;
  walletId: string;
  walletName: string;
}

/**
 * Maps network names to their standardized versions
 */
const CHAIN_NAMES = {
  MAINNET: {
    BASE: "Base",
    BNB: "BNB Smart Chain"
  },
  TESTNET: {
    BASE: "Base Sepolia",
    BNB: "BNB Smart Chain Testnet"
  }
};

/**
 * Service for determining which wallet configuration to use based on the
 * blockchain and wallet information from the webhook.
 */
@Injectable()
export class WalletConfigService {
  private readonly logger = new Logger(WalletConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the appropriate wallet configuration from environment variables
   * based on the blockchain and token information.
   *
   * @param payload Contains blockchain and token information in either webhook or transaction format
   * @returns The wallet configuration to use for API calls
   */
  getWalletConfig(payload: any): WalletConfigData {
    // Get blockchain name - either from webhook or directly
    const blockchainName = payload.data?.blockchain ? 
      this.getBlockchainName(payload) : 
      payload.blockchainName;

    if (!blockchainName) {
      throw new Error('Missing blockchain name');
    }
    
    const tokenSymbol = (
      payload?.data?.asset?.symbol || 
      payload?.tokenSymbol || 
      ""
    ).toUpperCase();

    this.logger.debug(
      `Extracting wallet config for blockchain: ${blockchainName}, token: ${tokenSymbol}`,
    );

    // Determine wallet name based on blockchain and token
    let walletName = "default";

    if (blockchainName.includes("BNB Smart Chain") && tokenSymbol === "USDT") {
      walletName = "bep20usdt";
    } else if (blockchainName.includes("Base") && tokenSymbol === "USDC") {
      walletName = "usdcbase";
    } else if (blockchainName.includes("tron") && tokenSymbol === "USDT") {
      walletName = "tronusdt";
    }

    this.logger.log(
      `Determined wallet name: ${walletName} for blockchain: ${blockchainName}, token: ${tokenSymbol}`,
    );

    // Get configuration from environment variables based on wallet name
    const config = this.configService.get(walletName);

    if (!config) {
      this.logger.error(
        `No configuration found for wallet name: ${walletName} (blockchain: ${blockchainName}, token: ${tokenSymbol})`
      );
      throw new Error(`No wallet configuration found for ${blockchainName} with token ${tokenSymbol}`);
    }

    return {
      apiKey: config.apiKey,
      walletId: config.walletId,
      walletName,
    };
  }

  /**
   * Saves the full chain name correctly from the payload
   *
   * @param payload The webhook payload from Blockradar
   * @returns The proper blockchain name for saving to the database
   */
  getBlockchainName(payload: any): string {
    // Check if it's testnet from the network field
    const isTestnet = payload?.data?.network === 'testnet';
    
    // Get the blockchain name from the payload
    const blockchainName = (
      payload?.data?.blockchain?.name ||
      payload?.blockchainName ||
      ''
    ).toLowerCase();
    
    // Map the blockchain name based on network type
    if (blockchainName.includes('base')) {
      return isTestnet ? CHAIN_NAMES.TESTNET.BASE : CHAIN_NAMES.MAINNET.BASE;
    }
    
    if (blockchainName.includes('bnb') || blockchainName.includes('bsc')) {
      return isTestnet ? CHAIN_NAMES.TESTNET.BNB : CHAIN_NAMES.MAINNET.BNB;
    }
    
    // If no match found, throw an error
    throw new Error(`Unsupported blockchain: ${blockchainName}`);
  }
}
