import { Controller, Post, Body, Logger, HttpCode, HttpStatus, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { 
  RequestOtpDto, 
  AuthResponseDto, 
  ValidateOtpDto, 
  BusinessAuthResponseDto 
} from './dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: 'Request OTP for authentication' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: AuthResponseDto,
  })
  @ApiBody({ type: RequestOtpDto })
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(
    @Body() requestOtpDto: RequestOtpDto,
  ): Promise<AuthResponseDto> {
    this.logger.log(`OTP requested for email: ${requestOtpDto.email}`);
    return this.authService.generateOtp(requestOtpDto.email);
  }

  @Public()
  @ApiOperation({ summary: 'Verify OTP and authenticate user' })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful with business ID',
    type: BusinessAuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiBody({ type: ValidateOtpDto })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() validateOtpDto: ValidateOtpDto,
  ): Promise<BusinessAuthResponseDto> {
    this.logger.log(`Verifying OTP for email: ${validateOtpDto.email}`);
    
    const response = await this.authService.verifyOtpWithBusinessId(
      validateOtpDto.email, 
      validateOtpDto.otp
    );
    
    // Ensure businessId is not null
    if (!response.businessId) {
      this.logger.warn(`Business ID is null or undefined in response! Creating temporary ID.`);
      response.businessId = `temp-${Date.now()}`;
    }
    
    this.logger.log(`Authentication successful for ${validateOtpDto.email} with business ID: ${response.businessId}`);
    this.logger.log(`Final response object: ${JSON.stringify(response)}`);
    
    return response;
  }

  @Public()
  @Delete('test/delete-user/:userId')
  @ApiOperation({ summary: 'Delete a user and all associated data (TEST ONLY)' })
  @ApiParam({ name: 'userId', description: 'ID of the user to delete' })
  @ApiResponse({ status: 200, description: 'User and associated data deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async deleteUserAndData(@Param('userId') userId: string): Promise<{ 
    success: boolean; 
    deletedBusinessesCount: number; 
    message: string 
  }> {
    this.logger.log(`[TEST ENDPOINT] Request to delete user ${userId} and all associated data`);
    return this.authService.deleteUserAndData(userId);
  }
}
