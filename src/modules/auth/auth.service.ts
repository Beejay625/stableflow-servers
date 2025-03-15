import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/auth.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService
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
      await this.userRepository.save(user);
    }
    
    // Store OTP in Redis instead of the database
    const redisClient = this.redisService.getClient();
    const redisKey = `otp:${email}`;
    
    // Store OTP in Redis with expiration using ioredis syntax
    await redisClient.set(redisKey, otp, 'EX', expirationInSeconds);
    
    // In a real application, you would send this OTP via email or SMS
    console.log(`OTP for ${email}: ${otp}`);
    
    return { message: 'OTP sent successfully.' };
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
} 