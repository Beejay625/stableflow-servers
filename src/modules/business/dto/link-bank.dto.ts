import { IsNotEmpty, IsString, IsOptional, Length, IsEnum, ValidateIf } from 'class-validator';
import { AccountType } from '../entities/business.entity';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for linking a bank account to a business
 */
export class LinkBankDto {
  /**
   * Bank code from Nigerian banks
   * Either bankCode or bankName must be provided
   */
  @ValidateIf(o => !o.bankName)
  @IsNotEmpty({ message: 'Either bankCode or bankName must be provided' })
  @IsString()
  @Length(2, 20)
  @ApiProperty({ description: 'Bank code', required: false })
  bankCode?: string;

  /**
   * Bank name from Nigerian banks
   * Either bankCode or bankName must be provided
   */
  @ValidateIf(o => !o.bankCode)
  @IsNotEmpty({ message: 'Either bankCode or bankName must be provided' })
  @IsString()
  @Length(2, 100)
  @ApiProperty({ description: 'Bank name', required: false })
  bankName?: string;

  /**
   * Account number at the selected bank
   */
  @IsNotEmpty()
  @IsString()
  @Length(5, 20)
  @ApiProperty({ description: 'Account number', required: true })
  accountNumber: string;

  /**
   * Optional account name (will be fetched from API if not provided)
   * Required if API can't resolve the account name
   */
  @IsOptional()
  @IsString()
  @Length(2, 100)
  accountName?: string;

  /**
   * Type of account (e.g., POS, SETTLEMENT)
   */
  @IsNotEmpty()
  @IsEnum(AccountType)
  @ApiProperty({ description: 'Account type', required: true })
  accountType: AccountType;
}