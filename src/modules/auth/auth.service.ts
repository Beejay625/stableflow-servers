import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AlchemyAAService } from '../../common/utils/alchemy';

@Injectable()
export class AuthService {
  private otpStore: Map<string, { otp: string; expiresAt: Date }> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly alchemyService: AlchemyAAService
  ) {}

  async generateOtp(email: string) {
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP with expiration (15 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);
    
    this.otpStore.set(email, { otp, expiresAt });
    
    // In a real application, you would send this OTP via email or SMS
    console.log(`OTP for ${email}: ${otp}`);
    
    return { message: 'OTP sent successfully.' };
  }

  async verifyOtp(email: string, otp: string) {
    const storedData = this.otpStore.get(email);
    
    if (!storedData) {
      throw new UnauthorizedException('Authentication failed.');
    }
    
    const { otp: storedOtp, expiresAt } = storedData;
    
    // Check if OTP has expired
    if (new Date() > expiresAt) {
      this.otpStore.delete(email);
      throw new UnauthorizedException('Authentication failed.');
    }
    
    // Verify OTP
    if (otp !== storedOtp) {
      throw new UnauthorizedException('Authentication failed.');
    }
    
    // Clear OTP after successful verification
    this.otpStore.delete(email);
    
    // Generate token (in a real implementation, you would create or find a user here)
    const token = this.jwtService.sign({ email });
    
    return { 
      message: 'Authentication successful', 
      token, 
      user: { email } 
    };
  }
} 