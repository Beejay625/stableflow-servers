import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./entities/auth.entity";
import { RedisService } from "../redis/redis.service";
import { MailService, normalizeEmail } from "../../common/utils";
import { otpEmailTemplate } from "../../common/utils/email-templates";
import { Business, OnboardingStep } from "../business/entities/business.entity";
import {
  AuthResponseDto,
  BusinessAuthResponseDto,
  TokenRefreshResponseDto,
} from "./dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly mailService: MailService,
  ) {}

  async generateOtp(email: string): Promise<AuthResponseDto> {
    // Normalize email to lowercase to ensure case-insensitivity
    const normalizedEmail = normalizeEmail(email);

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set OTP expiration (15 minutes)
    const expirationInSeconds = 15 * 60; // 15 minutes

    // Find or create user
    let user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Create new user if not exists
      user = this.userRepository.create({
        email: normalizedEmail,
        isActive: true,
      });
    }

    // Save the user in all cases to update last login time or any other property
    await this.userRepository.save(user);

    // Store OTP in Redis instead of the database
    const redisClient = this.redisService.getClient();
    const redisKey = `otp:${normalizedEmail}`;

    // Store OTP in Redis with expiration using ioredis syntax
    await redisClient.set(redisKey, otp, "EX", expirationInSeconds);

    // For debugging purposes
    console.log(`OTP for ${normalizedEmail}: ${otp}`);

    // Use the email template from our templates file
    const html = otpEmailTemplate(otp);

    try {
      // Send OTP via email
      await this.mailService.sendMail(
        normalizedEmail,
        "Your StableFlow Verification Code",
        { html },
      );

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

      // Return success message
      return {
        accessToken: "otp_requested", // Use placeholder for accessToken instead of token
        userId: "pending_verification",
        email: normalizedEmail,
        role: "pending",
        issuedAt: new Date(),
        expiresAt,
      };
    } catch (error) {
      console.error("Failed to send OTP email:", error);

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

      // Still return success even if email fails, since we logged the OTP
      return {
        accessToken: "otp_requested", // Use placeholder for accessToken instead of token
        userId: "pending_verification",
        email: normalizedEmail,
        role: "pending",
        issuedAt: new Date(),
        expiresAt,
      };
    }
  }

  async verifyOtp(email: string, otp: string) {
    // Normalize email to lowercase to ensure case-insensitivity
    const normalizedEmail = normalizeEmail(email);

    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException("Authentication failed.");
    }

    // Get OTP from Redis
    const redisClient = this.redisService.getClient();
    const redisKey = `otp:${normalizedEmail}`;
    const storedOtp = await redisClient.get(redisKey);

    if (!storedOtp) {
      throw new UnauthorizedException("OTP has expired or does not exist.");
    }

    // Verify OTP
    if (otp !== storedOtp) {
      throw new UnauthorizedException("Invalid OTP.");
    }

    // Delete OTP from Redis after successful verification
    await redisClient.del(redisKey);

    // Generate token
    const token = this.jwtService.sign({ userId: user.id, email: user.email });

    return {
      message: "Authentication successful",
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async verifyOtpWithBusinessId(
    email: string,
    otp: string,
  ): Promise<BusinessAuthResponseDto> {
    // Normalize email to lowercase to ensure case-insensitivity
    const normalizedEmail = normalizeEmail(email);

    this.logger.log(`Verifying OTP for ${normalizedEmail}`);

    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      this.logger.warn(
        `Authentication failed: User with email ${normalizedEmail} not found`,
      );
      throw new UnauthorizedException("Invalid credentials");
    }

    this.logger.log(`User found: ${user.id}`);

    // Verify OTP
    const storedOtp = await this.redisService.get(`otp:${normalizedEmail}`);

    if (!storedOtp || storedOtp !== otp) {
      this.logger.warn(
        `Authentication failed: Invalid or expired OTP for ${normalizedEmail}`,
      );
      throw new UnauthorizedException("Invalid or expired OTP");
    }

    this.logger.log(`OTP verified successfully for ${normalizedEmail}`);

    // Delete OTP after successful verification
    await this.redisService.del(`otp:${normalizedEmail}`);

    // Find business associated with user
    let business = await this.businessRepository.findOne({
      where: { ownerId: user.id },
    });
    this.logger.log(
      `Business lookup result: ${JSON.stringify(business || "null")}`,
    );

    let businessId = "";

    // If no business exists, create a new one for the user
    if (!business) {
      this.logger.log(
        `No business found for user ${user.id}, creating new business...`,
      );
      try {
        // Create a new business entity
        const newBusiness = this.businessRepository.create({
          name: `${normalizedEmail.split("@")[0]}'s Business`, // Default name based on email
          phoneNumber: "0000000000", // Placeholder, will be updated during onboarding
          ownerId: user.id,
          onboardingStep: OnboardingStep.NOT_STARTED,
          isActive: true,
          isVerified: false,
        });

        // Save the new business
        business = await this.businessRepository.save(newBusiness);

        if (!business || !business.id) {
          throw new Error("Failed to create business entity");
        }

        businessId = business.id;
        this.logger.log(
          `Created new business with ID ${businessId} for user ${user.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Error creating business for user ${user.id}: ${error.message}`,
        );
        // Create a temporary business ID as fallback
        businessId = `temp-${Date.now()}`;
        this.logger.log(`Created temporary business ID: ${businessId}`);
      }
    } else {
      businessId = business.id;
      this.logger.log(
        `Found existing business with ID ${businessId} for user ${user.id}`,
      );
    }

    // Calculate token expiration time
    const expiresIn = parseInt(
      this.configService.get("JWT_EXPIRATION_SECONDS") || "86400",
      10,
    );
    const expirationDate = new Date();
    expirationDate.setSeconds(expirationDate.getSeconds() + expiresIn);

    // Generate JWT access token
    const accessToken = this.jwtService.sign(
      {
        userId: user.id,
        email: user.email,
        businessId,
      },
      {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: `${expiresIn}s`,
      },
    );

    // Generate refresh token with longer expiration
    const refreshExpiresIn = parseInt(
      this.configService.get("JWT_REFRESH_EXPIRATION_SECONDS") || "604800",
      10,
    ); // Default 7 days
    const refreshToken = this.jwtService.sign(
      {
        userId: user.id,
        email: user.email,
        businessId,
      },
      {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
        expiresIn: `${refreshExpiresIn}s`,
      },
    );

    // Create and return the authentication response
    const response: BusinessAuthResponseDto = {
      accessToken,
      refreshToken,
      expiresIn,
      userId: user.id,
      email: user.email,
      role: "user", // Default role
      businessId,
      issuedAt: new Date(),
      expiresAt: expirationDate,
    };

    return response;
  }

  /**
   * Refreshes an authentication token using a valid refresh token
   * @param refreshToken The refresh token to validate
   * @param accessToken The expired access token
   * @returns A new access token and optionally a new refresh token
   */
  async refreshToken(
    refreshToken: string,
    accessToken: string,
  ): Promise<TokenRefreshResponseDto> {
    this.logger.log("Processing token refresh request");

    try {
      // First, try to decode the access token (without verifying expiration)
      let accessPayload;
      try {
        accessPayload = this.jwtService.decode(accessToken);
        if (!accessPayload || typeof accessPayload !== "object") {
          throw new Error("Invalid access token format");
        }
      } catch (error) {
        this.logger.warn(`Invalid access token format: ${error.message}`);
        throw new UnauthorizedException("Invalid access token format");
      }

      const { userId: accessUserId, email: accessEmail } = accessPayload;

      if (!accessUserId || !accessEmail) {
        this.logger.warn(
          "Invalid access token payload: missing userId or email",
        );
        throw new UnauthorizedException("Invalid access token");
      }

      // Verify the refresh token
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
      });

      // Get user information from the refresh token
      const { userId, email, businessId } = decoded;

      if (!userId || !email) {
        this.logger.warn(
          "Invalid refresh token payload: missing userId or email",
        );
        throw new UnauthorizedException("Invalid refresh token");
      }

      // Verify that the user IDs and emails match between both tokens
      if (userId !== accessUserId || email !== accessEmail) {
        this.logger.warn(
          `Token mismatch: refresh token user (${userId}, ${email}) doesn't match access token user (${accessUserId}, ${accessEmail})`,
        );
        throw new UnauthorizedException("Token mismatch");
      }

      // Check if the user exists
      const user = await this.userRepository.findOne({
        where: { id: userId, email },
      });

      if (!user) {
        this.logger.warn(`User not found for token: ${userId}, ${email}`);
        throw new UnauthorizedException("User not found");
      }

      if (!user.isActive) {
        this.logger.warn(`Inactive user tried to refresh token: ${userId}`);
        throw new UnauthorizedException("User is inactive");
      }

      // Generate a new access token
      const newAccessToken = this.jwtService.sign(
        {
          userId,
          email,
          businessId,
        },
        {
          secret: this.configService.get("JWT_SECRET"),
          expiresIn: this.configService.get("JWT_EXPIRATION") || "24h",
        },
      );

      // Optionally generate a new refresh token (token rotation)
      // This is a security best practice to limit damage from leaked refresh tokens
      const shouldRotateToken =
        this.configService.get("JWT_REFRESH_ROTATION") === "true";
      let newRefreshToken = null;

      if (shouldRotateToken) {
        newRefreshToken = this.jwtService.sign(
          {
            userId,
            email,
            businessId,
          },
          {
            secret: this.configService.get("JWT_REFRESH_SECRET"),
            expiresIn: this.configService.get("JWT_REFRESH_EXPIRATION") || "7d",
          },
        );
      }

      const expiresIn = parseInt(
        this.configService.get("JWT_EXPIRATION_SECONDS") || "86400",
        10,
      );

      const response: TokenRefreshResponseDto = {
        status: "success",
        accessToken: newAccessToken,
        expiresIn,
        businessId,
      };

      // Include refresh token if we're rotating tokens
      if (newRefreshToken) {
        response.refreshToken = newRefreshToken;
      }

      this.logger.log(`Token refreshed successfully for user ${userId}`);
      return response;
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`);
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
