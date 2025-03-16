import { IsNotEmpty, IsString, IsOptional, Length, IsEnum } from 'class-validator';
import { AccountType } from '../entities/business.entity';

/**
 * DTO for linking a bank account to a business
 */
export class LinkBankDto {
  /**
   * Bank code from Paycrest supported institutions
   */
  @IsNotEmpty()
  @IsString()
  @Length(2, 20)
  bankCode: string;

  /**
   * Account number at the selected bank
   */
  @IsNotEmpty()
  @IsString()
  @Length(5, 20)
  accountNumber: string;

  /**
   * Optional account name (will be fetched from Paycrest if not provided)
   * Required if Paycrest can't resolve the account name
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
  accountType: AccountType;

  /**
   * Currency code for settlement (e.g., NGN, USD)
   * Required to verify the bank code with Paycrest
   */
  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  settlementCurrency: string;
}