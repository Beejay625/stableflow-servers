import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { WalletConfigService } from "../../../common/utils/wallet-config";

@Injectable()
export class ValidateSignatureService {
  private readonly logger = new Logger(ValidateSignatureService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly walletConfigService: WalletConfigService,
  ) {}

  /**
   * Validate webhook signature using the appropriate API key for the wallet
   */
  validateSignature(event: any, signature: string): boolean {
    if (!signature) {
      return false;
    }

    // Get the wallet-specific configuration
    const walletConfig = this.walletConfigService.getWalletConfig(event);

    // If no matching wallet config was found, signature cannot be validated
    if (!walletConfig || !walletConfig.apiKey) {
      this.logger.warn(
        `No matching wallet configuration found, cannot validate signature`,
      );
      return false;
    }

    const generatedSignature = crypto
      .createHmac("sha512", walletConfig.apiKey)
      .update(JSON.stringify(event))
      .digest("hex");

    return generatedSignature === signature;
  }
}
