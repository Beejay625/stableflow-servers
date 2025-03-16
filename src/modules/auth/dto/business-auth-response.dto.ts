import { ApiProperty } from '@nestjs/swagger';
import { AuthResponseDto } from './auth-response.dto';

export class BusinessAuthResponseDto extends AuthResponseDto {
  @ApiProperty({ 
    example: 'business-123', 
    description: 'ID of the user\'s business',
  })
  businessId: string;
} 