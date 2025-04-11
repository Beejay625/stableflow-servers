import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface WalletConfigData {
  apiKey: string;
  walletId: string;
  walletName: string;
}

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
   * @param payload Contains blockchain and token information
   * @returns The wallet configuration to use for API calls
   */
  getWalletConfig(payload: any): WalletConfigData {
    // Extract blockchain and wallet information from payload
    const blockchainName = payload?.data?.blockchain?.name?.toLowerCase() || "";
    const tokenSymbol = payload?.data?.asset?.symbol?.toUpperCase() || "";

    this.logger.debug(
      `Extracting wallet config for blockchain: ${blockchainName}, token: ${tokenSymbol}`,
    );

    // Determine wallet name based on blockchain and token
    let walletName = "default";

    if (blockchainName.includes("bnb") && tokenSymbol === "USDT") {
      walletName = "bep20usdt";
    } else if (blockchainName === "base" && tokenSymbol === "USDC") {
      walletName = "usdcbase";
    } else if (blockchainName === "tron" && tokenSymbol === "USDT") {
      // For future implementation
      walletName = "tronusdt";
    }

    this.logger.log(
      `Determined wallet name: ${walletName} for blockchain: ${blockchainName}, token: ${tokenSymbol}`,
    );

    // Get configuration from environment variables based on wallet name
    const config = this.configService.get(walletName);

    if (!config) {
      this.logger.warn(
        `No configuration found for wallet name: ${walletName}, using blockradar configuration`,
      );

      // Fallback to blockradar configuration from env.config.ts
      const blockradarConfig = this.configService.get("blockradar");
      return {
        apiKey: blockradarConfig.apiKey,
        walletId: blockradarConfig.walletId,
        walletName: "blockradar",
      };
    }

    // Always use wallet ID from configuration, ignore payload wallet ID
    return {
      apiKey: config.apiKey,
      walletId: config.walletId,
      walletName,
    };
  }

  /**
   * Gets the correct wallet configuration for a specific transaction ID
   * Uses blockchain and token information to determine the correct wallet config from environment
   *
   * @param transactionData Transaction data with blockchain and token info
   * @returns The wallet configuration to use for API calls
   */
  getWalletConfigForTransaction(transactionData: any): WalletConfigData {
    // Extract blockchain and token information from transaction data
    const blockchainName = transactionData?.blockchainName?.toLowerCase() || "";
    const tokenSymbol = transactionData?.tokenSymbol?.toUpperCase() || "";
    
    // Don't use walletId from transaction, only use the environment config
    
    // Mock payload structure to reuse existing function
    const payload = {
      data: {
        blockchain: { name: blockchainName },
        asset: { symbol: tokenSymbol },
        wallet: { id: "" }, // Empty ID to ensure we use the config value
      },
    };

    return this.getWalletConfig(payload);
  }

  /**
   * Saves the full chain name correctly from the payload
   *
   * @param payload The webhook payload from Blockradar
   * @returns The proper blockchain name for saving to the database
   */
  getBlockchainName(payload: any): string {
    // Extract the full blockchain name, ensuring it's saved correctly
    const blockchainName =
      payload?.data?.blockchain?.name || payload?.data?.network || "ethereum";

    // Return the exact blockchain name as provided by Blockradar without modification
    return blockchainName;
  }
}
