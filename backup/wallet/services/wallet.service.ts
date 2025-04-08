import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Business,
  OnboardingStep,
} from "../../business/entities/business.entity";
import { User } from "../../auth/entities/auth.entity";
import { firstValueFrom } from "rxjs";
import {
  BlockRadarAddressResponse,
  WalletAddressRequest,
} from "../interfaces/wallet.interface";

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Check if a business is ready for wallet address generation
   * A business is ready when:
   * - It has completed the onboarding process
   * - It doesn't already have a wallet address
   *
   * @param businessId - ID of the business to check
   * @returns Promise<boolean> - True if the business is ready, false otherwise
   */
  async isBusinessReadyForWallet(businessId: string): Promise<boolean> {
    this.logger.log(
      `Checking if business ${businessId} is ready for wallet generation`,
    );

    const business = await this.businessRepository.findOne({
      where: { id: businessId },
    });

    if (!business) {
      this.logger.error(`Business with ID ${businessId} not found`);
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }

    // Business is ready if it has completed onboarding and doesn't have a wallet address yet
    const isReady =
      business.onboardingStep === OnboardingStep.APPROVED &&
      !business.walletAddress;

    this.logger.log(
      `Business ${businessId} is ${isReady ? "ready" : "not ready"} for wallet generation`,
    );
    return isReady;
  }

  /**
   * Generate a wallet address for a business that has completed onboarding
   * This method is called when a business completes the onboarding process
   *
   * @param businessId - ID of the business
   * @returns Promise with the result of the wallet generation
   */
  async generateWalletForCompletedBusiness(businessId: string): Promise<any> {
    this.logger.log(`Generating wallet for completed business ${businessId}`);

    const business = await this.businessRepository.findOne({
      where: { id: businessId },
      relations: ["category"],
    });

    if (!business) {
      this.logger.error(`Business with ID ${businessId} not found`);
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }

    // Check if business is ready for wallet generation
    const isReady =
      business.onboardingStep === OnboardingStep.APPROVED &&
      !business.walletAddress;
    if (!isReady) {
      this.logger.warn(
        `Business ${businessId} is not ready for wallet generation. Status: ${business.onboardingStep}, Has wallet: ${!!business.walletAddress}`,
      );
      return null;
    }

    // Check if the business already has a wallet address
    if (business.walletAddress) {
      this.logger.log(
        `Business ${businessId} already has a wallet address: ${business.walletAddress}`,
      );
      throw new InternalServerErrorException(
        `Business already has a wallet address`,
      );
    }

    // Generate wallet address for the business
    const result = await this.generateWalletAddress(
      businessId,
      business.ownerId,
    );

    return result;
  }

  /**
   * Generate a blockchain wallet address for a business
   * @param businessId - ID of the business
   * @param userId - ID of the user who owns the business
   * @returns Promise with the wallet address data
   */
  async generateWalletAddress(
    businessId: string,
    userId: string,
  ): Promise<BlockRadarAddressResponse> {
    this.logger.log(
      `Generating wallet address for business ${businessId} and user ${userId}`,
    );

    // Validate business exists
    const business = await this.businessRepository.findOne({
      where: { id: businessId },
      relations: ["category"],
    });

    if (!business) {
      this.logger.error(`Business with ID ${businessId} not found`);
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }

    // Validate user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      this.logger.error(`User with ID ${userId} not found`);
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (business.onboardingStep !== OnboardingStep.APPROVED) {
      throw new BadRequestException(
        "Business must be approved before generating a wallet",
      );
    }

    try {
      // Format business name for BlockRadar (replace spaces with underscores)
      const formattedBusinessName = business.name.replace(/\s+/g, "_");

      // Get BEP20 USDT configuration
      const bep20Config = this.configService.get("bep20usdt");
      if (!bep20Config) {
        throw new Error("BEP20 USDT configuration is not available");
      }

      const apiKey = bep20Config.apiKey;
      const walletId = bep20Config.walletId;

      if (!apiKey || !walletId) {
        throw new Error("wallet id and api key are not available");
      }

      // Prepare request data
      const url = `https://api.blockradar.co/v1/wallets/${walletId}/addresses`;
      const data: WalletAddressRequest = {
        disableAutoSweep: false,
        enableGaslessWithdraw: false,
        metadata: {
          business_id: businessId,
          user_id: userId,
          wallet_type: "bep20usdt",
        },
        name: `${formattedBusinessName}_${businessId}`,
        showPrivateKey: false,
      };

      const headers = {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      };

      this.logger.debug(`Sending request to BlockRadar API: ${url}`);

      // Make request to BlockRadar API
      const response = await firstValueFrom(
        this.httpService.post<BlockRadarAddressResponse>(url, data, {
          headers,
        }),
      );

      this.logger.log(
        `Wallet address generated successfully for business ${businessId}`,
      );

      // Log the full response for debugging
      console.log(
        `[DEBUG] BlockRadar API response:`,
        JSON.stringify(response.data, null, 2),
      );

      // Safely extract data from the response with proper error handling
      if (!response.data) {
        throw new Error("Empty response from BlockRadar API");
      }

      // Extract wallet address and ID from the response
      if (!response.data.data || !response.data.data.address) {
        this.logger.error(
          `Invalid response structure from BlockRadar API: ${JSON.stringify(response.data)}`,
        );
        throw new Error("Invalid wallet address response from BlockRadar API");
      }

      const walletAddress = response.data.data.address;
      const blockradarAddressId = response.data.data.id;

      if (!walletAddress) {
        throw new Error("No wallet address found in BlockRadar API response");
      }

      if (!blockradarAddressId) {
        throw new Error("No address ID found in BlockRadar API response");
      }

      this.logger.log(
        `Successfully extracted wallet address ${walletAddress} and ID ${blockradarAddressId}`,
      );

      // Save wallet address to business
      await this.saveWalletAddressToBusiness(
        businessId,
        walletAddress,
        blockradarAddressId,
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Error generating wallet address: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to generate wallet address: ${error.message}`,
      );
    }
  }

  /**
   * Save wallet address to business entity
   * @param businessId - ID of the business
   * @param walletAddress - Wallet address to save
   * @param addressId - BlockRadar wallet ID to save
   * @returns Promise<void>
   */
  private async saveWalletAddressToBusiness(
    businessId: string,
    walletAddress: string,
    addressId: string,
  ): Promise<void> {
    this.logger.log(
      `Saving wallet address ${walletAddress} to business ${businessId}`,
    );
    console.log(
      `[DEBUG] Saving wallet address ${walletAddress} with ID ${addressId} to business ${businessId}`,
    );

    try {
      // Update business with wallet address
      const updateResult = await this.businessRepository.update(
        { id: businessId },
        {
          walletAddress,
          addressId: addressId,
        },
      );

      console.log(`[DEBUG] Update result:`, JSON.stringify(updateResult));

      // Verify the update was successful by fetching the business
      const updatedBusiness = await this.businessRepository.findOne({
        where: { id: businessId },
      });

      console.log(
        `[DEBUG] Business after update:`,
        updatedBusiness
          ? `walletAddress: ${updatedBusiness.walletAddress}, addressId: ${updatedBusiness.addressId}`
          : "Business not found",
      );

      // Additional check to confirm wallet was saved correctly
      if (!updatedBusiness || !updatedBusiness.walletAddress) {
        console.error(
          `[DEBUG] Wallet address was not saved to business ${businessId}!`,
        );
        this.logger.error(
          `Failed to save wallet address to business ${businessId}`,
        );

        // Try again with query builder to see if that approach works better
        try {
          console.log(
            "[DEBUG] Trying alternative update method with query builder",
          );
          await this.businessRepository
            .createQueryBuilder()
            .update("businesses") // Make sure this matches your actual table name
            .set({ walletAddress, addressId: addressId })
            .where("id = :id", { id: businessId })
            .execute();

          console.log(`[DEBUG] Alternative update completed`);

          // Check again
          const reCheckedBusiness = await this.businessRepository.findOne({
            where: { id: businessId },
          });

          console.log(
            `[DEBUG] Business after alternative update:`,
            reCheckedBusiness
              ? `walletAddress: ${reCheckedBusiness.walletAddress}, addressId: ${reCheckedBusiness.addressId}`
              : "Business not found",
          );
        } catch (alternativeError) {
          console.error(
            `[DEBUG] Alternative update failed: ${alternativeError.message}`,
          );
          this.logger.error(
            `Alternative update attempt failed: ${alternativeError.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to save wallet address to business: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to save wallet address to business: ${error.message}`,
      );
    }
  }
}
