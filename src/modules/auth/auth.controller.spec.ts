import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AlchemyAAService } from '../../common/utils/alchemy';
import { MailService } from '../../common/utils/email';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    generateOtp: jest.fn(),
    verifyOtp: jest.fn()
  };

  const mockJwtService = {
    sign: jest.fn()
  };

  const mockAlchemyService = {
    createSmartWallet: jest.fn()
  };

  const mockMailService = {
    sendMail: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService
        },
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
          provide: MailService,
          useValue: mockMailService
        }
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestOtp', () => {
    it('should call authService.generateOtp with email', async () => {
      const email = 'test@example.com';
      const expectedResult = { message: 'OTP sent successfully.' };
      mockAuthService.generateOtp.mockResolvedValue(expectedResult);

      const result = await controller.requestOtp({ email });

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.generateOtp).toHaveBeenCalledWith(email);
    });
  });

  describe('verifyOtp', () => {
    it('should call authService.verifyOtp with email and otp', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const expectedResult = { message: 'Authentication successful', token: 'jwt-token' };
      mockAuthService.verifyOtp.mockResolvedValue(expectedResult);

      const result = await controller.verifyOtp({ email, otp });

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(email, otp);
    });
  });
});
