import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../entities/auth.entity';
import { Business } from '../../business/entities/business.entity';
import { RedisService } from '../../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../../common/utils';

describe('AuthService - Delete User', () => {
  let authService: AuthService;
  
  // Mock repositories
  const mockUserRepository = {
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  
  const mockBusinessRepository = {
    find: jest.fn(),
    delete: jest.fn(),
  };
  
  // Mock services
  const mockRedisService = {
    getClient: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };
  
  const mockJwtService = {
    sign: jest.fn(),
  };
  
  const mockConfigService = {
    get: jest.fn(),
  };
  
  const mockMailService = {
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Business), useValue: mockBusinessRepository },
        { provide: RedisService, useValue: mockRedisService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should delete a user and their businesses', async () => {
    // Arrange
    const userId = 'test-user-id';
    const user = {
      id: userId,
      email: 'test@example.com',
      walletAddress: '0x123456789',
      encryptedMnemonic: 'encrypted-data',
    };
    
    const businesses = [
      {
        id: 'business-1',
        name: 'Business 1',
        ownerId: userId,
        walletAddress: '0xABCDEF123',
        walletId: 'wallet-id-1',
      },
      {
        id: 'business-2',
        name: 'Business 2',
        ownerId: userId,
        walletAddress: null,
        walletId: null,
      },
    ];
    
    // Mock repository responses
    mockUserRepository.findOne.mockResolvedValue(user);
    mockBusinessRepository.find.mockResolvedValue(businesses);
    mockUserRepository.delete.mockResolvedValue({ affected: 1 });
    mockBusinessRepository.delete.mockResolvedValue({ affected: 1 });
    
    // Act
    const result = await authService.deleteUserAndData(userId);
    
    // Assert
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
    expect(mockBusinessRepository.find).toHaveBeenCalledWith({ where: { ownerId: userId } });
    expect(mockBusinessRepository.delete).toHaveBeenCalledTimes(2);
    expect(mockBusinessRepository.delete).toHaveBeenCalledWith({ id: 'business-1' });
    expect(mockBusinessRepository.delete).toHaveBeenCalledWith({ id: 'business-2' });
    expect(mockUserRepository.delete).toHaveBeenCalledWith({ id: userId });
    
    expect(result).toEqual({
      success: true,
      deletedBusinessesCount: 2,
      message: `User ${userId} and 2 associated businesses have been deleted`,
    });
  });

  it('should throw NotFoundException if user not found', async () => {
    // Arrange
    const userId = 'non-existent-user';
    mockUserRepository.findOne.mockResolvedValue(null);
    
    // Act & Assert
    await expect(authService.deleteUserAndData(userId)).rejects.toThrow(NotFoundException);
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
    expect(mockBusinessRepository.find).not.toHaveBeenCalled();
    expect(mockUserRepository.delete).not.toHaveBeenCalled();
  });
}); 