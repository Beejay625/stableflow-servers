import { IsNotEmpty, IsString, Length, IsOptional, ValidateIf } from 'class-validator';

/**
 * DTO for verifying a bank account without linking it to a business
 */
export class VerifyBankDto {
  /**
   * Bank code from Nigerian banks
   * Either bankCode or bankName must be provided, but not both
   */
  @ValidateIf(o => !o.bankName)
  @IsNotEmpty({ message: 'Either bankCode or bankName must be provided' })
  @IsString()
  @Length(2, 20)
  bankCode?: string;

  /**
   * Bank name from Nigerian banks
   * Either bankCode or bankName must be provided, but not both
   */
  @ValidateIf(o => !o.bankCode)
  @IsNotEmpty({ message: 'Either bankCode or bankName must be provided' })
  @IsString()
  @Length(2, 100)
  bankName?: string;

  /**
   * Account number at the selected bank
   */
  @IsNotEmpty()
  @IsString()
  @Length(5, 20)
  accountNumber: string;
} 