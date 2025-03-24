import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/auth.entity';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../../common/utils';
import { otpEmailTemplate } from '../../common/utils/email-templates';
import { Business, OnboardingStep } from '../business/entities/business.entity';
import { AuthResponseDto, BusinessAuthResponseDto } from './dto';

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
    private readonly mailService: MailService
  ) {}

  async generateOtp(email: string): Promise<AuthResponseDto> {
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set OTP expiration (15 minutes)
    const expirationInSeconds = 15 * 60; // 15 minutes
    
    // Find or create user
    let user = await this.userRepository.findOne({ where: { email } });
    
    if (!user) {
      // Create new user if not exists
      user = this.userRepository.create({
        email,
        isActive: true
      });
    }
    
    // Save the user in all cases to update last login time or any other property
    await this.userRepository.save(user);
    
    // Store OTP in Redis instead of the database
    const redisClient = this.redisService.getClient();
    const redisKey = `otp:${email}`;
    
    // Store OTP in Redis with expiration using ioredis syntax
    await redisClient.set(redisKey, otp, 'EX', expirationInSeconds);
    
    // For debugging purposes
    console.log(`OTP for ${email}: ${otp}`);
    
    // Use the email template from our templates file
    const html = otpEmailTemplate(otp);
    
    try {
      // Send OTP via email
      await this.mailService.sendMail(
        email,
        'Your StableFlow Verification Code',
        { html }
      );
      
      // Return success message
      return {
        token: 'otp_requested',
        userId: 'pending_verification',
        email: email,
        role: 'pending',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
      };
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      // Still return success even if email fails, since we logged the OTP
      return {
        token: 'otp_requested',
        userId: 'pending_verification',
        email: email,
        role: 'pending',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
      };
    }
  }

  async verifyOtp(email: string, otp: string) {
    // Find user by email
    const user = await this.userRepository.findOne({ where: { email } });
    
    if (!user) {
      throw new UnauthorizedException('Authentication failed.');
    }
    
    // Get OTP from Redis
    const redisClient = this.redisService.getClient();
    const redisKey = `otp:${email}`;
    const storedOtp = await redisClient.get(redisKey);
    
    if (!storedOtp) {
      throw new UnauthorizedException('OTP has expired or does not exist.');
    }
    
    // Verify OTP
    if (otp !== storedOtp) {
      throw new UnauthorizedException('Invalid OTP.');
    }
    
    // Delete OTP from Redis after successful verification
    await redisClient.del(redisKey);
    
    // Generate token
    const token = this.jwtService.sign({ userId: user.id, email: user.email });
    
    return { 
      message: 'Authentication successful', 
      token, 
      user: { 
        id: user.id,
        email: user.email 
      } 
    };
  }

  async verifyOtpWithBusinessId(email: string, otp: string): Promise<BusinessAuthResponseDto> {
    this.logger.log(`Verifying OTP for ${email}`);
    
    // Find user by email
    const user = await this.userRepository.findOne({ where: { email } });
    
    if (!user) {
      this.logger.warn(`Authentication failed: User with email ${email} not found`);
      throw new UnauthorizedException('Invalid credentials');
    }
    
    this.logger.log(`User found: ${user.id}`);
    
    // Verify OTP
    const storedOtp = await this.redisService.get(`otp:${email}`);
    
    if (!storedOtp || storedOtp !== otp) {
      this.logger.warn(`Authentication failed: Invalid or expired OTP for ${email}`);
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    
    this.logger.log(`OTP verified successfully for ${email}`);
    
    // Delete OTP after successful verification
    await this.redisService.del(`otp:${email}`);
    
    // Find business associated with user
    let business = await this.businessRepository.findOne({ where: { ownerId: user.id } });
    this.logger.log(`Business lookup result: ${JSON.stringify(business || 'null')}`);
    
    let businessId = '';
    
    // If no business exists, create a new one for the user
    if (!business) {
      this.logger.log(`No business found for user ${user.id}, creating new business...`);
      try {
        // Create a new business entity
        const newBusiness = this.businessRepository.create({
          name: `${user.email.split('@')[0]}'s Business`, // Default name based on email
          phoneNumber: '0000000000', // Placeholder, will be updated during onboarding
          ownerId: user.id,
          onboardingStep: OnboardingStep.NOT_STARTED,
          isActive: true,
          isVerified: false
        });
        
        // Save the new business
        business = await this.businessRepository.save(newBusiness);
        
        if (!business || !business.id) {
          throw new Error('Failed to create business entity');
        }
        
        businessId = business.id;
        this.logger.log(`Created new business with ID ${businessId} for user ${user.id}`);
      } catch (error) {
        this.logger.error(`Error creating business for user ${user.id}: ${error.message}`);
        // Create a temporary business ID as fallback
        businessId = `temp-${Date.now()}`;
        this.logger.log(`Created temporary business ID: ${businessId}`);
      }
    } else {
      businessId = business.id;
      this.logger.log(`Found existing business ID ${businessId} for user ${user.id}`);
    }
    
    // Double-check the business ID
    if (!businessId) {
      this.logger.warn(`Business ID is still empty after processing. Generating temporary ID.`);
      businessId = `temp-${Date.now()}`;
    }
    
    // Generate token with business ID included
    const token = this.jwtService.sign({ 
      userId: user.id, 
      email: user.email,
      businessId: businessId
    });
    
    // Calculate token expiration (24 hours from now)
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    
    const response: BusinessAuthResponseDto = { 
      token,
      userId: user.id,
      email: user.email,
      role: 'user',
      issuedAt,
      expiresAt,
      businessId: businessId
    };
    
    this.logger.log(`Authentication successful for ${email} with business ID: ${businessId}`);
    this.logger.log(`Response object: ${JSON.stringify(response)}`);
    
    if (business.walletAddress || business.addressId) {
      console.log(`Business ${businessId} already has wallet details:
      Wallet Address: ${business.walletAddress}
      Address ID: ${business.addressId}`);
    }
    
    return response;
  }
} 