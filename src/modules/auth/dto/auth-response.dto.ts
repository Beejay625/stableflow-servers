import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ example: 'OTP sent successfully', description: 'Status message' })
  message: string;

  @ApiProperty({ 
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 
    description: 'JWT token for authentication',
    required: false 
  })
  token?: string;

  @ApiProperty({
    example: { email: 'user@example.com' },
    description: 'User information',
    required: false
  })
  user?: Record<string, any>;
}
