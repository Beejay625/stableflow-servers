import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/auth.entity';
import { UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../../common/utils/email';
import { Business, OnboardingStep } from '../business/entities/business.entity';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let userRepository: Repository<User>;
  let businessRepository: Repository<Business>;
  let redisService: RedisService;
  let mailService: MailService;

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('test-token'),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockBusinessRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  // Create a more realistic Redis mock
  const mockRedisClient = {
    set: jest.fn().mockImplementation(() => Promise.resolve('OK')),
    get: jest.fn(),
    del: jest.fn().mockImplementation(() => Promise.resolve(1)),
    quit: jest.fn().mockImplementation(() => Promise.resolve('OK')),
    connect: jest.fn().mockImplementation(() => Promise.resolve()),
    ping: jest.fn().mockImplementation(() => Promise.resolve('PONG')),
    on: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn().mockReturnValue(mockRedisClient),
    checkConnection: jest.fn().mockResolvedValue(true),
    get: jest.fn(),
    del: jest.fn()
  };

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };
  
  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Business),
          useValue: mockBusinessRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    businessRepository = module.get<Repository<Business>>(getRepositoryToken(Business));
    redisService = module.get<RedisService>(RedisService);
    mailService = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  
  describe('generateOtp', () => {
    it('should generate a 6-digit OTP for existing user', async () => {
      const email = 'test@example.com';
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      
      // Mock redisClient.set to resolve successfully
      mockRedisClient.set.mockResolvedValue('OK');
      
      // Mock mailService to resolve successfully
      mockMailService.sendMail.mockResolvedValue(true);
      
      await service.generateOtp(email);
      
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockMailService.sendMail).toHaveBeenCalled();
      
      // Verify Redis key format and expiration
      const redisSetCall = mockRedisClient.set.mock.calls[0];
      expect(redisSetCall[0]).toBe(`otp:${email}`);
      expect(redisSetCall[1]).toMatch(/^\d{6}$/);
      expect(redisSetCall[2]).toBe('EX');
      expect(redisSetCall[3]).toBe(15 * 60); // 15 minutes in seconds
    });
    
    it('should create a new user if not exists', async () => {
      const email = 'new@example.com';
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockImplementation(user => Promise.resolve(user));
      
      const result = await service.generateOtp(email);
      
      expect(result).toEqual({
        token: 'otp_requested',
        userId: 'pending_verification',
        email: email,
        role: 'pending',
        issuedAt: expect.any(Date),
        expiresAt: expect.any(Date)
      });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockMailService.sendMail).toHaveBeenCalled();
    });

    it('should handle email sending errors', async () => {
      const email = 'test@example.com';
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockMailService.sendMail.mockRejectedValue(new Error('Failed to send email'));
      
      const result = await service.generateOtp(email);
      
      expect(result).toEqual({
        token: 'otp_requested',
        userId: 'pending_verification',
        email: email,
        role: 'pending',
        issuedAt: expect.any(Date),
        expiresAt: expect.any(Date)
      });
      expect(mockMailService.sendMail).toHaveBeenCalled();
    });

    it('should handle Redis connection errors', async () => {
      const email = 'test@example.com';
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisClient.set.mockRejectedValue(new Error('Redis connection error'));
      
      await expect(service.generateOtp(email)).rejects.toThrow();
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockMailService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('should throw an error if user does not exist', async () => {
      const email = 'nonexistent@example.com';
      const otp = '123456';
      
      mockUserRepository.findOne.mockResolvedValue(null);
      
      await expect(service.verifyOtp(email, otp)).rejects.toThrow(UnauthorizedException);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email } });
    });
    
    it('should throw an error if OTP has expired or does not exist', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisClient.get.mockResolvedValue(null); // OTP not found in Redis
      
      await expect(service.verifyOtp(email, otp)).rejects.toThrow('OTP has expired or does not exist.');
      expect(mockRedisClient.get).toHaveBeenCalledWith(`otp:${email}`);
    });
    
    it('should throw an error if OTP is invalid', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const storedOtp = '654321'; // Different OTP
      
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisClient.get.mockResolvedValue(storedOtp);
      
      await expect(service.verifyOtp(email, otp)).rejects.toThrow('Invalid OTP.');
      expect(mockRedisClient.get).toHaveBeenCalledWith(`otp:${email}`);
    });
    
    it('should return a token if OTP is valid', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const userId = 'user-id-123';
      
      const mockUser = new User();
      mockUser.id = userId;
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisClient.get.mockResolvedValue(otp); // Same OTP in Redis
      
      const result = await service.verifyOtp(email, otp);
      
      expect(result).toEqual({
        message: 'Authentication successful',
        token: 'test-token',
        user: {
          id: userId,
          email
        }
      });
      
      expect(mockRedisClient.get).toHaveBeenCalledWith(`otp:${email}`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`otp:${email}`);
      expect(jwtService.sign).toHaveBeenCalledWith({ userId, email });
    });
  });

  describe('verifyOtpWithBusinessId', () => {
    // We don't need to mock the business repository here since it's already provided in the module
    
    beforeEach(() => {
      // Reset mocks for business repository
      jest.clearAllMocks();
      
      // Setup mock behaviors for Redis methods
      mockRedisService.get.mockImplementation((key) => mockRedisClient.get(key));
      mockRedisService.del.mockImplementation((key) => mockRedisClient.del(key));
    });
    
    it('should throw an error if user does not exist', async () => {
      const email = 'nonexistent@example.com';
      const otp = '123456';
      
      mockUserRepository.findOne.mockResolvedValue(null);
      
      await expect(service.verifyOtpWithBusinessId(email, otp)).rejects.toThrow(UnauthorizedException);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email } });
    });
    
    it('should throw an error if OTP has expired or does not exist', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisService.get.mockResolvedValue(null); // OTP not found in Redis
      
      await expect(service.verifyOtpWithBusinessId(email, otp)).rejects.toThrow('Invalid or expired OTP');
      expect(mockRedisService.get).toHaveBeenCalledWith(`otp:${email}`);
    });
    
    it('should throw an error if OTP is invalid', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const storedOtp = '654321'; // Different OTP
      
      const mockUser = new User();
      mockUser.email = email;
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisService.get.mockResolvedValue(storedOtp);
      
      await expect(service.verifyOtpWithBusinessId(email, otp)).rejects.toThrow('Invalid or expired OTP');
      expect(mockRedisService.get).toHaveBeenCalledWith(`otp:${email}`);
    });
    
    it('should return existing business ID if user already has a business', async () => {
      const email = 'existing@example.com';
      const otp = '123456';
      const userId = 'user-id-123';
      const businessId = 'business-id-123';
      
      const mockUser = new User();
      mockUser.id = userId;
      mockUser.email = email;
      
      const mockBusiness = {
        id: businessId,
        ownerId: userId,
        name: 'Existing Business',
        phoneNumber: '+1234567890'
      };
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisService.get.mockResolvedValue(otp);
      mockBusinessRepository.findOne.mockResolvedValue(mockBusiness);
      
      const result = await service.verifyOtpWithBusinessId(email, otp);
      
      expect(result).toEqual({
        token: 'test-token',
        userId: userId,
        email,
        role: 'user',
        issuedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        businessId
      });
      
      expect(mockRedisService.get).toHaveBeenCalledWith(`otp:${email}`);
      expect(mockRedisService.del).toHaveBeenCalledWith(`otp:${email}`);
      expect(jwtService.sign).toHaveBeenCalledWith({ userId, email, businessId });
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({ where: { ownerId: userId } });
      expect(mockBusinessRepository.create).not.toHaveBeenCalled();
      expect(mockBusinessRepository.save).not.toHaveBeenCalled();
    });
    
    it('should create a new business and return its ID if user has no business', async () => {
      const email = 'new@example.com';
      const otp = '123456';
      const userId = 'user-id-456';
      const newBusinessId = 'business-id-new';
      
      const mockUser = new User();
      mockUser.id = userId;
      mockUser.email = email;
      
      const newBusiness = {
        id: newBusinessId,
        ownerId: userId,
        name: `${email.split('@')[0]}'s Business`,
        phoneNumber: '0000000000',
        onboardingStep: OnboardingStep.NOT_STARTED,
        isActive: true,
        isVerified: false
      };
      
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisService.get.mockResolvedValue(otp);
      mockBusinessRepository.findOne.mockResolvedValue(null); // No existing business
      mockBusinessRepository.create.mockReturnValue(newBusiness);
      mockBusinessRepository.save.mockResolvedValue(newBusiness);
      
      const result = await service.verifyOtpWithBusinessId(email, otp);
      
      expect(result).toEqual({
        token: 'test-token',
        userId: userId,
        email,
        role: 'user',
        issuedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        businessId: newBusinessId
      });
      
      expect(mockRedisService.get).toHaveBeenCalledWith(`otp:${email}`);
      expect(mockRedisService.del).toHaveBeenCalledWith(`otp:${email}`);
      expect(jwtService.sign).toHaveBeenCalledWith({ userId, email, businessId: newBusinessId });
      expect(mockBusinessRepository.findOne).toHaveBeenCalledWith({ where: { ownerId: userId } });
      expect(mockBusinessRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        ownerId: userId,
        name: `${email.split('@')[0]}'s Business`,
        phoneNumber: '0000000000',
        onboardingStep: OnboardingStep.NOT_STARTED,
        isActive: true,
        isVerified: false
      }));
      expect(mockBusinessRepository.save).toHaveBeenCalledWith(newBusiness);
    });
  });
}); 