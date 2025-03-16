import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessService } from './business.service';
import { Business, OnboardingStep, AccountType } from './entities/business.entity';
import { Category } from './entities/category.entity';
import { CreateBusinessDto } from './dto/create-business.dto';
import { LinkBankDto } from './dto/link-bank.dto';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PaycrestService } from '../paycrest/paycrest.service';
import { BankAccountDetail, ExchangeRateResponse } from './interfaces/business.interface';
import { Currency, Institution, PaycrestResponse } from '../paycrest/interfaces';

describe('BusinessService', () => {
  let businessService: BusinessService;
  let businessRepository: Repository<Business>;
  let categoryRepository: Repository<Category>;
  let paycrestService: PaycrestService;

  const mockBusinessRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    count: jest.fn(),
  };

  const mockCategoryRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  };

  const mockPaycrestService = {
    verifyAccount: jest.fn(),
    getSupportedCurrencies: jest.fn(),
    getSupportedInstitutions: jest.fn(),
    getTokenRate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        {
          provide: getRepositoryToken(Business),
          useValue: mockBusinessRepository,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepository,
        },
        {
          provide: PaycrestService,
          useValue: mockPaycrestService,
        },
      ],
    }).compile();

    businessService = module.get<BusinessService>(BusinessService);
    businessRepository = module.get<Repository<Business>>(getRepositoryToken(Business));
    categoryRepository = module.get<Repository<Category>>(getRepositoryToken(Category));
    paycrestService = module.get<PaycrestService>(PaycrestService);

    // Reset mock calls between tests
    jest.clearAllMocks();
  });

  describe('updateBusinessEntity', () => {
    it('should update a business with valid data and existing category', async () => {
      // Arrange
      const ownerId = 'user-123';
      const businessId = 'business-123';
      const createBusinessDto: CreateBusinessDto = {
        name: 'Test Business',
        phoneNumber: '+1234567890',
        description: 'Test description',
        categoryId: 'category-123',
      };

      const category = { id: 'category-123', name: 'Retail' } as Category;
      const existingBusiness = { 
        id: businessId, 
        name: null,
        phoneNumber: null,
        description: null,
        ownerId,
        onboardingStep: OnboardingStep.NOT_STARTED
      } as Business;
      
      const updatedBusiness = { 
        ...existingBusiness,
        ...createBusinessDto, 
        category,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockCategoryRepository.findOne.mockResolvedValue(category);
      mockBusinessRepository.save.mockResolvedValue(updatedBusiness);

      // Act
      const result = await businessService.updateBusinessEntity(businessId, createBusinessDto, ownerId);

      // Assert
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId, ownerId }
      });
      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({ where: { id: createBusinessDto.categoryId } });
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingBusiness,
        ...createBusinessDto,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
      }));
      expect(result).toEqual(updatedBusiness);
    });

    it('should update a business with a new custom category', async () => {
      // Arrange
      const ownerId = 'user-123';
      const businessId = 'business-123';
      const createBusinessDto: CreateBusinessDto = {
        name: 'Test Business',
        phoneNumber: '+1234567890',
        description: 'Test description',
        categoryName: 'New Custom Category',
      };

      const existingBusiness = { 
        id: businessId, 
        name: null,
        phoneNumber: null,
        description: null,
        ownerId,
        onboardingStep: OnboardingStep.NOT_STARTED
      } as Business;
      
      const newCategory = { 
        id: 'new-category-123', 
        name: 'New Custom Category',
        isCustom: true
      } as Category;

      const updatedBusiness = { 
        ...existingBusiness,
        ...createBusinessDto, 
        category: newCategory,
        categoryId: newCategory.id,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockCategoryRepository.findOne.mockResolvedValue(null);
      mockCategoryRepository.create.mockReturnValue(newCategory);
      mockCategoryRepository.save.mockResolvedValue(newCategory);
      mockBusinessRepository.save.mockResolvedValue(updatedBusiness);

      // Act
      const result = await businessService.updateBusinessEntity(businessId, createBusinessDto, ownerId);

      // Assert
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId, ownerId }
      });
      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({ where: { name: createBusinessDto.categoryName } });
      expect(mockCategoryRepository.create).toHaveBeenCalledWith({
        name: createBusinessDto.categoryName,
        isCustom: true,
      });
      expect(mockCategoryRepository.save).toHaveBeenCalledWith(newCategory);
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingBusiness,
        ...createBusinessDto,
        category: newCategory,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
      }));
      expect(result).toEqual(updatedBusiness);
    });

    it('should throw an error if business is not found', async () => {
      // Arrange
      const ownerId = 'user-123';
      const businessId = 'non-existent-business';
      const createBusinessDto: CreateBusinessDto = {
        name: 'Test Business',
        phoneNumber: '+1234567890',
        description: 'Test description',
        categoryId: 'category-123',
      };

      mockBusinessRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(businessService.updateBusinessEntity(businessId, createBusinessDto, ownerId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw an error if the category is not found', async () => {
      // Arrange
      const ownerId = 'user-123';
      const businessId = 'business-123';
      const createBusinessDto: CreateBusinessDto = {
        name: 'Test Business',
        phoneNumber: '+1234567890',
        description: 'Test description',
        categoryId: 'non-existent-category',
      };

      const existingBusiness = { 
        id: businessId, 
        ownerId,
        onboardingStep: OnboardingStep.NOT_STARTED
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockCategoryRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(businessService.updateBusinessEntity(businessId, createBusinessDto, ownerId))
        .rejects.toThrow(NotFoundException);
    });

    it('should handle partial updates with only some fields provided', async () => {
      // Arrange
      const ownerId = 'user-123';
      const businessId = 'business-123';
      const partialUpdateDto: CreateBusinessDto = {
        name: 'Updated Name',
        // Only update name, no other fields
      };

      const existingBusiness = { 
        id: businessId, 
        name: 'Original Name',
        phoneNumber: '+1234567890',
        description: 'Existing description',
        categoryId: 'category-123',
        ownerId,
        onboardingStep: OnboardingStep.BUSINESS_SETUP
      } as Business;
      
      const updatedBusiness = { 
        ...existingBusiness,
        name: 'Updated Name',
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockBusinessRepository.save.mockResolvedValue(updatedBusiness);

      // Act
      const result = await businessService.updateBusinessEntity(businessId, partialUpdateDto, ownerId);

      // Assert
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId, ownerId }
      });
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingBusiness,
        name: 'Updated Name',
      }));
      expect(result).toEqual(updatedBusiness);
      // Should not change onboarding step as it's already in BUSINESS_SETUP
      expect(result.onboardingStep).toBe(OnboardingStep.BUSINESS_SETUP);
    });
  });

  describe('getBusinessById', () => {
    it('should retrieve a business by its ID', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const business = { 
        id: businessId, 
        name: 'Test Business',
        ownerId 
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(business);

      // Act
      const result = await businessService.getBusinessById(businessId, ownerId);

      // Assert
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({ 
        where: { id: businessId, ownerId },
        relations: ['category', 'owner'],
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          description: true,
          isVerified: true,
          onboardingStep: true,
          bankCode: true,
          accountNumber: true,
          accountName: true,
          accountType: true,
          settlementCurrency: true,
          categoryId: true,
          ownerId: true,
          isActive: true,
          createdAt: true, 
          updatedAt: true
        }
      });
      expect(result).toEqual(business);
    });

    it('should throw an error if the business is not found', async () => {
      // Arrange
      const businessId = 'non-existent-business';
      const ownerId = 'user-123';

      mockBusinessRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(businessService.getBusinessById(businessId, ownerId))
        .rejects.toThrow(NotFoundException);
    });

    // Add new tests for automatic verification status
    it('should automatically set isVerified to true when business has completed ACCOUNT_SETUP with valid bank details', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const business = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        onboardingStep: OnboardingStep.ACCOUNT_SETUP,
        bankCode: 'GTBINGLA',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
        isVerified: false, // Initially not verified
        description: 'Test description',
        phoneNumber: '+1234567890',
        category: { id: 'category-123', name: 'Retail' }
      } as Business;

      const verifiedBusiness = {
        ...business,
        isVerified: true,
        onboardingStep: OnboardingStep.COMPLETED
      };

      mockBusinessRepository.findOne.mockResolvedValue(business);
      mockBusinessRepository.save.mockResolvedValue(verifiedBusiness);

      // Act
      const result = await businessService.getBusinessById(businessId, ownerId);

      // Assert
      expect(result.isVerified).toBe(true);
      expect(result.onboardingStep).toBe(OnboardingStep.COMPLETED);
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        id: businessId,
        isVerified: true,
        onboardingStep: OnboardingStep.COMPLETED
      }));
    });

    it('should not change verification status when business is in BUSINESS_SETUP step', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const business = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
        isVerified: false
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(business);

      // Act
      const result = await businessService.getBusinessById(businessId, ownerId);

      // Assert
      expect(result.isVerified).toBe(false);
      expect(result.onboardingStep).toBe(OnboardingStep.BUSINESS_SETUP);
      expect(mockBusinessRepository.save).not.toHaveBeenCalled();
    });

    it('should not change verification status when business is already verified', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const business = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        onboardingStep: OnboardingStep.COMPLETED,
        bankCode: 'GTBINGLA',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
        isVerified: true
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(business);

      // Act
      const result = await businessService.getBusinessById(businessId, ownerId);

      // Assert
      expect(result.isVerified).toBe(true);
      expect(result.onboardingStep).toBe(OnboardingStep.COMPLETED);
      expect(mockBusinessRepository.save).not.toHaveBeenCalled();
    });

    it('should not verify business if bank details are missing', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const business = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        onboardingStep: OnboardingStep.ACCOUNT_SETUP,
        // Missing bank details
        isVerified: false
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(business);

      // Act
      const result = await businessService.getBusinessById(businessId, ownerId);

      // Assert
      expect(result.isVerified).toBe(false);
      expect(result.onboardingStep).toBe(OnboardingStep.ACCOUNT_SETUP);
      expect(mockBusinessRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateBankAccount', () => {
    it('should successfully link a bank account to a business with Paycrest account verification', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const linkBankDto: LinkBankDto = {
        bankCode: 'FBNINGLA',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      const existingBusiness = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
        isActive: true,
        category: { id: 'category-123', name: 'Retail' }
      } as Business;

      // Mock institutions list
      const institutions: Institution[] = [
        { name: 'First Bank', code: 'FBNINGLA', type: 'bank' },
        { name: 'GT Bank', code: 'GTBINGLA', type: 'bank' },
      ];

      const institutionsResponse: PaycrestResponse<Institution[]> = {
        message: "OK",
        status: "success",
        data: institutions
      };

      // Mock Paycrest API response format
      const paycrestResponse: PaycrestResponse<string> = {
        message: "Account name was fetched successfully",
        status: "success",
        data: "John Doe"
      };

      const updatedBusiness = {
        ...existingBusiness,
        ...linkBankDto,
        accountName: "John Doe", // From the API response
        onboardingStep: OnboardingStep.ACCOUNT_SETUP, // Advanced to the next stage
        isVerified: false 
      };

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockPaycrestService.getSupportedInstitutions.mockResolvedValue(institutionsResponse);
      mockPaycrestService.verifyAccount.mockResolvedValue(paycrestResponse);
      mockBusinessRepository.save.mockResolvedValue(updatedBusiness);

      // Act
      const result = await businessService.updateBankAccount(businessId, linkBankDto, ownerId);

      // Assert
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({ 
        where: { id: businessId, ownerId, isActive: true },
        relations: ['category'],
      });
      expect(mockPaycrestService.getSupportedInstitutions).toHaveBeenCalledWith(linkBankDto.settlementCurrency);
      expect(mockPaycrestService.verifyAccount).toHaveBeenCalledWith({
        institution: linkBankDto.bankCode,
        accountIdentifier: linkBankDto.accountNumber
      });
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingBusiness,
        ...linkBankDto,
        accountName: "Test Account",
        onboardingStep: OnboardingStep.ACCOUNT_SETUP
      }));
      expect(result).toEqual(updatedBusiness);
    });

    it('should use provided account name when Paycrest API returns OK', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const linkBankDto: LinkBankDto = {
        bankCode: 'FBNINGLA',
        accountNumber: '1234567890',
        accountName: 'Provided Account Name',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      const existingBusiness = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        phoneNumber: '+1234567890',
        description: 'Test description',
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
        isActive: true,
        categoryId: 'category-123',
        category: { id: 'category-123', name: 'Retail' }
      } as Business;

      // Mock institutions list
      const institutions: Institution[] = [
        { name: 'First Bank', code: 'FBNINGLA', type: 'bank' },
      ];

      const institutionsResponse: PaycrestResponse<Institution[]> = {
        message: "OK",
        status: "success",
        data: institutions
      };

      // Mock Paycrest API response format
      const paycrestResponse: PaycrestResponse<string> = {
        message: "Account name was fetched successfully",
        status: "success",
        data: "John Doe"
      };

      const updatedBusiness = {
        ...existingBusiness,
        ...linkBankDto,
        onboardingStep: OnboardingStep.ACCOUNT_SETUP,
      };

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockPaycrestService.getSupportedInstitutions.mockResolvedValue(institutionsResponse);
      mockPaycrestService.verifyAccount.mockResolvedValue(paycrestResponse);
      mockBusinessRepository.save.mockResolvedValue(updatedBusiness);

      // Act
      const result = await businessService.updateBankAccount(businessId, linkBankDto, ownerId);

      // Assert
      expect(result).toEqual(updatedBusiness);
      expect(result.accountName).toEqual(linkBankDto.accountName); // Should use the provided name
    });

    it('should throw an error if business is not found', async () => {
      // Arrange
      const businessId = 'non-existent-business';
      const ownerId = 'user-123';
      const linkBankDto: LinkBankDto = {
        bankCode: 'FBNINGLA',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      mockBusinessRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(businessService.updateBankAccount(businessId, linkBankDto, ownerId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw an error if bank code is invalid', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const linkBankDto: LinkBankDto = {
        bankCode: 'INVALID_BANK',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      const existingBusiness = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
        isActive: true,
        category: { id: 'category-123', name: 'Retail' }
      } as Business;

      // Mock institutions list with no match for the provided code
      const institutions: Institution[] = [
        { name: 'First Bank', code: 'FBNINGLA', type: 'bank' },
        { name: 'GT Bank', code: 'GTBINGLA', type: 'bank' },
      ];

      const institutionsResponse: PaycrestResponse<Institution[]> = {
        message: "OK",
        status: "success",
        data: institutions
      };

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockPaycrestService.getSupportedInstitutions.mockResolvedValue(institutionsResponse);

      // Act & Assert
      await expect(businessService.updateBankAccount(businessId, linkBankDto, ownerId))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw an error if account verification fails', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const linkBankDto: LinkBankDto = {
        bankCode: 'FBNINGLA',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      const existingBusiness = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
        isActive: true,
        category: { id: 'category-123', name: 'Retail' }
      } as Business;

      // Mock institutions list
      const institutions: Institution[] = [
        { name: 'First Bank', code: 'FBNINGLA', type: 'bank' },
        { name: 'GT Bank', code: 'GTBINGLA', type: 'bank' },
      ];

      const institutionsResponse: PaycrestResponse<Institution[]> = {
        message: "OK",
        status: "success",
        data: institutions
      };

      // Mock a failed Paycrest verification
      const paycrestFailedResponse: PaycrestResponse<string> = {
        message: "Account verification failed",
        status: "error",
        data: null
      };

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockPaycrestService.getSupportedInstitutions.mockResolvedValue(institutionsResponse);
      mockPaycrestService.verifyAccount.mockResolvedValue(paycrestFailedResponse);

      // Act & Assert
      await expect(businessService.updateBankAccount(businessId, linkBankDto, ownerId))
        .rejects.toThrow(BadRequestException);
    });

    it('should automatically verify the business when all required fields are provided', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const linkBankDto: LinkBankDto = {
        bankCode: 'FBNINGLA',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      // Business with all required fields already set
      const existingBusiness = { 
        id: businessId, 
        name: 'Complete Business',
        phoneNumber: '+1234567890',
        description: 'Complete description',
        ownerId,
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
        isActive: true,
        isVerified: false,
        categoryId: 'category-123',
        category: { id: 'category-123', name: 'Retail' }
      } as Business;

      // Mock institutions list
      const institutions: Institution[] = [
        { name: 'First Bank', code: 'FBNINGLA', type: 'bank' },
      ];

      const institutionsResponse: PaycrestResponse<Institution[]> = {
        message: "OK",
        status: "success",
        data: institutions
      };

      // Mock Paycrest API response format
      const paycrestResponse: PaycrestResponse<string> = {
        message: "Account name was fetched successfully",
        status: "success",
        data: "John Doe"
      };

      const verifiedBusiness = {
        ...existingBusiness,
        ...linkBankDto,
        accountName: "John Doe",
        onboardingStep: OnboardingStep.COMPLETED,
        isVerified: true
      };

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockPaycrestService.getSupportedInstitutions.mockResolvedValue(institutionsResponse);
      mockPaycrestService.verifyAccount.mockResolvedValue(paycrestResponse);
      mockBusinessRepository.save.mockResolvedValue(verifiedBusiness);

      // Act
      const result = await businessService.updateBankAccount(businessId, linkBankDto, ownerId);

      // Assert
      expect(result.isVerified).toBe(true);
      expect(result.onboardingStep).toBe(OnboardingStep.COMPLETED);
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingBusiness,
        ...linkBankDto,
        accountName: "Test Account",
        onboardingStep: OnboardingStep.COMPLETED,
        isVerified: true
      }));
    });
    
    it('should throw an error if business setup is not completed', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const linkBankDto: LinkBankDto = {
        bankCode: 'FBNINGLA',
        accountNumber: '1234567890',
        accountName: 'Test Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      const existingBusiness = { 
        id: businessId, 
        name: null,
        phoneNumber: null,
        description: null,
        ownerId,
        onboardingStep: OnboardingStep.NOT_STARTED,
        isActive: true
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);

      // Act & Assert
      await expect(businessService.updateBankAccount(businessId, linkBankDto, ownerId))
        .rejects.toThrow(BadRequestException);
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({ 
        where: { id: businessId, ownerId, isActive: true },
        relations: ['category'],
      });
    });

    it('should handle updating an existing bank account', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      const updateBankDto: LinkBankDto = {
        bankCode: 'GTBINGLA', // New bank
        accountNumber: '9876543210', // New account
        accountName: 'Updated Account Name',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
      };

      // Business with existing bank details
      const existingBusiness = { 
        id: businessId, 
        name: 'Test Business',
        phoneNumber: '+1234567890',
        description: 'Complete description',
        ownerId,
        onboardingStep: OnboardingStep.ACCOUNT_SETUP, // Already in account setup
        isActive: true,
        isVerified: false,
        bankCode: 'FBNINGLA', // Old bank
        accountNumber: '1234567890', // Old account
        accountName: 'Old Account Name',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN',
        categoryId: 'category-123',
        category: { id: 'category-123', name: 'Retail' }
      } as Business;

      // Mock institutions list
      const institutions: Institution[] = [
        { name: 'First Bank', code: 'FBNINGLA', type: 'bank' },
        { name: 'GT Bank', code: 'GTBINGLA', type: 'bank' },
      ];

      const institutionsResponse: PaycrestResponse<Institution[]> = {
        message: "OK",
        status: "success",
        data: institutions
      };

      // Mock Paycrest API response format
      const paycrestResponse: PaycrestResponse<string> = {
        message: "Account name was fetched successfully",
        status: "success",
        data: "New Account Name"
      };

      // Business after update
      const updatedBusiness = {
        ...existingBusiness,
        ...updateBankDto,
        accountName: "Updated Account Name", // Matches the actual implementation
        onboardingStep: OnboardingStep.COMPLETED, // The business is completed in the test
        isVerified: true // The business is verified in the test
      };

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockPaycrestService.getSupportedInstitutions.mockResolvedValue(institutionsResponse);
      mockPaycrestService.verifyAccount.mockResolvedValue(paycrestResponse);
      mockBusinessRepository.save.mockResolvedValue(updatedBusiness);

      // Act
      const result = await businessService.updateBankAccount(businessId, updateBankDto, ownerId);

      // Assert
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({ 
        where: { id: businessId, ownerId, isActive: true },
        relations: ['category'],
      });
      expect(mockPaycrestService.getSupportedInstitutions).toHaveBeenCalledWith(updateBankDto.settlementCurrency);
      expect(mockPaycrestService.verifyAccount).toHaveBeenCalledWith({
        institution: updateBankDto.bankCode,
        accountIdentifier: updateBankDto.accountNumber
      });
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingBusiness,
        ...updateBankDto,
        accountName: "Updated Account Name",
        isVerified: true,
        onboardingStep: "COMPLETED"
      }));
      expect(result).toEqual(updatedBusiness);
    });
  });

  describe('getAllBusinesses', () => {
    it('should return a paginated list of businesses for an owner', async () => {
      // Arrange
      const ownerId = 'user-123';
      const page = 1;
      const limit = 10;
      
      const businesses = [
        { id: 'business-1', name: 'Business 1', ownerId },
        { id: 'business-2', name: 'Business 2', ownerId },
      ] as Business[];

      mockBusinessRepository.find.mockResolvedValue(businesses);
      mockBusinessRepository.count = jest.fn().mockResolvedValue(businesses.length);

      // Act
      const result = await businessService.getAllBusinesses(ownerId, page, limit);

      // Assert
      expect(mockBusinessRepository.find).toHaveBeenCalledWith({
        where: { ownerId },
        relations: ['category'],
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          description: true,
          isVerified: true,
          onboardingStep: true,
          bankCode: true,
          accountNumber: true,
          accountName: true,
          accountType: true,
          settlementCurrency: true,
          categoryId: true,
          ownerId: true,
          isActive: true,
          createdAt: true, 
          updatedAt: true
        },
        skip: 0,
        take: limit,
        order: { createdAt: 'DESC' }
      });
      expect(result).toEqual({
        businesses,
        total: businesses.length,
        page,
        limit
      });
    });

    it('should automatically verify businesses that have completed all required steps', async () => {
      // Arrange
      const ownerId = 'user-123';
      const page = 1;
      const limit = 10;
      
      const businesses = [
        {
          id: 'business-1',
          name: 'Complete Business',
          phoneNumber: '+1234567890',
          description: 'Test description',
          bankCode: 'FBNINGLA',
          accountNumber: '1234567890',
          accountName: 'Test Account',
          accountType: AccountType.POS,
          settlementCurrency: 'NGN',
          category: { id: 'category-123', name: 'Retail' },
          categoryId: 'category-123',
          ownerId,
          onboardingStep: OnboardingStep.ACCOUNT_SETUP, // Ready for verification
          isVerified: false
        },
        // ... existing code ...
      ] as Business[];

      const verifiedBusiness = {
        ...businesses[0],
        isVerified: true,
        onboardingStep: OnboardingStep.COMPLETED
      };

      mockBusinessRepository.find.mockResolvedValue(businesses);
      mockBusinessRepository.count.mockResolvedValue(businesses.length);
      
      // Update the mock implementation to modify the array
      mockBusinessRepository.save.mockImplementation((business) => {
        businesses[0] = {
          ...businesses[0],
          isVerified: true,
          onboardingStep: OnboardingStep.COMPLETED
        };
        return verifiedBusiness;
      });

      // Act
      const result = await businessService.getAllBusinesses(ownerId, page, limit);

      // Assert
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        id: 'business-1',
        isVerified: true,
        onboardingStep: OnboardingStep.COMPLETED
      }));
      
      // First business should be verified
      expect(result.businesses[0].isVerified).toBe(true);
      expect(result.businesses[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
    });
  });

  describe('getAllCategories', () => {
    it('should return a list of all categories', async () => {
      // Arrange
      const categories = [
        { id: 'category-1', name: 'Retail', isCustom: false },
        { id: 'category-2', name: 'Food & Beverage', isCustom: false },
        { id: 'category-3', name: 'Custom Category', isCustom: true },
      ] as Category[];

      mockCategoryRepository.find.mockResolvedValue(categories);

      // Act
      const result = await businessService.getAllCategories();

      // Assert
      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { name: 'ASC' }
      });
      expect(result).toEqual({
        categories,
        total: categories.length
      });
    });
  });

  describe('deactivateBusiness', () => {
    it('should successfully deactivate a business', async () => {
      // Arrange
      const businessId = 'business-123';
      const ownerId = 'user-123';
      
      const existingBusiness = { 
        id: businessId, 
        name: 'Test Business',
        ownerId,
        isActive: true
      } as Business;

      mockBusinessRepository.findOne.mockResolvedValue(existingBusiness);
      mockBusinessRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await businessService.deactivateBusiness(businessId, ownerId);

      // Assert
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({ 
        where: { id: businessId, ownerId }
      });
      expect(mockBusinessRepository.update).toHaveBeenCalledWith(
        { id: businessId },
        { isActive: false }
      );
    });

    it('should throw an error if the business is not found', async () => {
      // Arrange
      const businessId = 'non-existent-business';
      const ownerId = 'user-123';

      mockBusinessRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(businessService.deactivateBusiness(businessId, ownerId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return a list of supported currencies from Paycrest API', async () => {
      // Arrange
      const mockCurrencies: Currency[] = [
        {
          code: "XOF-BEN",
          name: "West African CFA franc",
          shortName: "Céfa Benin",
          decimals: 2,
          symbol: "CFA",
          marketRate: "599.5"
        },
        {
          code: "NGN",
          name: "Nigerian Naira",
          shortName: "Naira",
          decimals: 2,
          symbol: "₦",
          marketRate: "1629.59"
        },
        {
          code: "KES",
          name: "Kenyan Shilling",
          shortName: "KES",
          decimals: 2,
          symbol: "KSh",
          marketRate: "129.3"
        }
      ];

      const paycrestResponse: PaycrestResponse<Currency[]> = {
        message: "OK",
        status: "success",
        data: mockCurrencies
      };

      mockPaycrestService.getSupportedCurrencies.mockResolvedValue(paycrestResponse);

      // Act
      const result = await businessService.getSupportedCurrencies();

      // Then
      expect(mockPaycrestService.getSupportedCurrencies).toHaveBeenCalled();
      expect(result).toEqual(mockCurrencies);
    });

    it('should throw BadRequestException if fetching currencies fails', async () => {
      // Arrange
      mockPaycrestService.getSupportedCurrencies.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(businessService.getSupportedCurrencies())
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getSupportedInstitutions', () => {
    it('should return a list of supported institutions for a currency from Paycrest API', async () => {
      // Arrange
      const currencyCode = 'NGN';
      const mockInstitutions: Institution[] = [
        {
          name: "GT Bank Plc",
          code: "GTBINGLA",
          type: "bank"
        },
        {
          name: "First Bank of Nigeria",
          code: "FBNINGLA",
          type: "bank"
        }
      ];

      const paycrestResponse: PaycrestResponse<Institution[]> = {
        message: "OK",
        status: "success",
        data: mockInstitutions
      };

      mockPaycrestService.getSupportedInstitutions.mockResolvedValue(paycrestResponse);

      // Act
      const result = await businessService.getSupportedInstitutions();

      // Then
      expect(mockPaycrestService.getSupportedInstitutions).toHaveBeenCalled();
      expect(result).toEqual(mockInstitutions);
    });

    it('should throw BadRequestException if fetching institutions fails', async () => {
      // Arrange
      mockPaycrestService.getSupportedInstitutions.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(businessService.getSupportedInstitutions())
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getExchangeRate', () => {
    it('should return the exchange rate for a token and amount', async () => {
      // Arrange
      const token = 'USDT';
      const amount = '100';
      const fiat = 'NGN';
      
      const rateResponse: PaycrestResponse<string> = {
        message: "OK",
        status: "success",
        data: "1629.59"
      };

      mockPaycrestService.getTokenRate.mockResolvedValue(rateResponse);

      // Act
      const result = await businessService.getExchangeRate(token, amount, fiat);

      // Then
      expect(mockPaycrestService.getTokenRate).toHaveBeenCalledWith(token, amount, fiat, undefined);
      expect(result).toEqual({
        rate: "1629.59",
        fiatAmount: "162959.00",
        token,
        fiat
      });
    });

    it('should handle provider ID when provided', async () => {
      // Arrange
      const token = 'USDT';
      const amount = '100';
      const fiat = 'NGN';
      const providerId = 'provider-123';
      
      const rateResponse: PaycrestResponse<string> = {
        message: "OK",
        status: "success",
        data: "1635.00"
      };

      mockPaycrestService.getTokenRate.mockResolvedValue(rateResponse);

      // Act
      const result = await businessService.getExchangeRate(token, amount, fiat, providerId);

      // Then
      expect(mockPaycrestService.getTokenRate).toHaveBeenCalledWith(token, amount, fiat, providerId);
      expect(result).toEqual({
        rate: "1635.00",
        fiatAmount: "163500.00",
        token,
        fiat
      });
    });

    it('should throw BadRequestException if fetching rate fails', async () => {
      // Arrange
      const token = 'USDT';
      const amount = '100';
      const fiat = 'NGN';
      
      mockPaycrestService.getTokenRate.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(businessService.getExchangeRate(token, amount, fiat))
        .rejects.toThrow(BadRequestException);
    });
  });
}); 