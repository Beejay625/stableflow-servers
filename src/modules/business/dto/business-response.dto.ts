import { ApiProperty } from "@nestjs/swagger";
import { OnboardingStep } from "../entities/business.entity";
import { AccountType } from "../entities/bank-details.entity";
import { Category } from "../entities/category.entity";

export class BankDetailsDto {
  @ApiProperty({ description: "Bank code of the business account" })
  bankCode: string;

  @ApiProperty({ description: "Bank name of the business account" })
  bankName: string;

  @ApiProperty({ description: "Account number of the business" })
  accountNumber: string;

  @ApiProperty({ description: "Account name of the business" })
  accountName: string;

  @ApiProperty({
    description: "Type of the business account",
    enum: AccountType,
  })
  accountType: AccountType;

  @ApiProperty({ description: "When the bank details were created" })
  createdAt: Date;

  @ApiProperty({ description: "When the bank details were last updated" })
  updatedAt: Date;
}

/**
 * Wallet Details DTO
 * Contains cryptocurrency wallet information
 */
export class WalletDetailsDto {
  @ApiProperty({
    description: "Address ID from blockchain provider",
    example: "12345",
  })
  addressId: string;

  @ApiProperty({
    description: "Wallet address",
    example: "0xf5f2817A086e747a7c45429993338070Af8f3A81",
  })
  address: string;

  @ApiProperty({ description: "Blockchain network", example: "testnet" })
  network: string;

  @ApiProperty({
    description:
      "Whether wallet is compatible with EVM (Ethereum Virtual Machine)",
    example: true,
  })
  isEvmCompatible: boolean;

  @ApiProperty({
    description: "Additional metadata for the wallet",
    example: { user_id: "123" },
  })
  metadata: Record<string, any>;
}

export class SimplifiedCategoryDto {
  @ApiProperty({ description: "Unique identifier of the category" })
  id: string;

  @ApiProperty({ description: "Name of the category" })
  name: string;

  @ApiProperty({ description: "Description of the category", required: false })
  description?: string;

  @ApiProperty({ description: "When the category was created" })
  createdAt: Date;

  @ApiProperty({ description: "When the category was last updated" })
  updatedAt: Date;
}

/**
 * Simplified Business Response DTO
 * Contains only essential information needed for the client
 */
export class SimplifiedBusinessResponseDto {
  @ApiProperty({ description: "Unique identifier of the business" })
  Business_id: string;

  @ApiProperty({ description: "Name of the business" })
  name: string;

  @ApiProperty({ description: "Phone number of the business" })
  phoneNumber: string;

  @ApiProperty({ description: "Category of the business" })
  category: Category;

  @ApiProperty({
    description: "Current onboarding step of the business",
    enum: OnboardingStep,
  })
  onboardingStep: OnboardingStep;

  @ApiProperty({
    description: "Approval status of the business",
    enum: ["APPROVED", "NOT_APPROVED"],
  })
  business_status: string;

  @ApiProperty({
    description: "Status of offramp operations",
    enum: ["ACTIVE", "INACTIVE"],
  })
  offramp_status: string;

  @ApiProperty({ description: "Bank details of the business", required: false })
  bankDetails?: BankDetailsDto;

  @ApiProperty({
    description: "Wallet details of the business",
    required: false,
  })
  walletDetails?: WalletDetailsDto;

  @ApiProperty({ description: "User ID who owns the business" })
  user_Id: string;

  @ApiProperty({ description: "When the business was created" })
  createdAt: Date;

  @ApiProperty({ description: "When the business was last updated" })
  updatedAt: Date;
}

/**
 * Standard API Response format
 */
export class BusinessResponseDto {
  @ApiProperty({ description: "HTTP Status code", example: 200 })
  statusCode: number;

  @ApiProperty({ description: "Response message", example: "Success" })
  message: string;

  @ApiProperty({ description: "Business data" })
  data: SimplifiedBusinessResponseDto;

  @ApiProperty({
    description: "Wallet details if a wallet was just generated",
    required: false,
  })
  walletDetails?: WalletDetailsDto;

  @ApiProperty({
    description: "Fields that were updated in this request",
    type: [String],
    required: false,
    example: ["name", "phoneNumber"],
  })
  updatedFields?: string[];

  @ApiProperty({
    description: "Previous values of the fields that were updated",
    type: Object,
    required: false,
    example: { name: "Old Name", phoneNumber: "+1234567890" },
  })
  previousValues?: Record<string, any>;
}
