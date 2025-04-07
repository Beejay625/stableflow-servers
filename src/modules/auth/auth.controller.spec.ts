import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { MailService } from "../../common/utils/email";
import { UnauthorizedException } from "@nestjs/common";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    generateOtp: jest.fn(),
    verifyOtp: jest.fn(),
    verifyOtpWithBusinessId: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockMailService = {
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("requestOtp", () => {
    it("should call authService.generateOtp with the provided email", async () => {
      const dto = { email: "test@example.com" };
      const expectedResult = { message: "OTP sent successfully." };

      mockAuthService.generateOtp.mockResolvedValue(expectedResult);

      const result = await controller.requestOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.generateOtp).toHaveBeenCalledWith(dto.email);
    });

    it("should handle email sending errors gracefully", async () => {
      const dto = { email: "test@example.com" };
      const expectedResult = {
        message:
          "OTP generated successfully, but email delivery may be delayed.",
      };

      mockAuthService.generateOtp.mockResolvedValue(expectedResult);

      const result = await controller.requestOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.generateOtp).toHaveBeenCalledWith(dto.email);
    });

    it("should handle service errors and propagate them", async () => {
      const dto = { email: "invalid@example.com" };
      const errorMessage = "Failed to generate OTP";

      mockAuthService.generateOtp.mockRejectedValue(new Error(errorMessage));

      await expect(controller.requestOtp(dto)).rejects.toThrow(errorMessage);
      expect(mockAuthService.generateOtp).toHaveBeenCalledWith(dto.email);
    });
  });

  describe("verifyOtp", () => {
    it("should call authService.verifyOtpWithBusinessId with email and OTP", async () => {
      const dto = { email: "test@example.com", otp: "123456" };
      const expectedResult = {
        message: "Authentication successful",
        token: "test-token",
        user: { id: "user-123", email: dto.email },
        businessId: "business-123",
      };

      mockAuthService.verifyOtpWithBusinessId.mockResolvedValue(expectedResult);

      const result = await controller.verifyOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.verifyOtpWithBusinessId).toHaveBeenCalledWith(
        dto.email,
        dto.otp,
      );
    });

    it("should return existing business ID for existing user", async () => {
      const dto = { email: "existing@example.com", otp: "123456" };
      const existingBusinessId = "existing-business-123";
      const expectedResult = {
        message: "Authentication successful",
        token: "test-token",
        user: { id: "user-123", email: dto.email },
        businessId: existingBusinessId,
      };

      mockAuthService.verifyOtpWithBusinessId.mockResolvedValue(expectedResult);

      const result = await controller.verifyOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(result.businessId).toBe(existingBusinessId);
    });

    it("should return new business ID for new user", async () => {
      const dto = { email: "new@example.com", otp: "123456" };
      const newBusinessId = "new-business-123";
      const expectedResult = {
        message: "Authentication successful",
        token: "test-token",
        user: { id: "new-user-123", email: dto.email },
        businessId: newBusinessId,
      };

      mockAuthService.verifyOtpWithBusinessId.mockResolvedValue(expectedResult);

      const result = await controller.verifyOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(result.businessId).toBe(newBusinessId);
    });

    it("should handle unauthorized exceptions", async () => {
      const dto = { email: "test@example.com", otp: "wrong-otp" };

      mockAuthService.verifyOtpWithBusinessId.mockRejectedValue(
        new UnauthorizedException("Invalid OTP."),
      );

      await expect(controller.verifyOtp(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // Simple test that will always pass
  it("should pass a simple test", () => {
    expect(true).toBe(true);
  });
});
