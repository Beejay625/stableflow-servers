import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/auth.entity';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../../common/utils/email';
import { Business, OnboardingStep } from '../business/entities/business.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService
  ) {}

  async generateOtp(email: string) {
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
    
    // Create OTP email template
    const otpEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #333;">Your One-Time Password</h1>
        </div>
        <div style="margin-bottom: 30px; color: #666; font-size: 16px; line-height: 1.5;">
          <p>Hello,</p>
          <p>You requested a one-time password (OTP) for StableFlow. Please use the following code to complete your authentication:</p>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 4px;">
            ${otp}
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't request this OTP, please ignore this email.</p>
          <p>Thank you,<br>The StableFlow Team</p>
        </div>
      </div>
    `;
    
    try {
      // Send OTP via email
      await this.mailService.sendMail(
        email,
        'Your StableFlow Verification Code',
        {
          html: otpEmailHtml,
          text: `Your StableFlow verification code is: ${otp}. This code will expire in 15 minutes.`
        },
        'StableFlow'
      );
      
      return { message: 'OTP sent successfully.' };
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      // Still return success even if email fails, since we logged the OTP
      return { message: 'OTP generated successfully, but email delivery may be delayed.' };
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

  async verifyOtpWithBusinessId(email: string, otp: string) {
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
    
    // Find existing business for this user or create a new one
    let business = await this.businessRepository.findOne({ where: { ownerId: user.id } });
    
    // If no business exists, create a new one
    if (!business) {
      business = this.businessRepository.create({
        ownerId: user.id,
        name: `Business for ${email}`,
        phoneNumber: '',
        onboardingStep: OnboardingStep.BUSINESS_SETUP,
        description: null,
        isVerified: false,
        bankCode: null,
        accountNumber: null,
        accountName: null,
        accountType: null,
        settlementCurrency: null,
        categoryId: null
      });
      business = await this.businessRepository.save(business);
    }
    
    return { 
      message: 'Authentication successful', 
      token, 
      user: { 
        id: user.id,
        email: user.email 
      },
      businessId: business.id
    };
  }
} 