import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Business, OnboardingStep } from '../business/entities/business.entity';
import { User } from '../auth/entities/auth.entity';
import { of, throwError } from 'rxjs';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';

describe('WalletService', () => {
  let service: WalletService;
  let httpService: HttpService;
  let configService: ConfigService;
  let businessRepository: any;
  let userRepository: any;

  // Mock response from the BlockRadar API
  const mockWalletResponse = {
    data: {
      message: "Address generated successfully",
      statusCode: 200,
      data: {
        address: "0xf5f2817A086e747a7c45429993338070Af8f3A81",
        name: "Test_Business_123",
        type: "INTERNAL",
        derivationPath: "m/44'/60'/0'/0/1",
        metadata: {
          business_id: "123",
          user_id: "456"
        },
        configurations: {
          aml: {
            provider: "ofac, fbi, tether, circle",
            status: "success",
            message: "Address is not sanctioned"
          },
          showPrivateKey: false,
          disableAutoSweep: false,
          enableGaslessWithdraw: false
        },
        network: "testnet",
        blockchain: {
          id: "0d52d4f1-e9e7-43ca-a6db-0ace74c34da0",
          name: "BNB smart chain",
          symbol: "bnb",
          slug: "bnb-smart-chain",
          derivationPath: "m/44'/60'/0'/0",
          isEvmCompatible: true,
          isL2: false,
          isActive: true,
          tokenStandard: "BEP20",
          createdAt: "2023-04-28T14:44:06.397Z",
          updatedAt: "2024-11-26T15:26:19.665Z",
          logoUrl: "https://res.cloudinary.com/blockradar/image/upload/v1716800080/crypto-assets/bnb-bnb-logo_e4qdyk.png"
        },
        id: "e70f2dfc-1827-4b34-b037-e63ae27a2d9b",
        isActive: true,
        createdAt: "2025-03-18T13:17:29.481Z",
        updatedAt: "2025-03-18T13:17:29.481Z"
      }
    }
  };

  const mockWalletId = 'wallet-id-123';
  const mockApiKey = 'test-api-key';

  const mockBusinessRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'blockradar.apiKey') return mockApiKey;
      if (key === 'WALLET_ID' || key === 'BLOCKRADAR_API_KEY' || key === 'blockradar.walletId') return mockWalletId;
      return null;
    }),
  };

  const mockHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(Business), useValue: mockBusinessRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
    businessRepository = module.get(getRepositoryToken(Business));
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isBusinessReadyForWallet', () => {
    const businessId = '123';

    it('should return true when business is ready for wallet generation', async () => {
      // Arrange
      const mockBusiness = {
        id: businessId,
        onboardingStep: OnboardingStep.COMPLETED,
        walletAddress: null,
      };
      businessRepository.findOne.mockResolvedValue(mockBusiness);

      // Act
      const result = await service.isBusinessReadyForWallet(businessId);

      // Assert
      expect(result).toBe(true);
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
    });

    it('should return false when business onboarding is not completed', async () => {
      // Arrange
      const mockBusiness = {
        id: businessId,
        onboardingStep: OnboardingStep.ACCOUNT_SETUP,
        walletAddress: null,
      };
      businessRepository.findOne.mockResolvedValue(mockBusiness);

      // Act
      const result = await service.isBusinessReadyForWallet(businessId);

      // Assert
      expect(result).toBe(false);
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
    });

    it('should return false when business already has a wallet address', async () => {
      // Arrange
      const mockBusiness = {
        id: businessId,
        onboardingStep: OnboardingStep.COMPLETED,
        walletAddress: '0x123456789',
      };
      businessRepository.findOne.mockResolvedValue(mockBusiness);

      // Act
      const result = await service.isBusinessReadyForWallet(businessId);

      // Assert
      expect(result).toBe(false);
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
    });

    it('should throw NotFoundException when business is not found', async () => {
      // Arrange
      businessRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.isBusinessReadyForWallet(businessId)).rejects.toThrow(
        NotFoundException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
    });
  });

  describe('generateWalletForCompletedBusiness', () => {
    const businessId = '123';
    const userId = '456';

    it('should generate wallet for a business that has completed onboarding', async () => {
      // Arrange
      const mockBusiness = {
        id: businessId,
        name: 'Test Business',
        onboardingStep: OnboardingStep.COMPLETED,
        walletAddress: null,
        ownerId: userId,
      };
      const mockUser = {
        id: userId,
        email: 'test@example.com',
      };

      businessRepository.findOne.mockResolvedValue(mockBusiness);
      userRepository.findOne.mockResolvedValue(mockUser);
      mockHttpService.post.mockReturnValue(of(mockWalletResponse));
      businessRepository.update.mockResolvedValue({ affected: 1 });

      // Mock the generateWalletAddress method to return the expected response
      jest.spyOn(service, 'generateWalletAddress').mockResolvedValue(mockWalletResponse.data);

      // Act
      const result = await service.generateWalletForCompletedBusiness(businessId);

      // Assert
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(service.generateWalletAddress).toHaveBeenCalledWith(businessId, userId);
      expect(result).toEqual(mockWalletResponse.data);
    });

    it('should throw error when business onboarding is not completed', async () => {
      // Arrange
      const mockBusiness = {
        id: businessId,
        name: 'Test Business',
        onboardingStep: OnboardingStep.ACCOUNT_SETUP,
        walletAddress: null,
        ownerId: userId,
      };

      businessRepository.findOne.mockResolvedValue(mockBusiness);
      // Properly mock the generateWalletAddress method
      const generateWalletAddressSpy = jest.spyOn(service, 'generateWalletAddress');

      // Act & Assert
      await expect(service.generateWalletForCompletedBusiness(businessId)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(generateWalletAddressSpy).not.toHaveBeenCalled();
    });

    it('should throw error when business already has a wallet address', async () => {
      // Arrange
      const mockBusiness = {
        id: businessId,
        name: 'Test Business',
        onboardingStep: OnboardingStep.COMPLETED,
        walletAddress: '0x123456789',
        ownerId: userId,
      };

      businessRepository.findOne.mockResolvedValue(mockBusiness);
      // Properly mock the generateWalletAddress method
      const generateWalletAddressSpy = jest.spyOn(service, 'generateWalletAddress');

      // Act & Assert
      await expect(service.generateWalletForCompletedBusiness(businessId)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(generateWalletAddressSpy).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when business is not found', async () => {
      // Arrange
      businessRepository.findOne.mockResolvedValue(null);
      // Properly mock the generateWalletAddress method
      const generateWalletAddressSpy = jest.spyOn(service, 'generateWalletAddress');

      // Act & Assert
      await expect(service.generateWalletForCompletedBusiness(businessId)).rejects.toThrow(
        NotFoundException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(generateWalletAddressSpy).not.toHaveBeenCalled();
    });
  });

  describe('generateWalletAddress', () => {
    const businessId = '123';
    const userId = '456';
    const mockBusiness = {
      id: businessId,
      name: 'Test Business',
    };
    const mockUser = {
      id: userId,
      email: 'test@example.com',
    };

    it('should generate a wallet address and save it to business', async () => {
      // Arrange
      businessRepository.findOne.mockResolvedValue(mockBusiness);
      userRepository.findOne.mockResolvedValue(mockUser);
      mockHttpService.post.mockReturnValue(of(mockWalletResponse));
      businessRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.generateWalletAddress(businessId, userId);

      // Assert
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `https://api.blockradar.co/v1/wallets/${mockWalletId}/addresses`,
        {
          disableAutoSweep: false,
          enableGaslessWithdraw: false,
          metadata: {
            business_id: businessId,
            user_id: userId,
          },
          name: `Test_Business_${businessId}`,
          showPrivateKey: false,
        },
        {
          headers: {
            'x-api-key': mockApiKey,
            'Content-Type': 'application/json',
          },
        }
      );
      
      // Check that business was updated with wallet address and ID
      expect(businessRepository.update).toHaveBeenCalledWith(
        { id: businessId },
        { 
          walletAddress: "0xf5f2817A086e747a7c45429993338070Af8f3A81",
          addressId: "e70f2dfc-1827-4b34-b037-e63ae27a2d9b",
        }
      );
      
      expect(result).toEqual(mockWalletResponse.data);
    });

    it('should throw NotFoundException when business is not found', async () => {
      // Arrange
      businessRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.generateWalletAddress(businessId, userId)).rejects.toThrow(
        NotFoundException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(businessRepository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user is not found', async () => {
      // Arrange
      businessRepository.findOne.mockResolvedValue(mockBusiness);
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.generateWalletAddress(businessId, userId)).rejects.toThrow(
        NotFoundException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(businessRepository.update).not.toHaveBeenCalled();
    });

    it('should handle API errors properly', async () => {
      // Arrange
      businessRepository.findOne.mockResolvedValue(mockBusiness);
      userRepository.findOne.mockResolvedValue(mockUser);
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('API Error'))
      );

      // Act & Assert
      await expect(service.generateWalletAddress(businessId, userId)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockHttpService.post).toHaveBeenCalled();
      expect(businessRepository.update).not.toHaveBeenCalled();
    });
    
    it('should handle errors when saving wallet address to business', async () => {
      // Arrange
      businessRepository.findOne.mockResolvedValue(mockBusiness);
      userRepository.findOne.mockResolvedValue(mockUser);
      mockHttpService.post.mockReturnValue(of(mockWalletResponse));
      businessRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.generateWalletAddress(businessId, userId)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(businessRepository.findOne).toHaveBeenCalledWith({
        where: { id: businessId },
      });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockHttpService.post).toHaveBeenCalled();
      expect(businessRepository.update).toHaveBeenCalled();
    });
  });
}); 