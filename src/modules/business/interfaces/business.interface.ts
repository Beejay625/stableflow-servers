import { AccountType, OnboardingStep } from "../entities/business.entity";
import { Currency, Institution } from "../../paycrest/interfaces";

/**
 * Interface representing a business entity with full details
 */
export interface BusinessDetail {
  id: string;
  name: string;
  phoneNumber: string;
  description?: string;
  isVerified: boolean;
  onboardingStep: OnboardingStep;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  accountType?: AccountType;
  categoryId?: string;
  category?: CategoryDetail;
  ownerId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface representing a business category
 */
export interface CategoryDetail {
  id: string;
  name: string;
  description?: string;
  isCustom: boolean;
  isActive: boolean;
}

/**
 * Interface representing a bank account for verification
 */
export interface BankAccountDetail {
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  accountType: AccountType;
  isVerified: boolean;
}

/**
 * Interface for business list response with pagination
 */
export interface BusinessListResponse {
  businesses: BusinessDetail[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Interface for category list response
 */
export interface CategoryListResponse {
  categories: CategoryDetail[];
  total: number;
}

/**
 * Exchange rate response with calculated fiat amount
 */
export interface ExchangeRateResponse {
  rate: string;
  fiatAmount: string;
  token: string;
  fiat: string;
}

// Re-export Paycrest types for backward compatibility
export type PaycrestCurrency = Currency;
export type PaycrestInstitution = Institution;

/**
 * Nigerian bank details from NubaAPI
 */
export interface NigerianBank {
  name: string;
  code: string;
}

/**
 * Nigerian bank list response
 */
export interface NigerianBankResponse {
  statusCode: number;
  message: string;
  data: NigerianBank[];
}

/**
 * Response structure for bank account validation
 */
export interface BankValidationResponse {
  /**
   * The bank information
   */
  bank: {
    /**
     * Bank name
     */
    name: string;

    /**
     * Bank code
     */
    code: string;
  };

  /**
   * The verified account details
   */
  account: {
    /**
     * Account number
     */
    number: string;

    /**
     * Account holder's name
     */
    name: string;
  };
}
