import { ApiProperty } from '@nestjs/swagger';
import { AuthResponseDto } from './auth-response.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class BusinessAuthResponseDto extends AuthResponseDto {
  @ApiProperty({ 
    example: 'business-123', 
    description: 'ID of the user\'s business',
    required: true
  })
  @IsNotEmpty()
  @IsString()
  businessId: string;
} 