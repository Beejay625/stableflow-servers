import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { AccountType } from '../entities/bank-details.entity';
import { ApiProperty } from '@nestjs/swagger';
import { BaseBankDto } from './base-bank.dto';

/**
 * DTO for linking a bank account to a business
 * Extends BaseBankDto for common bank validation
 */
export class LinkBankDto extends BaseBankDto {
  /**
   * Optional account name (will be fetched from API if not provided)
   * Required if API can't resolve the account name
   */
  @IsOptional()
  @IsString()
  accountName?: string;

  /**
   * Type of account (e.g., POS, SAVINGS, CURRENT)
   */
  @IsNotEmpty()
  @IsEnum(AccountType)
  @ApiProperty({ description: 'Account type', enum: AccountType, required: true })
  accountType: AccountType;
}