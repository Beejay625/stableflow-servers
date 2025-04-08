import { ApiProperty } from "@nestjs/swagger";

export class AuthResponseDto {
  @ApiProperty({
    description: "JWT access token for authentication",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  accessToken: string;

  @ApiProperty({
    description: "Token expiration time in seconds",
    example: 86400,
    required: false,
  })
  expiresIn?: number;

  @ApiProperty({ description: "User ID" })
  userId: string;

  @ApiProperty({ description: "User email address" })
  email: string;

  @ApiProperty({ description: "User role" })
  role: string;

  @ApiProperty({ description: "Timestamp of when the token was issued" })
  issuedAt: Date;

  @ApiProperty({ description: "Timestamp of when the token expires" })
  expiresAt: Date;
}
