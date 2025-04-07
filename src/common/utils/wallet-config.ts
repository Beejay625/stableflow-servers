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
   * based on the blockchain and wallet information from the webhook.
   *
   * @param payload The webhook payload from Blockradar
   * @returns The wallet configuration to use for API calls
   */
  getWalletConfig(payload: any): WalletConfigData {
    // Extract blockchain and wallet information from payload
    const blockchainName = payload?.data?.blockchain?.name?.toLowerCase() || "";
    const walletId = payload?.data?.wallet?.id || "";
    const tokenSymbol = payload?.data?.asset?.symbol?.toUpperCase() || "";

    this.logger.debug(
      `Extracting wallet config for blockchain: ${blockchainName}, token: ${tokenSymbol}, walletId: ${walletId}`,
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

    // Verify payload wallet ID matches config wallet ID
    if (walletId && config.walletId && walletId !== config.walletId) {
      this.logger.warn(
        `Wallet ID mismatch: ${walletId} (payload) vs ${config.walletId} (config), using payload wallet ID`,
      );
    }

    return {
      apiKey: config.apiKey,
      walletId: walletId || config.walletId, // Prefer payload wallet ID if available
      walletName,
    };
  }

  /**
   * Gets the correct wallet configuration for a specific transaction ID
   * Uses the existing TransactionData from getTransactionDetails if available
   *
   * @param transactionData Transaction data to get configuration for
   * @returns The wallet configuration to use for API calls
   */
  getWalletConfigForTransaction(transactionData: any): WalletConfigData {
    // Extract blockchain and token information from transaction data
    const blockchainName = transactionData?.blockchainName?.toLowerCase() || "";
    const tokenSymbol = transactionData?.tokenSymbol?.toUpperCase() || "";
    const walletId = transactionData?.walletId || "";

    // Mock payload structure to reuse existing function
    const payload = {
      data: {
        blockchain: { name: blockchainName },
        asset: { symbol: tokenSymbol },
        wallet: { id: walletId },
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
