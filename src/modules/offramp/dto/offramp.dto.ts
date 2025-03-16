import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * DTO for requesting token exchange rates
 */
export class GetRateDto {
  /**
   * The cryptocurrency token for which to fetch the rate
   */
  @IsString()
  @IsNotEmpty()
  token: string;
  
  /**
   * The amount of cryptocurrency for which to get the rate
   */
  @IsString()
  @IsNotEmpty()
  amount: string;
  
  /**
   * The fiat currency code to convert to
   */
  @IsString()
  @IsNotEmpty()
  fiat: string;
  
  /**
   * Optional provider ID to get rate from specific liquidity provider
   */
  @IsString()
  @IsOptional()
  providerId?: string;
}

/**
 * DTO for creating an offramp transaction
 */
export class CreateOfframpDto {
  /**
   * The amount of cryptocurrency to offramp
   */
  @IsString()
  @IsNotEmpty()
  amount: string;
  
  /**
   * The cryptocurrency token code
   */
  @IsString()
  @IsNotEmpty()
  token: string;
  
  /**
   * The fiat currency code to convert to
   */
  @IsString()
  @IsNotEmpty()
  fiat: string;
  
  /**
   * The financial institution code
   */
  @IsString()
  @IsNotEmpty()
  institution: string;
  
  /**
   * The recipient's account identifier (account number)
   */
  @IsString()
  @IsNotEmpty()
  accountIdentifier: string;
  
  /**
   * Optional account name (if known)
   */
  @IsString()
  @IsOptional()
  accountName?: string;
  
  /**
   * Optional memo for the transaction
   */
  @IsString()
  @IsOptional()
  memo?: string;
}

/**
 * Recipient details for offramp response
 */
export interface OfframpRecipient {
  institution: string;
  accountIdentifier: string;
  accountName?: string;
  currency?: string;
}

/**
 * Response DTO for offramp creation
 */
export interface OfframpResponse {
  id: string;
  amount: string;
  token: string;
  rate: string;
  fiatAmount: string;
  reference: string;
  status: string;
  recipient: OfframpRecipient;
  createdAt: string;
}

/**
 * Response DTO for offramp status
 */
export interface OfframpStatusResponse {
  id: string;
  status: string;
  amount: string;
  token: string;
  fiatAmount: string;
  recipient: OfframpRecipient;
  createdAt: string;
  updatedAt: string;
  txHash?: string;
} 