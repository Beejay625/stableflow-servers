import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class RefreshTokenDto {
  @ApiProperty({
    description:
      "The refresh token issued during login or previous token refresh",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    required: true,
  })
  @IsNotEmpty({ message: "Refresh token is required" })
  @IsString({ message: "Refresh token must be a string" })
  refreshToken: string;
}
