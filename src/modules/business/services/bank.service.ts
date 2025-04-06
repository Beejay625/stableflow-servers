import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NUBAPI_TOKEN } from '../../../common/constants/env.constants';
import { Institution } from '../../paycrest/interfaces';
import { NubapiResponse } from '../interfaces';
import { BankDetails, AccountType } from '../entities/bank-details.entity';
import { Business } from '../entities/business.entity';

@Injectable()
export class BankService {
  private readonly logger = new Logger(BankService.name);
  private nigerianBanksCache: Institution[] = null;
  private nigerianBanksCacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 3600000; // 1 hour
  private readonly BANK_VERIFY_TIMEOUT = 10000; // 10 seconds

  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * Verifies a bank account using Nubapi API
   */
  async verifyBankAccountInternal(
    accountNumber: string,
    bankCode: string
  ): Promise<{ accountName: string; responseData: NubapiResponse }> {
    const nubapiToken = this.configService.get(NUBAPI_TOKEN);
    if (!nubapiToken) {
      throw new InternalServerErrorException('NUBAPI_TOKEN is not configured');
    }
    
    try {
      const verifyUrl = `https://nubapi.com/api/verify?account_number=${accountNumber}&bank_code=${bankCode}`;
      
      const apiResponse = await Promise.race([
        axios.get<NubapiResponse>(verifyUrl, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${nubapiToken}`
          }
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Bank verification timeout')), this.BANK_VERIFY_TIMEOUT)
        )
      ]) as { data: NubapiResponse };

      const responseData = apiResponse.data;
      const accountName = responseData.data?.account_name || responseData.account_name;
      
      if (!accountName) {
        throw new BadRequestException('Could not verify account. Bank verification didn\'t return an account name.');
      }

      return { accountName, responseData };
    } catch (error) {
      if (error.message === 'Bank verification timeout') {
        throw error;
      } else if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Could not verify account: ${error.message}`);
    }
  }

  /**
   * Resolves bank information from either code or name
   */
  async resolveBankInformation(
    bankCode?: string,
    bankName?: string
  ): Promise<{ bankCode: string; bankName: string }> {
    const nigerianBanks = await this.getNigerianBanks();

    if (bankName && !bankCode) {
      const foundBank = nigerianBanks.find(bank => 
        bank.name.toLowerCase() === bankName.toLowerCase()
      );
      
      if (!foundBank) {
        throw new BadRequestException(`Bank name "${bankName}" not found in supported banks list`);
      }
      
      return { bankCode: foundBank.code, bankName: foundBank.name };
    }

    if (bankCode) {
      const foundBank = nigerianBanks.find(bank => bank.code === bankCode);
      if (!foundBank) {
        throw new BadRequestException(`Invalid bank code: ${bankCode}`);
      }
      return { bankCode, bankName: foundBank.name };
    }

    throw new BadRequestException('Either bank code or bank name must be provided');
  }

  /**
   * Creates or updates bank details for a business
   */
  async updateBusinessBankDetails(
    business: Business,
    bankCode: string,
    bankName: string,
    accountNumber: string,
    accountName: string,
    accountType: AccountType
  ): Promise<{ bankDetails: BankDetails; changes: string[] }> {
    const bankDetails = business.bankDetails || new BankDetails();
    const previousDetails = { ...bankDetails };
    const changes: string[] = [];

    bankDetails.bankCode = bankCode;
    bankDetails.bankName = bankName;
    bankDetails.accountNumber = accountNumber;
    bankDetails.accountName = accountName;
    bankDetails.accountType = accountType;
    bankDetails.businessId = business.id;
    bankDetails.lastVerifiedAt = new Date();

    // Track changes
    if (previousDetails.bankCode !== bankDetails.bankCode) changes.push('bank_code_updated');
    if (previousDetails.bankName !== bankDetails.bankName) changes.push('bank_name_updated');
    if (previousDetails.accountNumber !== bankDetails.accountNumber) changes.push('account_number_updated');
    if (previousDetails.accountName !== bankDetails.accountName) changes.push('account_name_updated');
    if (previousDetails.accountType !== bankDetails.accountType) changes.push('account_type_updated');

    return { bankDetails, changes };
  }

  /**
   * Validates bank details for onboarding
   */
  validateBankDetails(bankDetails: BankDetails): { isValid: boolean; reason?: string } {
    if (!bankDetails) {
      return { isValid: false, reason: 'Bank details are required' };
    }

    if (!bankDetails.bankCode || !bankDetails.bankName) {
      return { isValid: false, reason: 'Bank information is incomplete' };
    }

    if (!bankDetails.accountNumber || !bankDetails.accountName) {
      return { isValid: false, reason: 'Account information is incomplete' };
    }

    if (!bankDetails.accountType) {
      return { isValid: false, reason: 'Account type is required' };
    }

    return { isValid: true };
  }

  /**
   * Fetch bank data directly from Nubapi's open endpoint
   */
  private async fetchNubapiBanks(): Promise<Institution[]> {
    this.logger.debug('Fetching bank data directly from Nubapi');
    try {
      const response = await axios.get('https://nubapi.com/banks');
      const bankData = response.data;
      
      // Process the data into Institution format
      const banks: Institution[] = [];
      for (const [code, name] of Object.entries(bankData)) {
        banks.push({
          name: name as string,
          code: code,
          type: 'bank',
          supportedCurrencies: ['NGN']
        });
      }
      
      this.logger.debug(`Successfully fetched ${banks.length} banks from Nubapi`);
      return banks;
    } catch (error) {
      this.logger.error(`Failed to fetch banks from Nubapi: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch bank list, please try again later');
    }
  }

  /**
   * Get list of Nigerian banks from Nubapi or cache
   */
  async getNigerianBanks(): Promise<Institution[]> {
    // Check if we have a valid cache
    const now = Date.now();
    if (this.nigerianBanksCache && (now - this.nigerianBanksCacheTimestamp) < this.CACHE_TTL_MS) {
      this.logger.debug(`Using cached Nigerian banks list with ${this.nigerianBanksCache.length} items`);
      return this.nigerianBanksCache;
    }

    // Fetch fresh data from Nubapi if cache is invalid or expired
    const banks = await this.fetchNubapiBanks();
    
    // Update cache with Nubapi banks
    this.nigerianBanksCache = banks;
    this.nigerianBanksCacheTimestamp = now;
    this.logger.debug(`Updated Nigerian banks cache with ${banks.length} items from Nubapi`);
    
    return banks;
  }

  /**
   * Verify bank account details with timeout
   */
  async verifyBankAccount(
    accountNumber: string,
    bankCode?: string,
    bankName?: string
  ): Promise<{ bankCode: string; bankName: string; accountName: string }> {
    // First resolve bank information
    const resolvedBank = await this.resolveBankInformation(bankCode, bankName);
    
    // Then verify the account
    const { accountName } = await this.verifyBankAccountInternal(
      accountNumber,
      resolvedBank.bankCode
    );

    return {
      bankCode: resolvedBank.bankCode,
      bankName: resolvedBank.bankName,
      accountName
    };
  }
} 