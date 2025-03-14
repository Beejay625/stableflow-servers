import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AlchemyAAService } from '../../common/utils/alchemy';
import { UnauthorizedException } from '@nestjs/common';
import { EncryptionService } from '../../common/utils/encryption.service';

describe('AuthService', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let alchemyService: AlchemyAAService;

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token')
  };

  const mockAlchemyService = {
    encryptData: jest.fn(),
    decryptData: jest.fn()
  };

  const mockEncryptionService = {
    encrypt: jest.fn(),
    decrypt: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        },
        {
          provide: AlchemyAAService,
          useValue: mockAlchemyService
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService
        }
      ]
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    alchemyService = module.get<AlchemyAAService>(AlchemyAAService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('generateOtp', () => {
    it('should generate and store OTP for the provided email', async () => {
      const email = 'test@example.com';
      const result = await authService.generateOtp(email);
      
      expect(result).toEqual({ message: 'OTP sent successfully.' });
      // Verify OTP is stored by testing the verifyOtp method
      const storedOtp = (authService as any).otpStore.get(email);
      expect(storedOtp).toBeDefined();
      expect(storedOtp.otp).toHaveLength(6);
      expect(storedOtp.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('verifyOtp', () => {
    it('should verify valid OTP and return token', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      
      // Manually set OTP for testing
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);
      (authService as any).otpStore.set(email, { otp, expiresAt });
      
      const result = await authService.verifyOtp(email, otp);
      
      expect(result).toEqual({
        message: 'Authentication successful',
        token: 'mock-token',
        user: { email }
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({ email });
      
      // Verify OTP is deleted after successful verification
      expect((authService as any).otpStore.has(email)).toBe(false);
    });
    
    it('should throw UnauthorizedException if OTP is not found', async () => {
      await expect(authService.verifyOtp('nonexistent@example.com', '123456'))
        .rejects.toThrow(new UnauthorizedException('Authentication failed.'));
    });
    
    it('should throw UnauthorizedException if OTP is expired', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      
      // Set expired OTP
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() - 1); // 1 minute in the past
      (authService as any).otpStore.set(email, { otp, expiresAt });
      
      await expect(authService.verifyOtp(email, otp))
        .rejects.toThrow(new UnauthorizedException('Authentication failed.'));
      
      // Verify expired OTP is deleted
      expect((authService as any).otpStore.has(email)).toBe(false);
    });
    
    it('should throw UnauthorizedException if OTP is incorrect', async () => {
      const email = 'test@example.com';
      const correctOtp = '123456';
      const wrongOtp = '654321';
      
      // Set valid OTP
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);
      (authService as any).otpStore.set(email, { otp: correctOtp, expiresAt });
      
      await expect(authService.verifyOtp(email, wrongOtp))
        .rejects.toThrow(new UnauthorizedException('Authentication failed.'));
      
      // OTP should still exist after failed verification
      expect((authService as any).otpStore.has(email)).toBe(true);
    });
  });
}); 