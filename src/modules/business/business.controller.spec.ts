import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { LinkBankDto } from './dto/link-bank.dto';
import { SimplifiedBusinessResponseDto } from './dto/business-response.dto';
import { Business, OnboardingStep, AccountType } from './entities/business.entity';
import { Category } from './entities/category.entity';

/**
 * Business Controller Tests
 * 
 * This file contains test cases for all endpoints in the Business Controller
 * including request and response examples for each endpoint.
 */
describe('BusinessController', () => {
  let controller: BusinessController;
  let businessService: BusinessService;

  // Mock data
  const mockOwnerId = 'user-123';
  const mockBusinessId = 'business-123';
  const mockCategoryId = 'category-123';
  const mockCategoryName = 'Retail';

  // Mock DTOs
  const createBusinessDto: CreateBusinessDto = {
    name: 'Test Business',
    phoneNumber: '+1234567890',
    description: 'A test business',
    categoryId: mockCategoryId,
  };

  const linkBankDto: LinkBankDto = {
    bankCode: 'BANK001',
    accountNumber: '1234567890',
    accountName: 'Test Account',
    accountType: AccountType.POS,
    settlementCurrency: 'USD',
  };

  // Mock business entity with null values (as created during authentication)
  const mockInitialBusiness: Partial<Business> = {
    id: mockBusinessId,
    name: null,
    phoneNumber: null,
    description: null,
    isVerified: false,
    onboardingStep: OnboardingStep.NOT_STARTED,
    ownerId: mockOwnerId,
    bankCode: null,
    accountNumber: null,
    accountName: null,
    accountType: null,
    settlementCurrency: null,
    categoryId: null,
    isActive: true,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    updatedAt: new Date('2023-01-01T00:00:00Z'),
  };

  // Mock business entity with complete information
  const mockBusiness: Partial<Business> = {
    id: mockBusinessId,
    name: 'Test Business',
    phoneNumber: '+1234567890',
    description: 'A test business',
    isVerified: false,
    onboardingStep: OnboardingStep.BUSINESS_SETUP,
    ownerId: mockOwnerId,
  };

  // Mock simplified business response
  const mockSimplifiedBusiness: SimplifiedBusinessResponseDto = {
    id: mockBusinessId,
    name: 'Test Business',
    phoneNumber: '+1234567890',
    isVerified: false,
    onboardingStep: OnboardingStep.BUSINESS_SETUP,
    settlementCurrency: 'USD',
    isActive: true,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    updatedAt: new Date('2023-01-01T00:00:00Z'),
  };

  // Mock category entity
  const mockCategory: Partial<Category> = {
    id: mockCategoryId,
    name: mockCategoryName,
  };

  // Mock updated business
  const updatedBusiness = {
    ...mockBusiness,
    name: 'Updated Business Name',
  };

  // Mock bank account details
  const mockBusinessWithBank: Partial<Business> = {
    ...mockBusiness,
    bankCode: 'BANK001',
    accountNumber: '1234567890',
    accountName: 'Test Account',
    accountType: AccountType.POS,
    settlementCurrency: 'USD',
    onboardingStep: OnboardingStep.ACCOUNT_SETUP,
  };

  // Mock verified business
  const mockVerifiedBusiness: Partial<Business> = {
    ...mockBusinessWithBank,
    isVerified: true,
    onboardingStep: OnboardingStep.COMPLETED,
  };

  // Mock paginated response
  const mockBusinessesResponse = {
    businesses: [mockSimplifiedBusiness],
    total: 1,
    page: 1,
    limit: 10
  };

  // Mock response for getAllCategories
  const mockCategoriesResponse = {
    categories: [mockCategory],
    total: 1,
  };

  // Mock currencies response
  const mockCurrencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1 },
    { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', rate: 750 },
  ];

  // Mock institutions response
  const mockInstitutions = [
    { code: 'BANK001', name: 'Test Bank 1', type: 'bank' },
    { code: 'BANK002', name: 'Test Bank 2', type: 'bank' },
  ];

  // Mock exchange rate response
  const mockExchangeRate = {
    currencyCode: 'NGN',
    rate: 750,
    lastUpdated: new Date().toISOString(),
  };

  // Mock service
  const mockBusinessService = {
    getBusinessById: jest.fn(),
    updateBusiness: jest.fn().mockImplementation((id, dto, ownerId) =>
      Promise.resolve({
        ...mockInitialBusiness,
        ...dto,
        onboardingStep: OnboardingStep.BUSINESS_SETUP
      })
    ),
    updateBankAccount: jest.fn(),
    getAllBusinesses: jest.fn(),
    getAllCategories: jest.fn(),
    deactivateBusiness: jest.fn(),
    getSupportedCurrencies: jest.fn(),
    getSupportedInstitutions: jest.fn(),
    getExchangeRate: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusinessController],
      providers: [
        {
          provide: BusinessService,
          useValue: mockBusinessService,
        },
      ],
    }).compile();

    controller = module.get<BusinessController>(BusinessController);
    businessService = module.get<BusinessService>(BusinessService);

    // Reset mock calls before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  /**
   * GET /businesses/:id
   * Request: No body, just the business ID in URL and authentication
   * 
   * Response example (200 OK):
   * {
   *   "id": "business-123",
   *   "name": "Test Business",
   *   "phoneNumber": "+1234567890",
   *   "description": "A test business",
   *   "isVerified": false,
   *   "onboardingStep": "BUSINESS_SETUP",
   *   "ownerId": "user-123",
   *   "bankCode": null,
   *   "accountNumber": null,
   *   "accountName": null,
   *   "accountType": null,
   *   "settlementCurrency": "USD",
   *   "categoryId": "category-123",
   *   "isActive": true,
   *   "createdAt": "2023-01-01T00:00:00Z",
   *   "updatedAt": "2023-01-01T00:00:00Z"
   * }
   */
  describe('getBusinessById', () => {
    it('should return a business by ID', async () => {
      const req = { user: { id: mockOwnerId } };
      
      mockBusinessService.getBusinessById.mockResolvedValueOnce(mockSimplifiedBusiness);
      const result = await controller.getBusinessById(mockBusinessId, req);
      
      // Check that only the essential fields are present in the simplified response
      expect(result).toEqual(mockSimplifiedBusiness);
      expect(result.id).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.phoneNumber).toBeDefined();
      expect(result.isVerified).toBeDefined();
      expect(result.onboardingStep).toBeDefined();
      expect(result.settlementCurrency).toBeDefined();
      expect(result.isActive).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      
      // These fields should not be present in the simplified response
      // expect(result.description).toBeDefined();
      // expect(result.ownerId).toBeDefined();
      // expect(result.bankCode).toBeDefined();
      // expect(result.accountNumber).toBeDefined();
      // expect(result.accountName).toBeDefined();
      // expect(result.accountType).toBeDefined();
      // expect(result.categoryId).toBeDefined();
      // expect(result.category).toBeDefined();

      expect(businessService.getBusinessById).toHaveBeenCalledWith(mockBusinessId, mockOwnerId);
    });

    it('should handle not found error', async () => {
      const req = { user: { id: mockOwnerId } };
      mockBusinessService.getBusinessById.mockRejectedValueOnce(new NotFoundException('Business not found'));
      
      await expect(controller.getBusinessById('non-existent-id', req)).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * PATCH /businesses/:id
   * Request example:
   * {
   *   "name": "Updated Business Name",
   *   "phoneNumber": "+1234567890",
   *   "description": "Updated business description",
   *   "categoryId": "category-123"
   * }
   * 
   * Response example (200 OK):
   * {
   *   "id": "business-123",
   *   "name": "Updated Business Name",
   *   "phoneNumber": "+1234567890",
   *   "description": "Updated business description",
   *   "isVerified": false,
   *   "onboardingStep": "BUSINESS_SETUP",
   *   "ownerId": "user-123",
   *   ...other fields remain the same
   * }
   */
  describe('updateBusiness', () => {
    it('should update a business entity and return it', async () => {
      const req = { user: { id: mockOwnerId } };
      const updateDto: CreateBusinessDto = { 
        name: 'Updated Business Name',
        phoneNumber: '+1234567890',
        description: 'Updated business description',
        categoryId: mockCategoryId
      };
      
      mockBusinessService.updateBusiness.mockResolvedValueOnce({
        ...mockInitialBusiness,
        ...updateDto,
        onboardingStep: OnboardingStep.BUSINESS_SETUP
      });
      
      const result = await controller.updateBusiness(mockBusinessId, updateDto, req);
      
      expect(result.name).toEqual(updateDto.name);
      expect(result.phoneNumber).toEqual(updateDto.phoneNumber);
      expect(result.description).toEqual(updateDto.description);
      expect(result.categoryId).toEqual(updateDto.categoryId);
      expect(result.onboardingStep).toEqual(OnboardingStep.BUSINESS_SETUP);
      
      expect(businessService.updateBusiness).toHaveBeenCalledWith(mockBusinessId, updateDto, mockOwnerId);
    });

    it('should update a business with minimal data', async () => {
      const req = { user: { id: mockOwnerId } };
      const minimalDto: CreateBusinessDto = { 
        name: 'Updated Business Name'
      };
      
      mockBusinessService.updateBusiness.mockResolvedValueOnce({
        ...mockInitialBusiness,
        ...minimalDto
      });
      
      const result = await controller.updateBusiness(mockBusinessId, minimalDto, req);
      
      expect(result.name).toEqual(minimalDto.name);
      expect(businessService.updateBusiness).toHaveBeenCalledWith(mockBusinessId, minimalDto, mockOwnerId);
    });

    it('should extract owner ID from request', async () => {
      const req = { user: { id: mockOwnerId } };
      const updateDto: CreateBusinessDto = { name: 'Updated Business' };
      
      await controller.updateBusiness(mockBusinessId, updateDto, req);
      
      expect(businessService.updateBusiness).toHaveBeenCalledWith(
        mockBusinessId,
        updateDto,
        mockOwnerId
      );
    });

    it('should throw NotFoundException when business not found', async () => {
      const req = { user: { id: mockOwnerId } };
      const updateDto: CreateBusinessDto = { name: 'Updated Business' };
      
      mockBusinessService.updateBusiness.mockRejectedValueOnce(
        new NotFoundException(`Business with ID non-existent-id not found`)
      );
      
      await expect(
        controller.updateBusiness('non-existent-id', updateDto, req)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid data', async () => {
      const req = { user: { id: mockOwnerId } };
      const invalidDto = { invalidField: 'value' };
      
      mockBusinessService.updateBusiness.mockRejectedValueOnce(
        new BadRequestException('Invalid data')
      );
      
      await expect(
        controller.updateBusiness(mockBusinessId, invalidDto as CreateBusinessDto, req)
      ).rejects.toThrow(BadRequestException);
    });
  });

  /**
   * PUT /businesses/:id/bank-account
   * Request example:
   * {
   *   "bankCode": "BANK001",
   *   "accountNumber": "1234567890",
   *   "accountName": "Test Account",
   *   "accountType": "pos",
   *   "settlementCurrency": "USD"
   * }
   * 
   * Response example (200 OK):
   * {
   *   "id": "business-123",
   *   "name": "Test Business",
   *   "phoneNumber": "+1234567890",
   *   "description": "A test business",
   *   "isVerified": false,
   *   "onboardingStep": "ACCOUNT_SETUP",
   *   "ownerId": "user-123",
   *   "bankCode": "BANK001",
   *   "accountNumber": "1234567890",
   *   "accountName": "Test Account",
   *   "accountType": "pos",
   *   "settlementCurrency": "USD",
   *   ...other fields remain the same
   * }
   */
  describe('updateBankAccount', () => {
    it('should initially link a bank account to a business', async () => {
      const req = { user: { id: mockOwnerId } };
      // Mock a business with no existing bank details
      const businessWithoutBank = {...mockBusiness, bankCode: null, accountNumber: null};
      mockBusinessService.updateBankAccount.mockResolvedValueOnce({
        ...businessWithoutBank,
        ...linkBankDto,
        onboardingStep: OnboardingStep.ACCOUNT_SETUP
      });
      
      const result = await controller.updateBankAccount(mockBusinessId, linkBankDto, req);
      
      expect(result.bankCode).toEqual(linkBankDto.bankCode);
      expect(result.accountNumber).toEqual(linkBankDto.accountNumber);
      expect(result.accountName).toEqual(linkBankDto.accountName);
      expect(result.accountType).toEqual(linkBankDto.accountType);
      expect(result.onboardingStep).toEqual(OnboardingStep.ACCOUNT_SETUP);
      
      expect(businessService.updateBankAccount).toHaveBeenCalledWith(
        mockBusinessId, 
        linkBankDto, 
        mockOwnerId
      );
    });
    
    it('should update an existing bank account', async () => {
      const req = { user: { id: mockOwnerId } };
      // Mock a business with existing bank details
      const existingBankDetails = {
        bankCode: 'OLD_BANK',
        accountNumber: '9876543210',
        accountName: 'Old Account',
        accountType: AccountType.POS,
        settlementCurrency: 'USD'
      };
      const businessWithExistingBank = {...mockBusiness, ...existingBankDetails};
      
      // New bank details for update
      const updatedBankDto: LinkBankDto = {
        bankCode: 'NEW_BANK',
        accountNumber: '1234567890',
        accountName: 'New Account',
        accountType: AccountType.POS,
        settlementCurrency: 'NGN'
      };
      
      mockBusinessService.updateBankAccount.mockResolvedValueOnce({
        ...businessWithExistingBank,
        ...updatedBankDto,
        onboardingStep: OnboardingStep.ACCOUNT_SETUP
      });
      
      const result = await controller.updateBankAccount(mockBusinessId, updatedBankDto, req);
      
      expect(result.bankCode).toEqual(updatedBankDto.bankCode);
      expect(result.accountNumber).toEqual(updatedBankDto.accountNumber);
      expect(result.accountName).toEqual(updatedBankDto.accountName);
      
      expect(businessService.updateBankAccount).toHaveBeenCalledWith(
        mockBusinessId, 
        updatedBankDto, 
        mockOwnerId
      );
    });

    it('should use default owner ID if not provided in request', async () => {
      const req = { user: { id: undefined } };
      
      // Mock the appropriate dependencies
      mockBusinessService.updateBankAccount.mockResolvedValueOnce({
        ...mockBusiness,
        ...linkBankDto
      });
      
      await controller.updateBankAccount(mockBusinessId, linkBankDto, req);
      
      expect(businessService.updateBankAccount).toHaveBeenCalledWith(
        mockBusinessId,
        linkBankDto, 
        undefined // Now expecting undefined since we don't use default-owner-id anymore
      );
    });

    it('should handle not found error', async () => {
      const req = { user: { id: mockOwnerId } };
      mockBusinessService.updateBankAccount.mockRejectedValueOnce(
        new NotFoundException('Business not found')
      );
      
      await expect(
        controller.updateBankAccount('non-existent-id', linkBankDto, req)
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle validation errors', async () => {
      const req = { user: { id: mockOwnerId } };
      mockBusinessService.updateBankAccount.mockRejectedValueOnce(
        new BadRequestException('Invalid bank details')
      );
      
      await expect(
        controller.updateBankAccount(mockBusinessId, linkBankDto, req)
      ).rejects.toThrow(BadRequestException);
    });
    
    it('should handle incomplete business setup error', async () => {
      const req = { user: { id: mockOwnerId } };
      mockBusinessService.updateBankAccount.mockRejectedValueOnce(
        new BadRequestException('Business details must be set up before linking a bank account')
      );
      
      await expect(
        controller.updateBankAccount(mockBusinessId, linkBankDto, req)
      ).rejects.toThrow(BadRequestException);
    });
  });

  /**
   * GET /businesses
   * Request: Query parameters for pagination (page, limit)
   * 
   * Response example (200 OK):
   * {
   *   "businesses": [
   *     {
   *       "id": "business-123",
   *       "name": "Test Business",
   *       "phoneNumber": "+1234567890",
   *       "description": "A test business",
   *       "isVerified": false,
   *       "onboardingStep": "BUSINESS_SETUP",
   *       "ownerId": "user-123",
   *       ...all other business fields
   *     }
   *   ],
   *   "total": 1,
   *   "page": 1,
   *   "limit": 10
   * }
   */
  describe('getAllBusinesses', () => {
    it('should return all businesses for an owner', async () => {
      const req = { user: { id: mockOwnerId } };
      const result = await controller.getAllBusinesses(req, 1, 10);
      
      expect(result).toEqual(mockBusinessesResponse);
      expect(businessService.getAllBusinesses).toHaveBeenCalledWith(mockOwnerId, 1, 10);
    });
  });

  /**
   * GET /businesses/categories/all
   * Response example (200 OK):
   * {
   *   "categories": [
   *     {
   *       "id": "category-123",
   *       "name": "Retail"
   *     }
   *   ],
   *   "total": 1
   * }
   */
  describe('getAllCategories', () => {
    it('should return all business categories', async () => {
      const result = await controller.getAllCategories();
      
      expect(result).toEqual(mockCategoriesResponse);
      expect(businessService.getAllCategories).toHaveBeenCalled();
    });
  });

  /**
   * POST /businesses/:id/deactivate
   * Request: No body, just the business ID in URL and authentication
   * 
   * Response example (200 OK):
   * {
   *   "success": true
   * }
   */
  describe('deactivateBusiness', () => {
    it('should deactivate a business and return success', async () => {
      const req = { user: { id: mockOwnerId } };
      const result = await controller.deactivateBusiness(mockBusinessId, req);
      
      expect(result).toEqual({ success: true });
      expect(businessService.deactivateBusiness).toHaveBeenCalledWith(mockBusinessId, mockOwnerId);
    });

    it('should handle not found error', async () => {
      const req = { user: { id: mockOwnerId } };
      mockBusinessService.deactivateBusiness.mockRejectedValueOnce(new NotFoundException('Business not found'));
      
      await expect(controller.deactivateBusiness('non-existent-id', req)).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * GET /businesses/currencies
   * Response example (200 OK):
   * [
   *   {
   *     "code": "USD",
   *     "name": "US Dollar",
   *     "symbol": "$",
   *     "rate": 1
   *   },
   *   {
   *     "code": "NGN",
   *     "name": "Nigerian Naira",
   *     "symbol": "₦",
   *     "rate": 750
   *   }
   * ]
   */
  describe('getSupportedCurrencies', () => {
    it('should return all supported currencies', async () => {
      const result = await controller.getSupportedCurrencies();
      
      expect(result).toEqual(mockCurrencies);
      expect(businessService.getSupportedCurrencies).toHaveBeenCalled();
    });
  });

  /**
   * GET /businesses/institutions/:currencyCode
   * Response example (200 OK):
   * [
   *   {
   *     "code": "BANK001",
   *     "name": "Test Bank 1",
   *     "type": "bank"
   *   },
   *   {
   *     "code": "BANK002",
   *     "name": "Test Bank 2",
   *     "type": "bank"
   *   }
   * ]
   */
  describe('getSupportedInstitutions', () => {
    it('should return all supported institutions for a currency', async () => {
      const result = await controller.getSupportedInstitutions('NGN');
      
      expect(result).toEqual(mockInstitutions);
      expect(businessService.getSupportedInstitutions).toHaveBeenCalledWith('NGN');
    });
  });

  /**
   * GET /businesses/exchange-rate/:currencyCode?amount=1&tokenCode=USDT&providerId=provider1
   * Response example (200 OK):
   * {
   *   "currencyCode": "NGN",
   *   "rate": 750,
   *   "lastUpdated": "2023-01-01T00:00:00Z"
   * }
   */
  describe('getExchangeRate', () => {
    it('should return exchange rate for a currency', async () => {
      const result = await controller.getExchangeRate('NGN', '1', 'USDT', 'provider1');
      
      expect(result).toEqual(mockExchangeRate);
      expect(businessService.getExchangeRate).toHaveBeenCalledWith('USDT', '1', 'NGN', 'provider1');
    });

    it('should use default values when optional parameters are omitted', async () => {
      const result = await controller.getExchangeRate('NGN');
      
      expect(result).toEqual(mockExchangeRate);
      expect(businessService.getExchangeRate).toHaveBeenCalledWith('USDT', '1', 'NGN', undefined);
    });

    it('should pass providerId when provided', async () => {
      const providerId = 'special-provider';
      const result = await controller.getExchangeRate('NGN', '2', 'BTC', providerId);
      
      expect(result).toEqual(mockExchangeRate);
      expect(businessService.getExchangeRate).toHaveBeenCalledWith('BTC', '2', 'NGN', providerId);
    });
  });
}); 