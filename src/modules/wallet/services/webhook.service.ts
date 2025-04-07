import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { RedisService } from "../../redis/redis.service";
import { WalletConfigService } from "../../../common/utils/wallet-config";

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
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

  /**
   * Extract relevant data from webhook payload
   */
  extractWebhookData(payload: any): {
    transactionId: string;
    eventType: string;
    chain: string | null;
  } {
    // Direct access to nested properties with fallbacks
    const data = payload?.data || {};

    // Get blockchain name using the utility function
    const chain = this.walletConfigService.getBlockchainName(payload);

    // Extract only what's needed for processing with defaults
    return {
      transactionId: data.id || payload.id || "",
      eventType: data.event_type || data.eventType || payload.event || "",
      chain: chain || null,
    };
  }

  /**
   * Checks if a webhook has already been processed using Redis
   * @param transactionId - The transaction ID to check
   * @returns Promise<boolean> - Whether the webhook has been processed
   */
  async isWebhookProcessed(transactionId: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const idempotencyKey = `idempotency:webhook:${transactionId}`;
    const status = await client.get(idempotencyKey);
    return !!status;
  }

  /**
   * Mark webhook as processed in Redis
   * @param transactionId - The transaction ID to mark
   * @param status - The processing status (processing, completed, error)
   */
  async markWebhookProcessed(
    transactionId: string,
    status: string = "completed",
  ): Promise<void> {
    const client = this.redisService.getClient();
    const idempotencyKey = `idempotency:webhook:${transactionId}`;
    await client.set(idempotencyKey, status, "EX", 86400); // 24 hours expiry
  }

  /**
   * Sanitizes the payload for logging by removing sensitive fields
   */
  private sanitizePayload(payload: any): any {
    if (!payload) return {};

    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(payload));

    // List of potentially sensitive fields to redact
    const sensitiveFields = [
      "signature",
      "apiKey",
      "key",
      "secret",
      "token",
      "password",
      "credential",
    ];

    // Recursively sanitize the object
    const sanitizeObject = (obj: any) => {
      if (!obj || typeof obj !== "object") return;

      Object.keys(obj).forEach((key) => {
        // If field name matches sensitive pattern, redact it
        if (
          sensitiveFields.some((field) =>
            key.toLowerCase().includes(field.toLowerCase()),
          )
        ) {
          obj[key] = "[REDACTED]";
        } else if (typeof obj[key] === "object") {
          // Recursively sanitize nested objects
          sanitizeObject(obj[key]);
        }
      });
    };

    sanitizeObject(sanitized);
    return sanitized;
  }
}
