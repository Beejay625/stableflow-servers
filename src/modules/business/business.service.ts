import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, OnboardingStep, AccountType } from './entities/business.entity';
// Import the Category entity class but use it only for type checking
import { Category } from './entities/category.entity';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { LinkBankDto } from './dto/link-bank.dto';
import { BusinessDetail, BusinessListResponse, CategoryListResponse, BankAccountDetail, ExchangeRateResponse } from './interfaces/business.interface';
import { SimplifiedBusinessResponseDto, SimplifiedCategoryDto } from './dto/business-response.dto';
import { PaycrestService } from '../paycrest/paycrest.service';
import { Currency, Institution, PaycrestResponse, VerifyAccountRequest } from '../paycrest/interfaces';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly paycrestService: PaycrestService,
  ) {}

  /**
   * Updates an existing business entity that was created during authentication
   * @param id The business ID from authentication
   * @param createBusinessDto Data for updating the business entity
   * @param ownerId ID of the user who owns the business
   * @returns Updated business entity
   */
  async updateBusinessEntity(id: string, createBusinessDto: CreateBusinessDto, ownerId: string): Promise<Business> {
    this.logger.log(`Updating business entity for ID: ${id}, owner: ${ownerId}`);

    // Find the existing business record
    const existingBusiness = await this.businessRepository.findOne({
      where: { id, ownerId }
    });

    if (!existingBusiness) {
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    let category: Category | undefined;

    // Only validate category if either categoryId or categoryName is provided
    if (createBusinessDto.categoryId || createBusinessDto.categoryName) {
      // Handle category selection or creation
      if (createBusinessDto.categoryId) {
        // Find existing category
        category = await this.categoryRepository.findOne({ 
          where: { id: createBusinessDto.categoryId } 
        });

        if (!category) {
          throw new NotFoundException(`Category with ID ${createBusinessDto.categoryId} not found`);
        }
      } else if (createBusinessDto.categoryName) {
        // Check if category with this name already exists
        category = await this.categoryRepository.findOne({ 
          where: { name: createBusinessDto.categoryName } 
        });

        // Create new custom category if it doesn't exist
        if (!category) {
          category = this.categoryRepository.create({
            name: createBusinessDto.categoryName,
            isCustom: true,
          });
          category = await this.categoryRepository.save(category);
        }
      }
    }

    // Determine the onboarding step based on what fields are populated
    let onboardingStep = existingBusiness.onboardingStep;
    
    // Check if the update has completed the business setup step
    const hasName = createBusinessDto.name || existingBusiness.name;
    const hasPhoneNumber = createBusinessDto.phoneNumber || existingBusiness.phoneNumber;
    const hasDescription = createBusinessDto.description || existingBusiness.description;
    const hasCategory = category || existingBusiness.categoryId;
    const hasBasicDetails = hasName && hasPhoneNumber && hasDescription && hasCategory;
    
    if (hasBasicDetails && onboardingStep === OnboardingStep.NOT_STARTED) {
      onboardingStep = OnboardingStep.BUSINESS_SETUP;
    }
    
    // Check if business already has bank details, which would move it to the next step
    const hasBankCode = existingBusiness.bankCode;
    const hasAccountNumber = existingBusiness.accountNumber;
    const hasAccountName = existingBusiness.accountName;
    const hasAccountType = existingBusiness.accountType;
    
    if (hasBasicDetails && hasBankCode && hasAccountNumber && hasAccountName && hasAccountType) {
      onboardingStep = OnboardingStep.ACCOUNT_SETUP;
      
      // Check if the business is already verified
      if (existingBusiness.isVerified) {
        onboardingStep = OnboardingStep.COMPLETED;
      }
    }

    // Update business entity with new details
    const updatedBusiness = {
      ...existingBusiness,
      ...createBusinessDto,
      onboardingStep
    };

    // Only set category if it was updated
    if (category) {
      updatedBusiness.category = category;
    }

    this.logger.log(`Saving updated business entity for ID: ${id}, onboarding step: ${onboardingStep}`);
    // Save and return the updated business
    return this.businessRepository.save(updatedBusiness);
  }

  /**
   * Retrieves a business by ID
   * @param id Business ID
   * @param ownerId ID of the user who owns the business (optional for public access)
   * @returns Simplified business entity with essential data
   */
  async getBusinessById(id: string, ownerId?: string): Promise<SimplifiedBusinessResponseDto> {
    this.logger.debug(`Fetching business with ID: ${id}${ownerId ? ` for owner: ${ownerId}` : ' (public access)'}`);
    
    // Create where clause based on whether ownerId is provided
    const whereClause: any = { id };
    if (ownerId) {
      whereClause.ownerId = ownerId;
    }
    
    // Find the business with category relation only (no need for owner details)
    const business = await this.businessRepository.findOne({
      where: whereClause,
      relations: ['category'],
    });

    if (!business) {
      this.logger.warn(`Business with ID ${id} not found${ownerId ? ` for owner ${ownerId}` : ''}`);
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    // Automatically verify business if all required steps are completed
    if (
      !business.isVerified && 
      business.onboardingStep === OnboardingStep.ACCOUNT_SETUP &&
      business.bankCode && 
      business.accountNumber && 
      business.accountName && 
      business.accountType &&
      business.name &&
      business.phoneNumber &&
      business.description &&
      (business.categoryId || business.category)
    ) {
      this.logger.log(`Business ${id} has completed all required steps. Automatically verifying.`);
      
      business.isVerified = true;
      business.onboardingStep = OnboardingStep.COMPLETED;
      
      // Save the updated verification status
      await this.businessRepository.save(business);
    }

    this.logger.debug(`Found business: ${business.name}. Converting to simplified format.`);
    
    // Transform business entity to simplified DTO
    return this.toSimplifiedResponse(business);
  }

  /**
   * Updates an existing business
   * @param id Business ID
   * @param updateData Data to update
   * @param ownerId ID of the requesting user
   * @returns Updated business entity
   */
  async updateBusiness(id: string, updateData: UpdateBusinessDto, ownerId: string): Promise<SimplifiedBusinessResponseDto> {
    this.logger.log(`Updating business with ID ${id} for owner ${ownerId}`);
    
    // Find business with relations
    const business = await this.businessRepository.findOne({
      where: { id, ownerId },
      relations: ['category']
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    // Handle category creation or update if needed
    let category: Category | undefined;
    if (updateData.categoryId || updateData.categoryName) {
      if (updateData.categoryId) {
        // Find existing category
        category = await this.categoryRepository.findOne({ 
          where: { id: updateData.categoryId } 
        });

        if (!category) {
          throw new NotFoundException(`Category with ID ${updateData.categoryId} not found`);
        }
      } else if (updateData.categoryName) {
        // Check if category with this name already exists
        category = await this.categoryRepository.findOne({ 
          where: { name: updateData.categoryName } 
        });

        // Create new custom category if it doesn't exist
        if (!category) {
          category = this.categoryRepository.create({
            name: updateData.categoryName,
            isCustom: true,
          });
          category = await this.categoryRepository.save(category);
        }
      }
    }

    // Determine if this update advances the onboarding step
    let onboardingStep = business.onboardingStep;
    
    const hasName = updateData.name || business.name;
    const hasPhoneNumber = updateData.phoneNumber || business.phoneNumber;
    const hasDescription = updateData.description || business.description;
    const hasCategory = category?.id || business.categoryId;
    const hasBasicDetails = hasName && hasPhoneNumber && hasDescription && hasCategory;
    
    if (hasBasicDetails && onboardingStep === OnboardingStep.NOT_STARTED) {
      onboardingStep = OnboardingStep.BUSINESS_SETUP;
    }

    // Create updated business object
    const updatedData: Partial<Business> = {
      ...updateData
    };

    // Only set category if it was updated
    if (category) {
      updatedData.category = category;
      updatedData.categoryId = category.id;
    }

    // Update onboarding step if it changed
    if (onboardingStep !== business.onboardingStep) {
      updatedData.onboardingStep = onboardingStep;
    }
    
    // Remove categoryName from the update data since it's not a column in the entity
    delete (updatedData as any).categoryName;

    // Save updated business
    const updatedBusiness = await this.businessRepository.save({
      ...business,
      ...updatedData
    });

    // Return simplified response
    return this.toSimplifiedResponse(updatedBusiness);
  }

  /**
   * Updates or links a bank account to a business
   * This method handles both initial linking and subsequent updates
   * Validates the account through Paycrest API
   * 
   * @param id The business ID
   * @param linkBankDto The bank account details to link or update
   * @param ownerId The owner ID for verification
   * @returns The updated business with bank account details
   */
  async updateBankAccount(
    id: string,
    linkBankDto: LinkBankDto,
    ownerId: string,
  ): Promise<Business> {
    this.logger.log(`Updating/linking bank account for business ${id}`);

    // Find the business with category relation
    const business = await this.businessRepository.findOne({
      where: { id, ownerId, isActive: true },
      relations: ['category'],
    });

    if (!business) {
      this.logger.warn(`Business with ID ${id} not found for owner ${ownerId}`);
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    // Check if the business setup step has been completed
    if (business.onboardingStep === OnboardingStep.NOT_STARTED) {
      this.logger.warn(`Business ${id} has not completed the business setup step`);
      throw new BadRequestException('Business details must be set up before linking a bank account');
    }

    // Determine if this is a new link or an update
    const isNewLink = !business.bankCode && !business.accountNumber;
    this.logger.log(`${isNewLink ? 'Linking new bank account' : 'Updating existing bank account'} for business ${id}`);

    try {
      // Validate bank code for the selected currency
      const institutions = await this.paycrestService.getSupportedInstitutions();
      
      const validCodes = institutions.data.map((institution) => institution.code);
      
      if (!validCodes.includes(linkBankDto.bankCode)) {
        this.logger.warn(`Invalid bank code ${linkBankDto.bankCode} for currency ${linkBankDto.settlementCurrency}`);
        throw new BadRequestException(`Invalid bank code for the selected currency`);
      }
      
      // Verify account through Paycrest API
      const verifyRequest = {
        institution: linkBankDto.bankCode,
        accountIdentifier: linkBankDto.accountNumber,
      };
      
      this.logger.log(`Verifying account through Paycrest: ${JSON.stringify(verifyRequest)}`);
      
      const verifyResponse = await this.paycrestService.verifyAccount(verifyRequest);
      
      // If verification is successful, use the retrieved account name
      // unless explicitly provided in the DTO
      if (verifyResponse.status === 'success') {
        if (!linkBankDto.accountName) {
          this.logger.log(`Using account name from verification: ${verifyResponse.data}`);
          linkBankDto.accountName = verifyResponse.data;
        } else {
          this.logger.log(`Using provided account name: ${linkBankDto.accountName}`);
        }
      } else {
        this.logger.warn(`Account verification failed: ${verifyResponse.message}`);
        throw new BadRequestException(`Account verification failed: ${verifyResponse.message}`);
      }
      
      // Update business with bank account details
      const updatedBusiness = {
        ...business,
        bankCode: linkBankDto.bankCode,
        accountNumber: linkBankDto.accountNumber,
        accountName: linkBankDto.accountName,
        accountType: linkBankDto.accountType,
        settlementCurrency: linkBankDto.settlementCurrency,
      };

      // Update onboarding step if this is a new link (not an update)
      if (isNewLink && updatedBusiness.onboardingStep === OnboardingStep.BUSINESS_SETUP) {
        updatedBusiness.onboardingStep = OnboardingStep.ACCOUNT_SETUP;
      }
      
      // Automatically verify the business if all requirements are met
      if (
        !updatedBusiness.isVerified &&
        updatedBusiness.bankCode && 
        updatedBusiness.accountNumber && 
        updatedBusiness.accountName && 
        updatedBusiness.accountType &&
        updatedBusiness.name &&
        updatedBusiness.phoneNumber &&
        updatedBusiness.description &&
        (updatedBusiness.categoryId || business.category)
      ) {
        this.logger.log(`Business ${id} has completed all required steps. Automatically verifying.`);
        updatedBusiness.isVerified = true;
        updatedBusiness.onboardingStep = OnboardingStep.COMPLETED;
      }
      
      this.logger.log(`Saving bank account details for business ${id}`);
      return this.businessRepository.save(updatedBusiness);
    } catch (error) {
      this.logger.error(`Error with bank account: ${error.message}`, error.stack);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Bank account operation failed: ${error.message}`);
    }
  }

  /**
   * Verifies a business after completing both onboarding steps
   * @param id Business ID
   * @param ownerId ID of the requesting user
   * @returns Verified business entity
   */
  async verifyBusiness(id: string, ownerId: string): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { id, ownerId },
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    // Verify that business has completed step 2 (account setup)
    if (business.onboardingStep !== OnboardingStep.ACCOUNT_SETUP) {
      throw new BadRequestException('Bank account must be set up before verification');
    }

    // Verify that bank details are complete
    if (!business.bankCode || !business.accountNumber) {
      throw new BadRequestException('Bank details are incomplete');
    }

    // Mark business as verified and onboarding as completed
    const verifiedBusiness = {
      ...business,
      isVerified: true,
      onboardingStep: OnboardingStep.COMPLETED,
    };

    return this.businessRepository.save(verifiedBusiness);
  }

  /**
   * Gets a paginated list of all businesses
   * @param page Page number (1-indexed)
   * @param limit Results per page
   * @returns Paginated list of simplified businesses
   */
  async getAllBusinesses(
    page = 1, 
    limit = 10
  ): Promise<{ businesses: SimplifiedBusinessResponseDto[], total: number, page: number, limit: number }> {
    this.logger.debug(`Fetching all businesses, page: ${page}, limit: ${limit}`);
    
    const skip = (page - 1) * limit;

    const [businesses, total] = await Promise.all([
      this.businessRepository.find({
        where: { isActive: true }, // Only return active businesses
        relations: ['category'], // Include category relation for each business
        skip,
        take: limit,
        order: { createdAt: 'DESC' },
      }),
      this.businessRepository.count({ where: { isActive: true } }),
    ]);

    // Check each business for automatic verification
    const updatedBusinesses = await Promise.all(
      businesses.map(async (business) => {
        // Apply the same verification logic as in getBusinessById
        if (
          !business.isVerified && 
          business.onboardingStep === OnboardingStep.ACCOUNT_SETUP &&
          business.bankCode && 
          business.accountNumber && 
          business.accountName && 
          business.accountType &&
          business.name &&
          business.phoneNumber &&
          business.description &&
          (business.categoryId || business.category)
        ) {
          this.logger.log(`Business ${business.id} has completed all required steps. Automatically verifying.`);
          
          business.isVerified = true;
          business.onboardingStep = OnboardingStep.COMPLETED;
          
          // Save the updated verification status
          return this.businessRepository.save(business);
        }
        
        return business;
      })
    );

    this.logger.debug(`Found ${businesses.length} businesses out of ${total} total`);
    
    // Convert entities to simplified DTOs
    const simplifiedBusinesses = updatedBusinesses.map(business => this.toSimplifiedResponse(business));
    
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
   * @returns List of categories
   */
  async getAllCategories(name?: string): Promise<CategoryListResponse> {
    this.logger.log(`Fetching business categories${name ? ` with name: ${name}` : ''}`);
    try {
      let query = 'SELECT * FROM public.categories WHERE "isActive" = true';
      
      // Add name filter if provided
      if (name) {
        query += ` AND name = $1`;
        const categories = await this.categoryRepository.query(query, [name]);
        
        this.logger.debug(`Found ${categories.length} active categories with name: ${name}`);
        
        return {
          categories,
          total: categories.length,
        };
      }
      
      // If no name filter, get all categories
      query += ' ORDER BY name ASC';
      const categories = await this.categoryRepository.query(query);
      
      this.logger.debug(`Found ${categories.length} active categories`);

      return {
        categories,
        total: categories.length,
      };
    } catch (error) {
      this.logger.error(`Error fetching categories: ${error.message}`, error.stack);
      // Return empty result on error
      return {
        categories: [],
        total: 0,
      };
    }
  }

  /**
   * Deactivates a business
   * @param id Business ID
   * @param ownerId ID of the requesting user
   */
  async deactivateBusiness(id: string, ownerId: string): Promise<void> {
    const business = await this.businessRepository.findOne({
      where: { id, ownerId },
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    await this.businessRepository.update({ id }, { isActive: false });
  }

  /**
   * Gets a list of supported currencies from the Paycrest API
   * @returns List of supported currencies
   */
  async getSupportedCurrencies(): Promise<Currency[]> {
    try {
      const response = await this.paycrestService.getSupportedCurrencies();
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch supported currencies: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to fetch supported currencies: ${error.message}`);
    }
  }

  /**
   * Get all supported financial institutions for a specific currency
   * @param currencyCode Optional currency code to filter institutions
   * @returns Array of institutions supported by the payment processor
   */
  async getSupportedInstitutions(currencyCode?: string): Promise<Institution[]> {
    this.logger.log(`Fetching supported institutions for currency: ${currencyCode || 'all'}`);
    const institutions = await this.paycrestService.getInstitutions(currencyCode);
    return institutions;
  }

  /**
   * Gets the exchange rate for a cryptocurrency to fiat conversion
   * @param token The cryptocurrency token (e.g., 'USDT')
   * @param amount The amount of cryptocurrency
   * @param fiat The fiat currency code (e.g., 'NGN')
   * @param providerId Optional provider ID for specific liquidity provider
   * @returns Exchange rate and calculated fiat amount
   */
  async getExchangeRate(
    token: string,
    amount: string,
    fiat: string,
    providerId?: string
  ): Promise<ExchangeRateResponse> {
    try {
      this.logger.debug(`Getting exchange rate for ${amount} ${token} to ${fiat}`);
      
      const response = await this.paycrestService.getExchangeRate({
        sourceCurrency: token,
        targetCurrency: fiat,
        amount: parseFloat(amount),
      });
      
      const rate = response.data;
      
      // Calculate the fiat amount
      const tokenAmount = parseFloat(amount);
      const rateValue = parseFloat(rate);
      const fiatAmount = (tokenAmount * rateValue).toFixed(2);
      
      return {
        rate,
        fiatAmount,
        token,
        fiat
      };
    } catch (error) {
      this.logger.error(`Failed to get exchange rate: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to get exchange rate: ${error.message}`);
    }
  }

  /**
   * Helper method to transform a business entity to a simplified response DTO
   * @param business The business entity to transform
   * @returns SimplifiedBusinessResponseDto
   */
  private toSimplifiedResponse(business: Business): SimplifiedBusinessResponseDto {
    const simplified = new SimplifiedBusinessResponseDto();
    simplified.id = business.id;
    simplified.name = business.name;
    simplified.phoneNumber = business.phoneNumber;
    simplified.isVerified = business.isVerified;
    simplified.onboardingStep = business.onboardingStep;
    simplified.settlementCurrency = business.settlementCurrency;
    simplified.isActive = business.isActive;
    simplified.createdAt = business.createdAt;
    simplified.updatedAt = business.updatedAt;
    
    return simplified;
  }
} 