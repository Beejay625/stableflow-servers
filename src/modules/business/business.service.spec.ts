import { Test, TestingModule } from '@nestjs/testing';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { Business, OnboardingStep, AccountType } from './entities/business.entity';
import { Category } from './entities/category.entity';
import { BusinessDto } from './dto/update-business.dto';
import { PaycrestService } from '../paycrest/paycrest.service';
import { WalletService } from '../wallet/wallet.service';
import { BusinessResponseDto } from './dto/business-response.dto';

describe('BusinessService', () => {
  let service: BusinessService;
  let businessRepo: jest.Mocked<Repository<Business>>;
  let categoryRepo: jest.Mocked<Repository<Category>>;
  let paycrestSvc: jest.Mocked<PaycrestService>;
  let walletSvc: jest.Mocked<WalletService>;
  let configSvc: jest.Mocked<ConfigService>;

  const mockRepositoryFactory = <T>(): Partial<Repository<T>> => ({
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      getMany: jest.fn(),
      getOne: jest.fn()
    } as unknown as SelectQueryBuilder<T>)
  });

  beforeEach(async () => {
    businessRepo = mockRepositoryFactory<Business>() as unknown as jest.Mocked<Repository<Business>>;
    categoryRepo = mockRepositoryFactory<Category>() as unknown as jest.Mocked<Repository<Category>>;
    
    paycrestSvc = {
      getSupportedCurrencies: jest.fn(),
      getTokenRate: jest.fn(),
      getExchangeRate: jest.fn(),
      verifyAccount: jest.fn(),
      getSupportedInstitutions: jest.fn(),
      getInstitutions: jest.fn()
    } as unknown as jest.Mocked<PaycrestService>;
    
    configSvc = {
      get: jest.fn(),
      getOrThrow: jest.fn()
    } as unknown as jest.Mocked<ConfigService>;
    
    walletSvc = {
      generateWalletForCompletedBusiness: jest.fn().mockImplementation(async (businessId: string) => {
        return { data: { walletAddress: 'mock-wallet-address' } };
      }),
      isBusinessReadyForWallet: jest.fn(),
      generateWalletAddress: jest.fn()
    } as unknown as jest.Mocked<WalletService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        {
          provide: getRepositoryToken(Business),
          useValue: businessRepo
        },
        {
          provide: getRepositoryToken(Category),
          useValue: categoryRepo
        },
        {
          provide: PaycrestService,
          useValue: paycrestSvc
        },
        {
          provide: ConfigService,
          useValue: configSvc
        },
        {
          provide: WalletService,
          useValue: walletSvc
        }
      ],
    }).compile();

    service = module.get<BusinessService>(BusinessService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateBusiness', () => {
    it('should update business with category by ID', async () => {
      const businessId = 'test-id';
      const ownerId = 'owner-id';
      const businessDto: BusinessDto = {
        name: 'Updated Business',
        phoneNumber: '+2347012345678',
        categoryId: 'category-id'
      };

      const existingBusiness = { 
        id: businessId, 
        ownerId,
        name: 'Old Name',
        phoneNumber: '+1234567890',
        onboardingStep: OnboardingStep.NOT_STARTED
      } as Business;

      const category = { 
        id: businessDto.categoryId, 
        name: 'Test Category'
      } as Category;

      const updatedBusiness = {
        ...existingBusiness,
        ...businessDto,
        category,
        onboardingStep: OnboardingStep.BUSINESS_SETUP
      };

      businessRepo.findOne.mockResolvedValueOnce(existingBusiness);
      categoryRepo.findOne.mockResolvedValueOnce(category);
      businessRepo.save.mockResolvedValueOnce(updatedBusiness);

      const mockValidateAndGetBusiness = jest.spyOn(service as any, 'validateAndGetBusiness');
      mockValidateAndGetBusiness.mockResolvedValueOnce(existingBusiness);

      const mockToSimplifiedResponse = jest.spyOn(service as any, 'toSimplifiedResponse');
      const simplifiedBusinessData = {
        Business_id: businessId,
        name: updatedBusiness.name,
        phoneNumber: updatedBusiness.phoneNumber,
        onboardingStep: updatedBusiness.onboardingStep,
        business_status: 'ACTIVE',
        user_Id: ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: updatedBusiness.category
      };
      mockToSimplifiedResponse.mockReturnValueOnce(simplifiedBusinessData);
      
      const businessResponseDto = new BusinessResponseDto();
      businessResponseDto.statusCode = 200;
      businessResponseDto.message = 'Business updated successfully';
      businessResponseDto.data = simplifiedBusinessData;

      const result = await service.updateBusiness(businessId, ownerId, businessDto);

      expect(result.statusCode).toEqual(200);
      expect(result.data).toEqual(simplifiedBusinessData);
      expect(mockValidateAndGetBusiness).toHaveBeenCalledWith(businessId, ownerId);
      expect(businessRepo.save).toHaveBeenCalled();
    });

    it('should handle custom category creation', async () => {
      const businessId = 'test-id';
      const ownerId = 'owner-id';
      const businessDto: BusinessDto = {
        name: 'Updated Business',
        phoneNumber: '+2347012345678',
        categoryName: 'New Custom Category'
      };

      const existingBusiness = { 
        id: businessId, 
        ownerId,
        name: 'Old Name',
        phoneNumber: '+1234567890',
        onboardingStep: OnboardingStep.NOT_STARTED
      } as Business;

      const newCategory = {
        id: 'new-category-id',
        name: businessDto.categoryName,
        isCustom: true,
        ownerId,
        isActive: true
      } as Category;

      const updatedBusiness = {
        ...existingBusiness,
        ...businessDto,
        category: newCategory,
        onboardingStep: OnboardingStep.BUSINESS_SETUP
      };

      const mockValidateAndGetBusiness = jest.spyOn(service as any, 'validateAndGetBusiness');
      mockValidateAndGetBusiness.mockResolvedValueOnce(existingBusiness);

      categoryRepo.findOne.mockResolvedValueOnce(null);
      categoryRepo.save.mockResolvedValueOnce(newCategory);
      businessRepo.save.mockResolvedValueOnce(updatedBusiness);

      const mockToSimplifiedResponse = jest.spyOn(service as any, 'toSimplifiedResponse');
      const simplifiedBusinessData = {
        Business_id: businessId,
        name: updatedBusiness.name,
        phoneNumber: updatedBusiness.phoneNumber,
        onboardingStep: updatedBusiness.onboardingStep,
        business_status: 'ACTIVE',
        user_Id: ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: updatedBusiness.category
      };
      mockToSimplifiedResponse.mockReturnValueOnce(simplifiedBusinessData);

      const businessResponseDto = new BusinessResponseDto();
      businessResponseDto.statusCode = 200;
      businessResponseDto.message = 'Business updated successfully';
      businessResponseDto.data = simplifiedBusinessData;

      const result = await service.updateBusiness(businessId, ownerId, businessDto);

      expect(result.data).toEqual(simplifiedBusinessData);
    });

    it('should throw NotFoundException when business not found', async () => {
      const businessId = 'non-existent-id';
      const ownerId = 'owner-id';
      const businessDto: BusinessDto = {
        name: 'Updated Business',
        phoneNumber: '+2347012345678',
        categoryId: 'category-id'
      };

      const mockValidateAndGetBusiness = jest.spyOn(service as any, 'validateAndGetBusiness');
      mockValidateAndGetBusiness.mockRejectedValueOnce(new NotFoundException(`Business with ID ${businessId} not found`));

      await expect(
        service.updateBusiness(businessId, ownerId, businessDto)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when category not found', async () => {
      const businessId = 'test-id';
      const ownerId = 'owner-id';
      const businessDto: BusinessDto = {
        name: 'Updated Business',
        phoneNumber: '+2347012345678',
        categoryId: 'non-existent-category'
      };

      const existingBusiness = { 
        id: businessId, 
        ownerId,
        name: 'Old Name',
        phoneNumber: '+1234567890',
        onboardingStep: OnboardingStep.NOT_STARTED
      } as Business;

      const mockValidateAndGetBusiness = jest.spyOn(service as any, 'validateAndGetBusiness');
      mockValidateAndGetBusiness.mockResolvedValueOnce(existingBusiness);

      categoryRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateBusiness(businessId, ownerId, businessDto)
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle partial updates', async () => {
      const businessId = 'test-id';
      const ownerId = 'owner-id';
      const businessDto: BusinessDto = {
        name: 'Updated Name'
      };

      const existingBusiness = { 
        id: businessId, 
        ownerId,
        name: 'Old Name',
        phoneNumber: '+1234567890',
        onboardingStep: OnboardingStep.NOT_STARTED,
        category: { id: 'existing-category', name: 'Existing Category' }
      } as Business;

      const updatedBusiness = {
        ...existingBusiness,
        name: businessDto.name
      };

      const mockValidateAndGetBusiness = jest.spyOn(service as any, 'validateAndGetBusiness');
      mockValidateAndGetBusiness.mockResolvedValueOnce(existingBusiness);

      businessRepo.save.mockResolvedValueOnce(updatedBusiness);

      const mockToSimplifiedResponse = jest.spyOn(service as any, 'toSimplifiedResponse');
      const simplifiedBusinessData = {
        Business_id: businessId,
        name: updatedBusiness.name,
        phoneNumber: updatedBusiness.phoneNumber,
        onboardingStep: updatedBusiness.onboardingStep,
        business_status: 'ACTIVE',
        user_Id: ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: updatedBusiness.category
      };
      mockToSimplifiedResponse.mockReturnValueOnce(simplifiedBusinessData);

      const businessResponseDto = new BusinessResponseDto();
      businessResponseDto.statusCode = 200;
      businessResponseDto.message = 'Business updated successfully';
      businessResponseDto.data = simplifiedBusinessData;

      const result = await service.updateBusiness(businessId, ownerId, businessDto);

      expect(result.data).toEqual(simplifiedBusinessData);
    });
  });
}); 