import { ApiProperty } from "@nestjs/swagger";

export class TokenRefreshResponseDto {
  @ApiProperty({
    description: "Status of the token refresh operation",
    example: "success",
    enum: ["success", "error"],
  })
  status: string;

  @ApiProperty({
    description: "New access token",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  accessToken: string;

  @ApiProperty({
    description: "New refresh token (if rotation is enabled)",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    required: false,
  })
  refreshToken?: string;

  @ApiProperty({
    description: "Expiration time of the access token in seconds",
    example: 3600,
    required: false,
  })
  expiresIn?: number;

  @ApiProperty({
    description: "Business ID associated with the tokens",
    example: "412f6d5c-edca-46f5-9e8a-e4bf213efa60",
    required: false,
  })
  businessId?: string;
}
