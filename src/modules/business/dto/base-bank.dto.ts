import {
  IsNotEmpty,
  IsString,
  Length,
  ValidateIf,
  Matches,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Base DTO for bank account validation
 * Contains common fields and validation rules for bank operations
 */
export class BaseBankDto {
  /**
   * Bank code from Nigerian banks
   * Either bankCode or bankName must be provided, but not both
   */
  @ValidateIf((o) => !o.bankName)
  @IsNotEmpty({ message: "Either bankCode or bankName must be provided" })
  @IsString()
  @Length(3, 6, { message: "Bank code must be between 3 and 6 digits" })
  @Matches(/^[0-9]{3,6}$/, {
    message: "Bank code must contain only digits",
  })
  @ApiProperty({
    description: "Bank code (do not provide if using bankName)",
    required: false,
  })
  bankCode?: string;

  /**
   * Bank name from Nigerian banks
   * Either bankCode or bankName must be provided, but not both
   */
  @ValidateIf((o) => !o.bankCode)
  @IsNotEmpty({ message: "Either bankCode or bankName must be provided" })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z\s\-&]+$/, {
    message:
      "Bank name can only contain letters, spaces, hyphens, and ampersands",
  })
  @ApiProperty({
    description: "Bank name (do not provide if using bankCode)",
    required: false,
  })
  bankName?: string;

  /**
   * Account number at the selected bank
   * Nigerian bank accounts are exactly 10 digits
   */
  @IsNotEmpty()
  @IsString()
  @Length(10, 10, {
    message: "Nigerian bank account numbers must be exactly 10 digits",
  })
  @Matches(/^[0-9]{10}$/, {
    message: "Account number must be exactly 10 digits",
  })
  @ApiProperty({ description: "Account number", required: true })
  accountNumber: string;
}
