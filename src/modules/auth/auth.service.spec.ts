import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/auth.entity';
import { UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let userRepository: Repository<User>;
  let redisService: RedisService;

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
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    redisService = module.get<RedisService>(RedisService);
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
      
      const result = await service.generateOtp(email);
      
      expect(result).toEqual({ message: 'OTP sent successfully.' });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(mockRedisClient.set).toHaveBeenCalled();
      
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
      
      expect(result).toEqual({ message: 'OTP sent successfully.' });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalled();
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
}); 