import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT token for authentication' })
  token: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User email address' })
  email: string;

  @ApiProperty({ description: 'User role' })
  role: string;

  @ApiProperty({ description: 'Timestamp of when the token was issued' })
  issuedAt: Date;

  @ApiProperty({ description: 'Timestamp of when the token expires' })
  expiresAt: Date;
} 