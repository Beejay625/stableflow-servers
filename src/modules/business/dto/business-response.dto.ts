import { ApiProperty } from '@nestjs/swagger';
import { OnboardingStep, AccountType } from '../entities/business.entity';
import { Category } from '../entities/category.entity';

export class BankDetailsDto {
  @ApiProperty({ description: 'Bank code of the business account' })
  bankCode: string;

  @ApiProperty({ description: 'Bank name of the business account' })
  bankName: string;

  @ApiProperty({ description: 'Account number of the business' })
  accountNumber: string;

  @ApiProperty({ description: 'Account name of the business' })
  accountName: string;

  @ApiProperty({ description: 'Type of the business account', enum: AccountType })
  accountType: AccountType;
  
  @ApiProperty({ description: 'When the bank details were created' })
  createdAt: Date;
  
  @ApiProperty({ description: 'When the bank details were last updated' })
  updatedAt: Date;
}

/**
 * Wallet Details DTO
 * Contains cryptocurrency wallet information
 */
export class WalletDetailsDto {
  @ApiProperty({ description: 'Address ID from blockchain provider', example: '12345' })
  addressId: string;

  @ApiProperty({ description: 'Wallet address', example: '0xf5f2817A086e747a7c45429993338070Af8f3A81' })
  address: string;

  @ApiProperty({ description: 'Blockchain network', example: 'testnet' })
  network: string;

  @ApiProperty({ description: 'Whether wallet is compatible with EVM (Ethereum Virtual Machine)', example: true })
  isEvmCompatible: boolean;

  @ApiProperty({ description: 'Additional metadata for the wallet', example: { user_id: '123' } })
  metadata: Record<string, any>;
}

/**
 * Simplified Business Response DTO
 * Contains only essential information needed for the client
 */
export class SimplifiedBusinessResponseDto {
  @ApiProperty({ description: 'Unique identifier of the business' })
  Business_id: string;

  @ApiProperty({ description: 'Name of the business' })
  name: string;

  @ApiProperty({ description: 'Phone number of the business' })
  phoneNumber: string;

  @ApiProperty({ description: 'Category of the business' })
  category: Category;

  @ApiProperty({ description: 'Current onboarding step of the business', enum: OnboardingStep })
  onboardingStep: OnboardingStep;

  @ApiProperty({ description: 'Status of the business', enum: ['ACTIVE', 'INACTIVE'] })
  business_status: string;

  @ApiProperty({ description: 'Bank details of the business' })
  bankDetails: BankDetailsDto;

  @ApiProperty({ description: 'Wallet details of the business', nullable: true })
  walletDetails: WalletDetailsDto;

  @ApiProperty({ description: 'User ID who owns the business' })
  user_Id: string;

  @ApiProperty({ description: 'When the business was created' })
  createdAt: Date;
  
  @ApiProperty({ description: 'When the business was last updated' })
  updatedAt: Date;
}

/**
 * Standard API Response format
 */
export class BusinessResponseDto {
  @ApiProperty({ description: 'HTTP Status code', example: 200 })
  statusCode: number;

  @ApiProperty({ description: 'Response message', example: 'Success' })
  message: string;

  @ApiProperty({ description: 'Business data' })
  data: SimplifiedBusinessResponseDto;
  
  @ApiProperty({ description: 'Wallet details if a wallet was just generated', required: false })
  walletDetails?: WalletDetailsDto;
}

/**
 * Category information in simplified form
 */
export class SimplifiedCategoryDto {
  @ApiProperty({ description: 'Unique identifier of the category' })
  id: string;

  @ApiProperty({ description: 'Name of the category' })
  name: string;

  @ApiProperty({ description: 'Whether this is a custom category' })
  isCustom: boolean;
} 