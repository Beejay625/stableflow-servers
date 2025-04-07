import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsEnum,
  IsOptional,
  ValidateIf,
  IsNotEmpty,
  IsEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { AccountType } from "../entities/business.entity";

/**
 * DTO for linking a bank account to a business
 * Extends BaseBankDto for common bank validation
 */
export class LinkBankDto {
  @ApiProperty({
    description: "Bank code from valid Nigerian banks list",
    example: "058",
    required: false,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.bankName)
  @IsNotEmpty({ message: "Either bankCode or bankName must be provided" })
  @ValidateIf((o) => o.bankName)
  @IsEmpty({ message: "Cannot provide both bankCode and bankName" })
  bankCode?: string;

  @ApiProperty({
    description: "Bank name from valid Nigerian banks list",
    example: "Access Bank",
    required: false,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.bankCode)
  @IsNotEmpty({ message: "Either bankCode or bankName must be provided" })
  @ValidateIf((o) => o.bankCode)
  @IsEmpty({ message: "Cannot provide both bankCode and bankName" })
  bankName?: string;

  @ApiProperty({
    description: "Account number to verify and link",
    example: "0123456789",
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: "Account number is required" })
  accountNumber: string;

  @ApiProperty({
    description: "Account type",
    enum: AccountType,
    example: AccountType.POS,
    required: true,
  })
  @IsEnum(AccountType, {
    message: `Account type must be one of: ${Object.values(AccountType).join(", ")}`,
  })
  @IsNotEmpty({ message: "Account type is required" })
  accountType: AccountType;
}
