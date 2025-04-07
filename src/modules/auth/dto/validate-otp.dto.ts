import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, Length } from "class-validator";

export class ValidateOtpDto {
  @ApiProperty({ description: "Email address associated with OTP" })
  @IsEmail({}, { message: "Invalid email format" })
  @IsNotEmpty({ message: "Email is required" })
  email: string;

  @ApiProperty({ description: "One-time password to validate" })
  @IsNotEmpty({ message: "OTP is required" })
  @Length(6, 6, { message: "OTP must be 6 characters long" })
  otp: string;
}
