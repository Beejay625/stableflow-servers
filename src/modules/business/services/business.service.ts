import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
  RequestTimeoutException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, Brackets } from "typeorm";
import { Business, OnboardingStep } from "../entities/business.entity";
import { Category } from "../entities/category.entity";
import { BusinessDto } from "../dto/update-business.dto";
import { LinkBankDto } from "../dto/link-bank.dto";
import {
  BusinessDetail,
  BusinessListResponse,
  CategoryListResponse,
  BankAccountDetail,
  ExchangeRateResponse,
  NigerianBank,
  NigerianBankResponse,
  BankValidationResponse,
} from "../interfaces/business.interface";
import { NubapiResponse } from "../interfaces";
import {
  SimplifiedBusinessResponseDto,
  BusinessResponseDto,
  WalletDetailsDto,
} from "../dto/business-response.dto";
import { PaycrestService } from "../../paycrest/paycrest.service";
import {
  Currency,
  Institution,
  PaycrestResponse,
  VerifyAccountRequest,
} from "../../paycrest/interfaces";
import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { NUBAPI_TOKEN } from "../../../common/constants/env.constants";
import { VerifyBankDto } from "../dto/verify-bank.dto";
import { WalletService } from "../../wallet/services/wallet.service";
import { BankDetails, AccountType } from "../entities/bank-details.entity";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom } from "rxjs";
import { retryWithBackoff } from "../../../common/utils/http.util";

// Define the UpdateBusinessOptions type
type UpdateBusinessOptions = {
  name?: string;
  phoneNumber?: string;
  categoryId?: string;
  categoryName?: string;
  isActive?: boolean;
};

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);
  private nigerianBanksCache: Institution[] = null;
  private nigerianBanksCacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 3600000; // 1 hour
  private readonly BANK_VERIFY_TIMEOUT = 10000; // 10 seconds
  private readonly WALLET_GENERATE_TIMEOUT = 20000; // 20 seconds

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly paycrestService: PaycrestService,
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
    private readonly httpClient: HttpService,
  ) {}

  /**
   * Updates an existing business
   * @param id Business ID
   * @param ownerId ID of the requesting user
   * @param updateOptions Data to update (can include business name, phone, category, etc.)
   * @returns Updated business with standardized response format
   */
  async updateBusiness(
    id: string,
    ownerId: string,
    updateOptions: Partial<UpdateBusinessOptions>,
  ): Promise<BusinessResponseDto> {
    // Create response object
    const businessResponseDto = new BusinessResponseDto();
    businessResponseDto.statusCode = 200;

    try {
      // Use a single transaction for all database operations
      return this.businessRepository.manager.transaction(
        async (transactionalEntityManager) => {
          // Get repositories inside transaction
          const businessRepo =
            transactionalEntityManager.getRepository(Business);
          const categoryRepo =
            transactionalEntityManager.getRepository(Category);

          // Validate existing business and check ownership
          const business = await this.validateAndGetBusiness(id, ownerId);

          // Extract update fields
          const { name, phoneNumber, categoryId, categoryName, isActive } =
            updateOptions;

          // Prepare update object with only the fields that are provided
          const updateFields: any = {};
          const updatedFields: string[] = [];
          const previousValues: any = {};

          // Only update fields if they are provided and different from current values
          if (name !== undefined && name !== "" && name !== business.name) {
            previousValues.name = business.name;
            updateFields.name = name;
            updatedFields.push("name");
          }

          if (
            phoneNumber !== undefined &&
            phoneNumber !== "" &&
            phoneNumber !== business.phoneNumber
          ) {
            previousValues.phoneNumber = business.phoneNumber;
            updateFields.phoneNumber = phoneNumber;
            updatedFields.push("phoneNumber");
          }

          if (isActive !== undefined && isActive !== business.isActive) {
            previousValues.isActive = business.isActive;
            updateFields.isActive = isActive;
            updatedFields.push("isActive");
          }

          // Handle category updates - only if valid categoryId or categoryName is provided
          let category = business.category;
          let message = "Business updated successfully";
          const currentCategoryId = business.category?.id;

          if (
            categoryId &&
            categoryId !== "" &&
            categoryId !== currentCategoryId
          ) {
            category = await categoryRepo.findOne({
              where: { id: categoryId, isActive: true },
            });

            if (!category) {
              throw new BadRequestException(
                `Category with ID ${categoryId} not found or inactive`,
              );
            }

            previousValues.category = business.category
              ? {
                  id: business.category.id,
                  name: business.category.name,
                }
              : null;

            updateFields.category = category;
            updateFields.categoryId = categoryId;
            updatedFields.push("category");
          } else if (
            categoryName &&
            categoryName !== "" &&
            categoryName !== business.category?.name
          ) {
            // Try to find an existing category with this name
            category = await categoryRepo.findOne({
              where: { name: categoryName, isActive: true },
            });

            if (!category) {
              // Create a new custom category
              category = new Category();
              category.name = categoryName;
              category.isCustom = true;
              category.isActive = true;
              category.ownerId = ownerId; // Associate with owner

              category = await categoryRepo.save(category);
              message = "Business updated with a new custom category";
            }

            previousValues.category = business.category
              ? {
                  id: business.category.id,
                  name: business.category.name,
                }
              : null;

            updateFields.category = category;
            updateFields.categoryId = category.id;
            updatedFields.push("category");
          }

          // If no valid update fields were provided, return the existing business without changes
          if (Object.keys(updateFields).length === 0) {
            this.logger.log(
              `No valid update fields provided for business ${id}, returning existing data`,
            );
            businessResponseDto.message = "No changes applied to business";
            businessResponseDto.data = this.toSimplifiedResponse(business);
            businessResponseDto.updatedFields = [];
            businessResponseDto.previousValues = {};
            return businessResponseDto;
          }

          // Update onboarding step if business details are complete
          const updatedName =
            updateFields.name !== undefined ? updateFields.name : business.name;
          const updatedPhoneNumber =
            updateFields.phoneNumber !== undefined
              ? updateFields.phoneNumber
              : business.phoneNumber;
          const updatedCategory = category || business.category;

          // Create temporary business object to validate
          const tempBusiness = new Business();
          Object.assign(tempBusiness, business, {
            name: updatedName,
            phoneNumber: updatedPhoneNumber,
            category: updatedCategory,
            categoryId: updatedCategory?.id,
          });

          const { newStep, changes: onboardingChanges } =
            await this.updateOnboardingStep(
              tempBusiness,
              transactionalEntityManager,
            );

          if (newStep !== business.onboardingStep) {
            previousValues.onboardingStep = business.onboardingStep;
            updateFields.onboardingStep = newStep;
            updatedFields.push("onboardingStep");
            updatedFields.push(...onboardingChanges);
          }

          // Update the business entity within the transaction
          this.logger.log(
            `Updating business ${id} with fields: ${updatedFields.join(", ")}`,
          );

          // Apply updates to business object
          Object.assign(business, updateFields);

          // Save business with updates
          let savedBusiness = await businessRepo.save(business);

          this.logger.log(
            `Business updated successfully. Fields changed: ${updatedFields.join(", ")}`,
          );

          // Set response fields
          businessResponseDto.message = message;
          businessResponseDto.data = this.toSimplifiedResponse(savedBusiness);
          businessResponseDto.updatedFields = updatedFields;
          businessResponseDto.previousValues = previousValues;

          return businessResponseDto;
        },
      );
    } catch (error) {
      this.logger.error(
        `Error updating business ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Creates wallet details DTO from business entity
   * @param business Business entity
   * @returns Wallet details or null if no wallet address exists
   */
  private getWalletDetails(business: Business): WalletDetailsDto | null {
    console.log(
      `[DEBUG] Getting wallet details for business ${business.id}: ` +
        `walletAddress: ${business.walletAddress || "none"}, addressId: ${business.addressId || "none"}`,
    );

    // If either wallet address or ID is missing, return null
    if (!business.walletAddress || !business.addressId) {
      console.log(`[DEBUG] No wallet details available, returning null`);
      return null;
    }

    // Create a wallet details object with the available information
    const walletDetails = new WalletDetailsDto();
    walletDetails.addressId = business.addressId;
    walletDetails.address = business.walletAddress;

    // Since we don't have blockchain network details in the business entity,
    // use default values for now
    walletDetails.network = "mainnet";
    walletDetails.isEvmCompatible = true;

    // Add metadata
    walletDetails.metadata = {
      business_id: business.id,
      user_id: business.ownerId,
    };

    console.log(
      `[DEBUG] Returning wallet details:`,
      JSON.stringify(walletDetails),
    );
    return walletDetails;
  }

  /**
   * Centralized wallet generation with retries and error handling
   * @param business Business entity
   * @param queryRunner Optional query runner for transaction support
   * @returns Generated wallet details and changes
   */
  private async generateWalletWithRetries(
    business: Business,
    queryRunner?: any,
  ): Promise<{ walletDetails: any; changes: string[] }> {
    const changes: string[] = [];

    if (
      !business ||
      business.onboardingStep !== OnboardingStep.APPROVED ||
      business.walletAddress
    ) {
      return { walletDetails: null, changes };
    }

    try {
      // Generate wallet with timeout
      const walletResult = await Promise.race([
        this.walletService.generateWalletForCompletedBusiness(business.id),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Wallet generation timeout")),
            this.WALLET_GENERATE_TIMEOUT,
          ),
        ),
      ]);

      if (walletResult?.data?.address) {
        changes.push("wallet_generated");

        // Update business with wallet details
        const updateData = {
          walletAddress: walletResult.data.address,
          addressId: walletResult.data.id,
        };

        if (queryRunner) {
          await queryRunner.manager.update(Business, business.id, updateData);
        } else {
          await this.businessRepository.update(business.id, updateData);
        }

        return { walletDetails: walletResult.data, changes };
      }

      throw new Error("Invalid wallet generation response");
    } catch (error) {
      this.logger.error(
        `Error generating wallet for business ${business.id}: ${error.message}`,
        error.stack,
      );
      return { walletDetails: null, changes };
    }
  }

  /**
   * Retrieves a business by ID
   * @param id Business ID
   * @param ownerId ID of the user who owns the business (optional for public access)
   * @returns Business response with standardized format
   */
  async getBusinessById(
    id: string,
    ownerId: string,
  ): Promise<BusinessResponseDto> {
    this.logger.log(`Fetching business with ID ${id} for owner ${ownerId}`);

    const businessResponseDto = new BusinessResponseDto();
    businessResponseDto.statusCode = 200;

    try {
      // First try to get the business without locking to check existence
      const business = await this.businessRepository.findOne({
        where: { id, ownerId },
        relations: ["category", "bankDetails"],
      });

      if (!business) {
        throw new NotFoundException(`Business with ID ${id} not found`);
      }

      // Only use transaction if we need to generate a wallet
      if (
        business.onboardingStep === OnboardingStep.APPROVED &&
        !business.walletAddress
      ) {
        // Use query runner for atomic operations
        const queryRunner =
          this.businessRepository.manager.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
          // Get business with lock for wallet generation
          const lockedBusiness = (await queryRunner.manager.findOne(Business, {
            where: { id, ownerId },
            relations: ["category", "bankDetails"],
            lock: { mode: "pessimistic_write" },
          })) as Business;

          // Generate wallet if needed using centralized method
          const { walletDetails } = await this.generateWalletWithRetries(
            lockedBusiness,
            queryRunner,
          );

          if (walletDetails) {
            // Refresh business object with new wallet details
            lockedBusiness.walletAddress = walletDetails.address;
            lockedBusiness.addressId = walletDetails.id;
            await queryRunner.manager.save(Business, lockedBusiness);

            // Update our reference to use in response
            Object.assign(business, lockedBusiness);
          }

          await queryRunner.commitTransaction();
        } catch (error) {
          this.logger.error(
            `Error in wallet generation transaction: ${error.message}`,
            error.stack,
          );
          await queryRunner.rollbackTransaction();
          // Don't throw here - we still want to return the business data
        } finally {
          await queryRunner.release();
        }
      }

      businessResponseDto.message = "Success";
      businessResponseDto.data = this.toSimplifiedResponse(business);

      return businessResponseDto;
    } catch (error) {
      this.logger.error(
        `Error fetching business ${id}: ${error.message}`,
        error.stack,
      );

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Failed to fetch business: ${error.message}`,
      );
    }
  }

  /**
   * Verifies a bank account using Nubapi API
   * @param accountNumber Account number
   * @param bankCode Bank code
   * @returns Promise with the verification result and account name
   */
  private async verifyBankAccountInternal(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountName: string; responseData: NubapiResponse }> {
    const nubapiToken = this.configService.get(NUBAPI_TOKEN);
    if (!nubapiToken) {
      throw new InternalServerErrorException("NUBAPI_TOKEN is not configured");
    }

    try {
      const verifyUrl = `https://nubapi.com/api/verify?account_number=${accountNumber}&bank_code=${bankCode}`;

      const apiResponse = (await Promise.race([
        axios.get<NubapiResponse>(verifyUrl, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${nubapiToken}`,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Bank verification timeout")),
            this.BANK_VERIFY_TIMEOUT,
          ),
        ),
      ])) as { data: NubapiResponse };

      const responseData = apiResponse.data;
      const accountName =
        responseData.data?.account_name || responseData.account_name;

      if (!accountName) {
        throw new BadRequestException(
          "Could not verify account. Bank verification didn't return an account name.",
        );
      }

      return { accountName, responseData };
    } catch (error) {
      if (error.message === "Bank verification timeout") {
        throw new RequestTimeoutException(
          "Bank verification service is temporarily unavailable. Please try again.",
        );
      } else if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Could not verify account: ${error.message}`,
      );
    }
  }

  /**
   * Resolves bank information from either code or name
   * @param bankCode Optional bank code
   * @param bankName Optional bank name
   * @returns Resolved bank information
   */
  private async resolveBankInformation(
    bankCode?: string,
    bankName?: string,
  ): Promise<{ bankCode: string; bankName: string }> {
    const nigerianBanks = await this.getNigerianBanks();

    if (bankName && !bankCode) {
      const foundBank = nigerianBanks.find(
        (bank) => bank.name.toLowerCase() === bankName.toLowerCase(),
      );

      if (!foundBank) {
        throw new BadRequestException(
          `Bank name "${bankName}" not found in supported banks list`,
        );
      }

      return { bankCode: foundBank.code, bankName: foundBank.name };
    }

    if (bankCode) {
      const foundBank = nigerianBanks.find((bank) => bank.code === bankCode);
      if (!foundBank) {
        throw new BadRequestException(`Invalid bank code: ${bankCode}`);
      }
      return { bankCode, bankName: foundBank.name };
    }

    throw new BadRequestException(
      "Either bank code or bank name must be provided",
    );
  }

  /**
   * Creates or updates bank details for a business
   */
  private async updateBusinessBankDetails(
    business: Business,
    bankCode: string,
    bankName: string,
    accountNumber: string,
    accountName: string,
    accountType: AccountType,
  ): Promise<{ bankDetails: BankDetails; changes: string[] }> {
    const bankDetails = business.bankDetails || new BankDetails();
    const previousDetails = { ...bankDetails };
    const changes: string[] = [];

    bankDetails.bankCode = bankCode;
    bankDetails.bankName = bankName;
    bankDetails.accountNumber = accountNumber;
    bankDetails.accountName = accountName;
    bankDetails.accountType = accountType;
    bankDetails.businessId = business.id;
    bankDetails.lastVerifiedAt = new Date();

    // Track changes
    if (previousDetails.bankCode !== bankDetails.bankCode)
      changes.push("bank_code_updated");
    if (previousDetails.bankName !== bankDetails.bankName)
      changes.push("bank_name_updated");
    if (previousDetails.accountNumber !== bankDetails.accountNumber)
      changes.push("account_number_updated");
    if (previousDetails.accountName !== bankDetails.accountName)
      changes.push("account_name_updated");
    if (previousDetails.accountType !== bankDetails.accountType)
      changes.push("account_type_updated");

    return { bankDetails, changes };
  }

  /**
   * Centralized bank verification with proper error handling and caching
   * @param accountNumber Account number to verify
   * @param bankCode Bank code
   * @param bankName Optional bank name
   * @returns Verified bank details with account name
   */
  public async verifyBankDetails(
    accountNumber: string,
    bankCode?: string,
    bankName?: string,
  ): Promise<{
    bankCode: string;
    bankName: string;
    accountName: string;
    responseData: NubapiResponse;
  }> {
    try {
      // First resolve bank information
      const resolvedBank = await this.resolveBankInformation(
        bankCode,
        bankName,
      );

      // Then verify the account
      const { accountName, responseData } =
        await this.verifyBankAccountInternal(
          accountNumber,
          resolvedBank.bankCode,
        );

      return {
        bankCode: resolvedBank.bankCode,
        bankName: resolvedBank.bankName,
        accountName,
        responseData,
      };
    } catch (error) {
      this.logger.error(
        `Bank verification failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Validates business details for onboarding
   * @param business Business entity
   * @returns validation result and reason
   */
  private validateBusinessDetails(business: Business): {
    isValid: boolean;
    reason?: string;
  } {
    const errors: string[] = [];

    if (!business.name || business.name.trim().length === 0) {
      errors.push("Business name is required");
    }

    if (
      !business.phoneNumber ||
      !/^\+[1-9]\d{1,14}$/.test(business.phoneNumber)
    ) {
      errors.push("Valid phone number in international format is required");
    }

    if (!business.category || !business.categoryId) {
      errors.push("Business category is required");
    } else if (!business.category.isActive) {
      errors.push("Selected category is not active");
    }

    // Check for invalid state: bank details in NOT_STARTED
    if (
      business.onboardingStep === OnboardingStep.NOT_STARTED &&
      business.bankDetails
    ) {
      errors.push(
        "Cannot have bank details in NOT_STARTED state. Complete business setup first",
      );
    }

    if (errors.length > 0) {
      return { isValid: false, reason: errors.join(", ") };
    }

    return { isValid: true };
  }

  /**
   * Validates bank details for onboarding
   * @param bankDetails Bank details entity
   * @returns validation result and reason
   */
  private validateBankDetails(bankDetails: BankDetails): {
    isValid: boolean;
    reason?: string;
  } {
    if (!bankDetails) {
      return { isValid: false, reason: "Bank details are required" };
    }

    if (!bankDetails.bankCode || !bankDetails.bankName) {
      return { isValid: false, reason: "Bank information is incomplete" };
    }

    if (!bankDetails.accountNumber || !bankDetails.accountName) {
      return { isValid: false, reason: "Account information is incomplete" };
    }

    if (!bankDetails.accountType) {
      return { isValid: false, reason: "Account type is required" };
    }

    return { isValid: true };
  }

  /**
   * Updates business onboarding step based on current state
   * @param business Business entity
   * @returns Updated onboarding step and changes
   */
  private async updateOnboardingStep(
    business: Business,
    queryRunner: any,
  ): Promise<{ newStep: OnboardingStep; changes: string[]; error?: string }> {
    const changes: string[] = [];
    let newStep = business.onboardingStep;
    let error: string | undefined;

    // Validate current state and determine next step
    switch (business.onboardingStep) {
      case OnboardingStep.NOT_STARTED: {
        const { isValid, reason } = this.validateBusinessDetails(business);
        if (isValid) {
          newStep = OnboardingStep.BUSINESS_SETUP;
          changes.push("business_details_completed");
        } else {
          error = `Cannot progress from NOT_STARTED: ${reason}`;
          this.logger.warn(
            `Business ${business.id} validation failed: ${reason}`,
          );
        }
        break;
      }

      case OnboardingStep.BUSINESS_SETUP: {
        // First validate business details are still valid
        const businessValid = this.validateBusinessDetails(business);
        if (!businessValid.isValid) {
          error = `Invalid business details: ${businessValid.reason}`;
          newStep = OnboardingStep.NOT_STARTED;
          changes.push("reverted_to_not_started");
          break;
        }

        const { isValid, reason } = this.validateBankDetails(
          business.bankDetails,
        );
        if (isValid) {
          newStep = OnboardingStep.ACCOUNT_SETUP;
          changes.push("bank_details_completed");
        } else {
          error = `Cannot progress from BUSINESS_SETUP: ${reason}`;
          this.logger.warn(
            `Business ${business.id} bank validation failed: ${reason}`,
          );
        }
        break;
      }

      case OnboardingStep.ACCOUNT_SETUP: {
        // No automatic transition - requires admin approval
        // But validate both business and bank details are still valid
        const businessValid = this.validateBusinessDetails(business);
        const bankValid = this.validateBankDetails(business.bankDetails);

        if (!businessValid.isValid || !bankValid.isValid) {
          error =
            `Invalid state: ${businessValid.reason || ""} ${bankValid.reason || ""}`.trim();
          // Determine which state to revert to
          if (!businessValid.isValid) {
            newStep = OnboardingStep.NOT_STARTED;
            changes.push("reverted_to_not_started");
          } else {
            newStep = OnboardingStep.BUSINESS_SETUP;
            changes.push("reverted_to_business_setup");
          }
        }
        break;
      }

      case OnboardingStep.APPROVED: {
        // Validate everything is still valid
        const businessValid = this.validateBusinessDetails(business);
        const bankValid = this.validateBankDetails(business.bankDetails);

        if (!businessValid.isValid || !bankValid.isValid) {
          error =
            `Invalid approved state: ${businessValid.reason || ""} ${bankValid.reason || ""}`.trim();
          // Determine which state to revert to
          if (!businessValid.isValid) {
            newStep = OnboardingStep.NOT_STARTED;
            changes.push("reverted_to_not_started");
          } else if (!bankValid.isValid) {
            newStep = OnboardingStep.BUSINESS_SETUP;
            changes.push("reverted_to_business_setup");
          } else {
            newStep = OnboardingStep.ACCOUNT_SETUP;
            changes.push("reverted_to_account_setup");
          }
        }
        break;
      }
    }

    return { newStep, changes, error };
  }

  /**
   * Updates or links a bank account to a business
   * @param id Business ID
   * @param linkBankDto Bank account details
   * @param ownerId ID of the requesting user (optional)
   * @returns Updated business with standardized response format
   */
  async updateBankAccount(
    id: string,
    linkBankDto: LinkBankDto,
    ownerId?: string,
  ): Promise<BusinessResponseDto> {
    this.logger.log(`Updating/linking bank account for business ${id}`);
    const businessResponse = new BusinessResponseDto();
    const queryRunner =
      this.businessRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get business with relations
      const business = (await queryRunner.manager.findOne(Business, {
        where: { id, ...(ownerId ? { ownerId } : {}) },
        relations: ["category", "bankDetails"],
      })) as Business;

      if (!business) {
        throw new NotFoundException(`Business with ID ${id} not found`);
      }

      // Validate business details first
      const businessValidation = this.validateBusinessDetails(business);
      if (!businessValidation.isValid) {
        throw new BadRequestException(
          `Cannot link bank account: ${businessValidation.reason}`,
        );
      }

      // Validate business is in correct state for bank account linking
      if (business.onboardingStep === OnboardingStep.NOT_STARTED) {
        throw new BadRequestException(
          "Cannot link bank account: Business details must be completed first",
        );
      }

      // Rest of the bank account update logic...
      const changes: string[] = [];
      let hasChanges = false;
      let bankDetails = business.bankDetails || new BankDetails();

      // Verify bank account details
      const { bankCode, bankName, accountName } =
        await this.verifyBankAccount(linkBankDto);

      // Helper function to track changes
      const updateField = (
        field: keyof BankDetails,
        newValue: any,
        changeName: string,
      ) => {
        if (bankDetails[field] !== newValue) {
          bankDetails[field] = newValue;
          changes.push(changeName);
          hasChanges = true;
        }
      };

      updateField("bankCode", bankCode, "bank_code_updated");
      updateField("bankName", bankName, "bank_name_updated");
      updateField(
        "accountNumber",
        linkBankDto.accountNumber,
        "account_number_updated",
      );
      updateField("accountName", accountName, "account_name_updated");
      updateField(
        "accountType",
        linkBankDto.accountType,
        "account_type_updated",
      );

      // If no changes detected and bank details already exist, return early
      if (!hasChanges && business.bankDetails) {
        businessResponse.statusCode = 200;
        businessResponse.message =
          "No changes needed. The provided bank details are identical to the existing ones.";
        businessResponse.data = this.toSimplifiedResponse(business);
        await queryRunner.commitTransaction();
        return businessResponse;
      }

      // If this is a new bank details record, mark it as a change
      if (!business.bankDetails) {
        changes.push("new_bank_account_linked");
        hasChanges = true;
      }

      bankDetails.businessId = business.id;
      bankDetails.lastVerifiedAt = new Date();

      // Update business
      business.bankDetails = bankDetails;

      // Update onboarding step with proper validation
      const {
        newStep,
        changes: onboardingChanges,
        error: onboardingError,
      } = await this.updateOnboardingStep(business, queryRunner);

      if (onboardingError) {
        throw new BadRequestException(onboardingError);
      }

      if (newStep !== business.onboardingStep) {
        business.onboardingStep = newStep;
        changes.push(...onboardingChanges);
      }

      // Save business with bank details
      const savedBusiness = await queryRunner.manager.save(business);

      // Commit transaction
      await queryRunner.commitTransaction();

      businessResponse.statusCode = 200;
      businessResponse.message = `Bank account ${business.bankDetails ? "updated" : "linked"} successfully. Changes: ${changes.join(", ")}`;
      businessResponse.data = this.toSimplifiedResponse(savedBusiness);

      return businessResponse;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error.message === "Bank verification timeout") {
        throw new RequestTimeoutException(
          "Bank verification service is temporarily unavailable. Please try again.",
        );
      } else if (error.message === "Wallet generation timeout") {
        throw new RequestTimeoutException(
          "Wallet generation service is temporarily unavailable. Please try again.",
        );
      } else if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Failed to update bank account: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Retrieves all businesses with pagination
   * @param page Page number (starting at 1)
   * @param limit Number of items per page
   * @param isVerified Optional filter for verification status
   * @returns Paginated list of businesses in simplified format
   */
  async getAllBusinesses(
    page = 1,
    limit = 10,
    isVerified?: boolean,
  ): Promise<{
    businesses: SimplifiedBusinessResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    this.logger.debug(
      `Fetching all businesses, page: ${page}, limit: ${limit}${isVerified !== undefined ? `, verified: ${isVerified}` : ""}`,
    );

    const skip = (page - 1) * limit;

    // Build where clause
    const whereClause: any = { isActive: true }; // Only return active businesses

    // If isVerified is provided, filter by onboardingStep
    if (isVerified !== undefined) {
      if (isVerified) {
        whereClause.onboardingStep = OnboardingStep.APPROVED;
      } else {
        whereClause.onboardingStep = Not(OnboardingStep.APPROVED);
      }
    }

    const [businesses, total] = await Promise.all([
      this.businessRepository.find({
        where: whereClause,
        relations: ["category"], // Include category relation for each business
        skip,
        take: limit,
        order: { createdAt: "DESC" },
      }),
      this.businessRepository.count({ where: whereClause }),
    ]);

    // Check each business for automatic verification
    const updatedBusinesses = await Promise.all(
      businesses.map(async (business) => {
        // Apply the same verification logic as in getBusinessById but use onboardingStep
        if (
          business.onboardingStep === OnboardingStep.ACCOUNT_SETUP &&
          business.bankDetails?.bankCode &&
          business.bankDetails?.accountNumber &&
          business.bankDetails?.accountName &&
          business.bankDetails?.accountType &&
          business.name &&
          business.phoneNumber &&
          (business.categoryId || business.category)
        ) {
          this.logger.log(
            `Business ${business.id} has completed all required steps. Setting to APPROVED.`,
          );

          business.onboardingStep = OnboardingStep.APPROVED;

          // Save the updated onboarding status
          const savedBusiness = await this.businessRepository.save(business);

          // Generate wallet in the background with proper type handling
          this.generateWalletWithRetries(savedBusiness)
            .then(({ walletDetails }) => {
              if (walletDetails) {
                this.logger.log(
                  `Successfully generated wallet for business ${savedBusiness.id}`,
                );
                // Update business with new wallet details
                this.businessRepository
                  .update(savedBusiness.id, {
                    walletAddress: walletDetails.address,
                    addressId: walletDetails.id,
                  })
                  .catch((err) => {
                    this.logger.error(
                      `Failed to update business with wallet details: ${err.message}`,
                    );
                  });
              }
            })
            .catch((err) => {
              this.logger.error(
                `Background wallet generation failed: ${err.message}`,
              );
            });

          return savedBusiness;
        }

        return business;
      }),
    );

    this.logger.debug(
      `Found ${businesses.length} businesses out of ${total} total`,
    );

    // Convert entities to simplified DTOs
    const simplifiedBusinesses = updatedBusinesses.map((business) =>
      this.toSimplifiedResponse(business),
    );

    return {
      businesses: simplifiedBusinesses,
      total,
      page,
      limit,
    };
  }

  /**
   * Gets a list of all active categories
   * @param name Optional name to filter categories by
   * @param ownerId Optional user ID to include their custom categories
   * @returns List of categories
   */
  async getAllCategories(
    name?: string,
    ownerId?: string,
  ): Promise<CategoryListResponse> {
    this.logger.log(
      `Fetching business categories${name ? ` with name: ${name}` : ""}${ownerId ? ` for user: ${ownerId}` : ""}`,
    );
    console.log("Owner ID received:", ownerId);

    try {
      // Base query for active categories
      let query = this.categoryRepository
        .createQueryBuilder("category")
        .where('"isActive" = true')
        .andWhere(
          new Brackets((qb) => {
            // Include all non-custom categories
            qb.where('"isCustom" = false');

            // If ownerId is provided, also include custom categories for this user
            if (ownerId) {
              console.log("Adding owner condition with ID:", ownerId);
              qb.orWhere('("isCustom" = true AND "ownerId" = :ownerId)', {
                ownerId,
              });
            }
          }),
        );

      // Add name filter if provided - using LIKE for partial match
      if (name) {
        // Use LOWER for case-insensitive search and % for partial match
        query = query.andWhere("LOWER(name) LIKE LOWER(:name)", {
          name: `%${name}%`,
        });
      }

      console.log("Final query SQL:", query.getSql());
      console.log("Query parameters:", query.getParameters());

      // Get categories and count
      const [categories, total] = await query
        .orderBy("name", "ASC")
        .getManyAndCount();

      console.log("Categories found:", categories.length);
      console.log(
        "Categories:",
        categories
          .map(
            (c) =>
              `${c.id} - ${c.name} - isCustom: ${c.isCustom} - ownerId: ${c.ownerId}`,
          )
          .join("\n"),
      );

      this.logger.debug(`Found ${categories.length} active categories`);

      return {
        categories,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching categories: ${error.message}`,
        error.stack,
      );
      return {
        categories: [],
        total: 0,
      };
    }
  }

  /**
   * Get custom categories for a specific user with optional name filtering
   * @param ownerId User ID to get custom categories for
   * @param name Optional name to filter categories by
   * @returns List of custom categories for the user
   */
  async getCustomCategories(
    ownerId: string,
    name?: string,
  ): Promise<CategoryListResponse> {
    this.logger.log(
      `Fetching custom categories for user ${ownerId}${name ? ` with name filter: ${name}` : ""}`,
    );
    try {
      // Build query with TypeORM query builder for more flexibility
      let query = this.categoryRepository
        .createQueryBuilder("category")
        .where('"isActive" = true')
        .andWhere('"isCustom" = true')
        .andWhere('"ownerId" = :ownerId', { ownerId });

      // Add name filter if provided
      if (name) {
        // Case-insensitive partial match
        query = query.andWhere("LOWER(name) LIKE LOWER(:name)", {
          name: `%${name}%`,
        });
      }

      const [categories, total] = await query
        .orderBy("name", "ASC")
        .getManyAndCount();

      return {
        categories,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching custom categories: ${error.message}`,
        error.stack,
      );
      return {
        categories: [],
        total: 0,
      };
    }
  }

  /**
   * Fetch bank data directly from Nubapi's open endpoint
   * @returns Processed bank data in Institution format
   */
  private async fetchNubapiBanks(): Promise<Institution[]> {
    this.logger.debug("Fetching bank data directly from Nubapi");
    try {
      const response = await axios.get("https://nubapi.com/banks");
      const bankData = response.data;

      // Process the data into Institution format
      const banks: Institution[] = [];
      for (const [code, name] of Object.entries(bankData)) {
        banks.push({
          name: name as string,
          code: code,
          type: "bank",
          supportedCurrencies: ["NGN"],
        });
      }

      this.logger.debug(
        `Successfully fetched ${banks.length} banks from Nubapi`,
      );
      return banks;
    } catch (error) {
      this.logger.error(
        `Failed to fetch banks from Nubapi: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        "Failed to fetch bank list, please try again later",
      );
    }
  }

  /**
   * Get list of Nigerian banks from Nubapi or cache
   * @returns Array of Nigerian banks with caching to improve performance
   */
  async getNigerianBanks(): Promise<Institution[]> {
    // Check if we have a valid cache
    const now = Date.now();
    if (
      this.nigerianBanksCache &&
      now - this.nigerianBanksCacheTimestamp < this.CACHE_TTL_MS
    ) {
      this.logger.debug(
        `Using cached Nigerian banks list with ${this.nigerianBanksCache.length} items`,
      );
      return this.nigerianBanksCache;
    }

    // Fetch fresh data from Nubapi if cache is invalid or expired
    const banks = await this.fetchNubapiBanks();

    // Update cache with Nubapi banks
    this.nigerianBanksCache = banks;
    this.nigerianBanksCacheTimestamp = now;
    this.logger.debug(
      `Updated Nigerian banks cache with ${banks.length} items from Nubapi`,
    );

    return banks;
  }

  /**
   * Validates and retrieves a business by ID and owner ID
   */
  private async validateAndGetBusiness(
    id: string,
    ownerId: string,
  ): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { id, ownerId },
      relations: ["category", "bankDetails"],
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    return business;
  }

  /**
   * Converts a business entity to a simplified response DTO
   */
  private toSimplifiedResponse(
    business: Business,
  ): SimplifiedBusinessResponseDto {
    const response = new SimplifiedBusinessResponseDto();
    response.Business_id = business.id;
    response.name = business.name;
    response.phoneNumber = business.phoneNumber;
    response.onboardingStep = business.onboardingStep;

    // Business status shows if business is approved
    response.business_status =
      business.onboardingStep === OnboardingStep.APPROVED
        ? "APPROVED"
        : "NOT_APPROVED";

    // Offramp status shows if transactions can be processed
    response.offramp_status =
      business.onboardingStep === OnboardingStep.APPROVED && business.isActive
        ? "ACTIVE"
        : "INACTIVE";

    response.user_Id = business.ownerId;
    response.createdAt = business.createdAt;
    response.updatedAt = business.updatedAt;

    if (business.category) {
      response.category = business.category;
    }

    if (business.bankDetails) {
      response.bankDetails = {
        bankCode: business.bankDetails.bankCode,
        bankName: business.bankDetails.bankName,
        accountNumber: business.bankDetails.accountNumber,
        accountName: business.bankDetails.accountName,
        accountType: business.bankDetails.accountType,
        createdAt: business.bankDetails.createdAt,
        updatedAt: business.bankDetails.updatedAt,
      };
    }

    const walletDetails = this.getWalletDetails(business);
    if (walletDetails) {
      response.walletDetails = walletDetails;
    }

    return response;
  }

  /**
   * Verify bank account details with timeout
   */
  private async verifyBankAccount(
    linkBankDto: LinkBankDto,
  ): Promise<{ bankCode: string; bankName: string; accountName: string }> {
    const result = await Promise.race([
      this.verifyBankDetails(
        linkBankDto.accountNumber,
        linkBankDto.bankCode,
        linkBankDto.bankName,
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Bank verification timeout")),
          this.BANK_VERIFY_TIMEOUT,
        ),
      ),
    ]);

    if (!result.bankCode || !result.bankName || !result.accountName) {
      throw new BadRequestException(
        "Invalid bank account details received from verification service",
      );
    }

    return {
      bankCode: result.bankCode,
      bankName: result.bankName,
      accountName: result.accountName,
    };
  }

  /**
   * Admin endpoint to approve a business and trigger wallet generation
   * @param businessId Business ID to approve
   * @returns Updated business with standardized response format
   */
  async approveBusiness(businessId: string): Promise<BusinessResponseDto> {
    this.logger.log(`Admin approving business ${businessId}`);

    const businessResponseDto = new BusinessResponseDto();
    businessResponseDto.statusCode = 200;

    try {
      // Get business with relations
      const business = await this.businessRepository.findOne({
        where: { id: businessId },
        relations: ["category", "bankDetails"],
      });

      if (!business) {
        throw new NotFoundException(`Business with ID ${businessId} not found`);
      }

      // Check if business is already approved - return success instead of error
      if (business.onboardingStep === OnboardingStep.APPROVED) {
        businessResponseDto.message =
          "Business is already approved. No further action needed.";
        businessResponseDto.data = this.toSimplifiedResponse(business);
        return businessResponseDto;
      }

      // Validate business is in ACCOUNT_SETUP state
      if (business.onboardingStep !== OnboardingStep.ACCOUNT_SETUP) {
        throw new BadRequestException(
          `Business must be in ACCOUNT_SETUP state to be approved. Current state: ${business.onboardingStep}`,
        );
      }

      // Validate business has all required information
      const businessValid = this.validateBusinessDetails(business).isValid;
      const bankValid = this.validateBankDetails(business.bankDetails).isValid;

      if (!businessValid || !bankValid) {
        throw new BadRequestException(
          "Business or bank details are incomplete",
        );
      }

      // Update business to APPROVED state
      business.onboardingStep = OnboardingStep.APPROVED;
      business.isVerified = true;
      business.isActive = true; // Only set to active when approved

      // Save business
      const savedBusiness = await this.businessRepository.save(business);

      // Return success response
      businessResponseDto.message = "Business approved successfully";
      businessResponseDto.data = this.toSimplifiedResponse(savedBusiness);

      return businessResponseDto;
    } catch (error) {
      this.logger.error(
        `Error approving business ${businessId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Deactivate a business - this will prevent offramp operations
   */
  async deactivateBusiness(businessId: string): Promise<BusinessResponseDto> {
    this.logger.log(`Deactivating business ${businessId}`);

    const businessResponseDto = new BusinessResponseDto();
    businessResponseDto.statusCode = 200;

    try {
      const business = await this.businessRepository.findOne({
        where: { id: businessId },
        relations: ["category", "bankDetails"],
      });

      if (!business) {
        throw new NotFoundException(`Business with ID ${businessId} not found`);
      }

      // Can only deactivate approved businesses
      if (business.onboardingStep !== OnboardingStep.APPROVED) {
        throw new BadRequestException(
          "Only approved businesses can be deactivated",
        );
      }

      business.isActive = false;
      const savedBusiness = await this.businessRepository.save(business);

      businessResponseDto.message = "Business deactivated successfully";
      businessResponseDto.data = this.toSimplifiedResponse(savedBusiness);

      return businessResponseDto;
    } catch (error) {
      this.logger.error(
        `Error deactivating business ${businessId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Reactivate a business - this will re-enable offramp operations
   */
  async reactivateBusiness(businessId: string): Promise<BusinessResponseDto> {
    this.logger.log(`Reactivating business ${businessId}`);

    const businessResponseDto = new BusinessResponseDto();
    businessResponseDto.statusCode = 200;

    try {
      const business = await this.businessRepository.findOne({
        where: { id: businessId },
        relations: ["category", "bankDetails"],
      });

      if (!business) {
        throw new NotFoundException(`Business with ID ${businessId} not found`);
      }

      // Can only reactivate approved businesses
      if (business.onboardingStep !== OnboardingStep.APPROVED) {
        throw new BadRequestException(
          "Only approved businesses can be reactivated",
        );
      }

      business.isActive = true;
      const savedBusiness = await this.businessRepository.save(business);

      businessResponseDto.message = "Business reactivated successfully";
      businessResponseDto.data = this.toSimplifiedResponse(savedBusiness);

      return businessResponseDto;
    } catch (error) {
      this.logger.error(
        `Error reactivating business ${businessId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get businesses filtered by onboarding state
   * @param state Onboarding state to filter by (optional)
   * @param page Page number
   * @param limit Items per page
   * @returns Filtered list of businesses
   */
  async getBusinessesByState(
    state?: "APPROVED" | "BUSINESS_SETUP" | "NOT_STARTED" | "all",
    page = 1,
    limit = 10,
  ): Promise<{
    businesses: SimplifiedBusinessResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    this.logger.log(`Fetching businesses with state filter: ${state || "all"}`);

    const skip = (page - 1) * limit;
    const whereClause: any = {};

    // Add state filter if not 'all'
    if (state && state !== "all") {
      whereClause.onboardingStep = state;
      // Only include active status check for APPROVED businesses
      if (state === "APPROVED") {
        whereClause.isActive = true;
      }
    }

    try {
      const [businesses, total] = await Promise.all([
        this.businessRepository.find({
          where: whereClause,
          relations: ["category", "bankDetails"],
          skip,
          take: limit,
          order: { createdAt: "DESC" },
        }),
        this.businessRepository.count({ where: whereClause }),
      ]);

      return {
        businesses: businesses.map((business) =>
          this.toSimplifiedResponse(business),
        ),
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching businesses by state: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to fetch businesses: ${error.message}`,
      );
    }
  }

  /**
   * Deactivate a business by ID or wallet address
   * @param identifier Business ID or wallet address
   * @param identifierType 'id' | 'wallet'
   */
  async deactivateBusinessByIdentifier(
    identifier: string,
    identifierType: "id" | "wallet",
  ): Promise<BusinessResponseDto> {
    this.logger.log(
      `Deactivating business by ${identifierType}: ${identifier}`,
    );

    const businessResponseDto = new BusinessResponseDto();
    businessResponseDto.statusCode = 200;

    try {
      // Build query based on identifier type
      const whereClause =
        identifierType === "id"
          ? { id: identifier }
          : { walletAddress: identifier };

      const business = await this.businessRepository.findOne({
        where: whereClause,
        relations: ["category", "bankDetails"],
      });

      if (!business) {
        throw new NotFoundException(
          `Business with ${identifierType} ${identifier} not found`,
        );
      }

      // Can only deactivate approved businesses
      if (business.onboardingStep !== OnboardingStep.APPROVED) {
        throw new BadRequestException(
          "Only approved businesses can be deactivated",
        );
      }

      business.isActive = false;
      const savedBusiness = await this.businessRepository.save(business);

      businessResponseDto.message = `Business deactivated successfully by ${identifierType}`;
      businessResponseDto.data = this.toSimplifiedResponse(savedBusiness);

      return businessResponseDto;
    } catch (error) {
      this.logger.error(
        `Error deactivating business by ${identifierType} ${identifier}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Reactivate a business by ID or wallet address
   * @param identifier Business ID or wallet address
   * @param identifierType 'id' | 'wallet'
   */
  async reactivateBusinessByIdentifier(
    identifier: string,
    identifierType: "id" | "wallet",
  ): Promise<BusinessResponseDto> {
    this.logger.log(
      `Reactivating business by ${identifierType}: ${identifier}`,
    );

    const businessResponseDto = new BusinessResponseDto();
    businessResponseDto.statusCode = 200;

    try {
      // Build query based on identifier type
      const whereClause =
        identifierType === "id"
          ? { id: identifier }
          : { walletAddress: identifier };

      const business = await this.businessRepository.findOne({
        where: whereClause,
        relations: ["category", "bankDetails"],
      });

      if (!business) {
        throw new NotFoundException(
          `Business with ${identifierType} ${identifier} not found`,
        );
      }

      // Can only reactivate approved businesses
      if (business.onboardingStep !== OnboardingStep.APPROVED) {
        throw new BadRequestException(
          "Only approved businesses can be reactivated",
        );
      }

      business.isActive = true;
      const savedBusiness = await this.businessRepository.save(business);

      businessResponseDto.message = `Business reactivated successfully by ${identifierType}`;
      businessResponseDto.data = this.toSimplifiedResponse(savedBusiness);

      return businessResponseDto;
    } catch (error) {
      this.logger.error(
        `Error reactivating business by ${identifierType} ${identifier}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
