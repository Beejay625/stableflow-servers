import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { parseUnits } from 'viem';

import { Transaction as WalletTransaction } from "../wallet/entities/transaction.entity";
import { Transaction } from "./interfaces/transaction.interface";
import {
  getTokenAddress,
  mapNetworkFromConfig,
  getTokenInfoByAddress,
} from "./utils";
import { TransactionStatus } from "../wallet/constants/status.enum";
import { PaycrestService } from "../paycrest/paycrest.service";
import { OfframpApiService } from './services/offramp-api.service';
import { WalletConfigService } from "../../common/utils/wallet-config";

/**
 * Service responsible for preparing transaction data for offramp processing
 * Acts as a bridge between raw blockchain transactions and the offramp service
 */
@Injectable()
export class PrepareTransactionService {
  private readonly logger = new Logger(PrepareTransactionService.name);
  private readonly configNetwork: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly paycrestService: PaycrestService,
    private readonly offrampApiService: OfframpApiService,
    private readonly walletConfigService: WalletConfigService,
  ) {
    this.configNetwork = this.configService.get<string>("blockradar.network");
    this.logger.log(
      `PrepareTransactionService initialized for network config: ${this.configNetwork}`,
    );
  }

  /**
   * Fetches and prepares transaction details needed for offramp processing
   *
   * Steps:
   * 1. Retrieve transaction and associated business data
   * 2. Validate required bank details
   * 3. Map token symbol to blockchain address based on chain and network config
   * 4. Get token rate from Paycrest service
   * 5. Calculate amount in token units
   * 6. Prepare encrypted recipient data
   * 7. Format data for offramp processing
   *
   * @param transactionId - The ID of the transaction to process
   * @returns Promise<Transaction> - Transaction details formatted for offramp
   * @throws Error if transaction not found or missing required data
   */
  async prepareTransactionForOfframp(
    transactionId: string,
  ): Promise<Transaction> {
    try {
      this.logger.log(
        `Preparing transaction ${transactionId} for offramp processing`,
      );

      // Step 1: Fetch transaction with related business data
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId },
        relations: ["business", "business.bankDetails"],
      });

      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      if (!transaction.business) {
        throw new Error(
          `Transaction ${transactionId} has no associated business`,
        );
      }

      // Step 2: Validate bank account details
      const bankDetails = transaction.business.bankDetails;
      if (!bankDetails) {
        throw new Error(
          `Business ${transaction.business.id} has no bank details`,
        );
      }

      if (
        !bankDetails.accountNumber ||
        !bankDetails.accountName ||
        !bankDetails.bankCode
      ) {
        throw new Error(`Missing bank details for business ${transaction.business.id}: 
          accountNumber: ${!!bankDetails.accountNumber},
          accountName: ${!!bankDetails.accountName},
          bankCode: ${!!bankDetails.bankCode}
        `);
      }

      // Step 3: Map network based on config and transaction chain
      const network = mapNetworkFromConfig(
        this.configNetwork,
        transaction.chain,
      );
      this.logger.log(
        `Mapped network ${network} for chain ${transaction.chain} with config ${this.configNetwork}`,
      );
      
      // Enhanced logging
      this.logger.log(
        `Transaction details: token=${transaction.token}, chain=${transaction.chain}, businessAddress=${transaction.businessAddress}, tokenAmount=${transaction.tokenAmount}`,
      );

      // Step 4: Get token address from token symbol
      const tokenAddress = getTokenAddress(network, transaction.token);
      if (!tokenAddress) {
        throw new Error(
          `Token address not found for ${transaction.token} on network ${network}`,
        );
      }

      // Step 5: Get token information to retrieve correct decimals
      const tokenInfo = getTokenInfoByAddress(tokenAddress);
      if (!tokenInfo) {
        throw new Error(
          `Token information not found for ${transaction.token} on network ${network}`,
        );
      }

      const tokenDecimals = tokenInfo.decimals;
      const rpcUrl = tokenInfo.rpcUrl;
      const chainId = tokenInfo.chainId;
      this.logger.log(
        `Using token decimals: ${tokenDecimals} for ${transaction.token}, rpcUrl: ${rpcUrl}, chainId: ${chainId}`,
      );

      // Step 6: Get wallet configuration based on chain and token
      // This is crucial for processing the transaction with the correct wallet
      const walletConfig = this.walletConfigService.getWalletConfigForTransaction({
        blockchainName: transaction.chain,
        tokenSymbol: transaction.token
        // Don't pass transaction walletId as we want to use only the config walletId
      });
      
      this.logger.log(
        `Using wallet configuration: walletName=${walletConfig.walletName}, walletId=${walletConfig.walletId} for chain=${transaction.chain}, token=${transaction.token}`,
      );

      // Use addressId from transaction (business) but walletId from config
      const addressId = transaction.addressId;
      const walletId = walletConfig.walletId;
      
      if (!addressId) {
        throw new Error(
          `Missing address ID for transaction ${transactionId}. This should be set in the business record.`
        );
      }
      
      if (!walletId) {
        throw new Error(
          `Missing wallet ID from wallet configuration for chain=${transaction.chain}, token=${transaction.token}`
        );
      }

      // Step 7: Get token rate from Paycrest service - always use NGN as fiat
      const fiat = "NGN";
      // Ensure token symbol is uppercase for rate fetching
      const tokenSymbol = transaction.token.toUpperCase();

      // Log the transaction amount for debugging
      this.logger.log(
        `Original transaction amount: ${transaction.tokenAmount}, type: ${typeof transaction.tokenAmount}`,
      );
      const amountStr = transaction.tokenAmount.toString();
      this.logger.log(
        `Fetching token rate for ${tokenSymbol}/${fiat}, amount: ${amountStr}`,
      );

      // Try up to 3 times to get a valid rate
      let rateResponse;
      let attempts = 0;
      const maxAttempts = 3;
      let rate = 0;
      let currency = "NGN";

      while (attempts < maxAttempts) {
        try {
          rateResponse = await this.paycrestService.getTokenRate(
            tokenSymbol,
            amountStr,
            fiat
          );
          this.logger.log(
            `[DEBUG] Raw rate response: ${JSON.stringify(rateResponse)}`,
          );

          if (
            rateResponse &&
            rateResponse.status === "success" &&
            rateResponse.data
          ) {
            rate = parseFloat(rateResponse.data);
            if (isNaN(rate) || rate <= 0) {
              this.logger.warn(`Invalid rate value: ${rateResponse.data}`);
              attempts++;
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }
            this.logger.log(
              `Received valid rate: ${rate} for ${tokenSymbol}/${fiat}`,
            );
            break;
          } else {
            this.logger.warn(
              `Invalid rate response: ${JSON.stringify(rateResponse)}`,
            );
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (rateError) {
          this.logger.error(
            `Error fetching rate (attempt ${attempts + 1}/${maxAttempts}): ${
              rateError.message
            }`,
          );
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error(`Failed to get valid rate after ${maxAttempts} attempts: ${rateError.message}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Step 8: Calculate token amount in smallest units (e.g., wei for ETH) using decimals
      let amountInTokenUnits: string;
      try {
        // The transaction.tokenAmount is in display units (e.g., 0.1 USDC)
        // We need to convert it to smallest units (e.g., 100000 for 0.1 USDC with 6 decimals)
        this.logger.log(`Converting amount ${transaction.tokenAmount} to token units with ${tokenDecimals} decimals`);
        amountInTokenUnits = parseUnits(transaction.tokenAmount.toString(), tokenDecimals).toString();
        this.logger.log(`Converted amount: ${amountInTokenUnits} (in smallest units)`);
      } catch (conversionError) {
        this.logger.error(`Error converting amount to token units: ${conversionError.message}`);
        throw new Error(`Failed to convert amount: ${conversionError.message}`);
      }
      
      // Step 9: Prepare encrypted recipient data
      const encryptedRecipient = await this.offrampApiService.prepareEncryptedRecipientData(
        bankDetails.accountNumber,
        bankDetails.accountName,
        bankDetails.bankCode,
        currency,
        `Offramp for transaction ${transaction.transactionId}` // Use transaction ID as memo
      );

      // Step 10: Return properly formatted transaction
      return {
        id: transaction.transactionId,
        senderAddress: transaction.businessAddress,
        recipientName: bankDetails.accountName,
        accountIdentifier: bankDetails.accountNumber,
        institution: bankDetails.bankCode,
        tokenAddress,
        token: transaction.token,
        tokenDecimals: tokenDecimals,
        tokenSymbol: transaction.token,
        amount: transaction.tokenAmount,
        amountInTokenUnits: amountInTokenUnits,
        currency,
        rate: Math.round(rate * 100),
        refundAddress: transaction.businessAddress,
        status: TransactionStatus.PENDING,
        network,
        chain: transaction.chain,
        walletId: walletId,
        addressId: addressId,
        rpcUrl: rpcUrl,
        chainId: chainId,
        encryptedRecipient: encryptedRecipient,
        memo: `Offramp for transaction ${transaction.transactionId}`,
      };
    } catch (error) {
      this.logger.error(
        `Error preparing transaction ${transactionId} for offramp: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
