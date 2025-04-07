import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, ValidateIf, IsNotEmpty } from "class-validator";
import { Type } from "class-transformer";

/**
 * DTO for verifying a bank account without linking it to a business
 * Extends BaseBankDto for common bank validation
 */
export class VerifyBankDto {
  @ApiProperty({
    description:
      "Bank code from valid Nigerian banks list (cannot be used with bankName)",
    example: "058",
    required: false,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.bankName)
  @IsNotEmpty({ message: "Either bankCode or bankName must be provided" })
  bankCode?: string;

  @ApiProperty({
    description:
      "Bank name from valid Nigerian banks list (cannot be used with bankCode)",
    example: "Access Bank",
    required: false,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.bankCode)
  @IsNotEmpty({ message: "Either bankCode or bankName must be provided" })
  bankName?: string;

  @ApiProperty({
    description: "Account number to verify",
    example: "0123456789",
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: "Account number is required" })
  accountNumber: string;

  /**
   * Validates that bankCode and bankName aren't provided simultaneously
   */
  validateBankExclusivity?(): boolean {
    if (this.bankCode && this.bankName) {
      return false;
    }
    return true;
  }
}
