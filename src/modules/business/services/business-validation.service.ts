import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, OnboardingStep } from '../entities/business.entity';
import { BankService } from './bank.service';

@Injectable()
export class BusinessValidationService {
  private readonly logger = new Logger(BusinessValidationService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly bankService: BankService,
  ) {}

  /**
   * Validates business details for onboarding
   */
  validateBusinessDetails(business: Business): { isValid: boolean; reason?: string } {
    const errors: string[] = [];

    if (!business.name || business.name.trim().length === 0) {
      errors.push('Business name is required');
    }

    if (!business.phoneNumber || !/^\+[1-9]\d{1,14}$/.test(business.phoneNumber)) {
      errors.push('Valid phone number in international format is required');
    }

    if (!business.category || !business.categoryId) {
      errors.push('Business category is required');
    } else if (!business.category.isActive) {
      errors.push('Selected category is not active');
    }

    // Check for invalid state: bank details in NOT_STARTED
    if (business.onboardingStep === OnboardingStep.NOT_STARTED && business.bankDetails) {
      errors.push('Cannot have bank details in NOT_STARTED state. Complete business setup first');
    }

    if (errors.length > 0) {
      return { isValid: false, reason: errors.join(', ') };
    }

    return { isValid: true };
  }

  /**
   * Validates and retrieves a business by ID and owner ID
   */
  async validateAndGetBusiness(id: string, ownerId: string): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { id, ownerId },
      relations: ['category', 'bankDetails'],
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${id} not found`);
    }

    return business;
  }

  /**
   * Updates business onboarding step based on current state
   */
  async updateOnboardingStep(
    business: Business,
    queryRunner: any
  ): Promise<{ newStep: OnboardingStep; changes: string[]; error?: string }> {
    const changes: string[] = [];
    let newStep = business.onboardingStep;
    let error: string | undefined;

    // Validate current state and determine next step
    switch (business.onboardingStep) {
      case OnboardingStep.NOT_STARTED: {
        const { isValid, reason } = this.validateBusinessDetails(business);
        if (isValid) {
          newStep = OnboardingStep.BUSINESS_SETUP;
          changes.push('business_details_completed');
        } else {
          error = `Cannot progress from NOT_STARTED: ${reason}`;
          this.logger.warn(`Business ${business.id} validation failed: ${reason}`);
        }
        break;
      }

      case OnboardingStep.BUSINESS_SETUP: {
        // First validate business details are still valid
        const businessValid = this.validateBusinessDetails(business);
        if (!businessValid.isValid) {
          error = `Invalid business details: ${businessValid.reason}`;
          newStep = OnboardingStep.NOT_STARTED;
          changes.push('reverted_to_not_started');
          break;
        }

        const { isValid, reason } = this.bankService.validateBankDetails(business.bankDetails);
        if (isValid) {
          newStep = OnboardingStep.ACCOUNT_SETUP;
          changes.push('bank_details_completed');
        } else {
          error = `Cannot progress from BUSINESS_SETUP: ${reason}`;
          this.logger.warn(`Business ${business.id} bank validation failed: ${reason}`);
        }
        break;
      }

      case OnboardingStep.ACCOUNT_SETUP: {
        // No automatic transition - requires admin approval
        // But validate both business and bank details are still valid
        const businessValid = this.validateBusinessDetails(business);
        const bankValid = this.bankService.validateBankDetails(business.bankDetails);
        
        if (!businessValid.isValid || !bankValid.isValid) {
          error = `Invalid state: ${businessValid.reason || ''} ${bankValid.reason || ''}`.trim();
          // Determine which state to revert to
          if (!businessValid.isValid) {
            newStep = OnboardingStep.NOT_STARTED;
            changes.push('reverted_to_not_started');
          } else {
            newStep = OnboardingStep.BUSINESS_SETUP;
            changes.push('reverted_to_business_setup');
          }
        }
        break;
      }

      case OnboardingStep.APPROVED: {
        // Validate everything is still valid
        const businessValid = this.validateBusinessDetails(business);
        const bankValid = this.bankService.validateBankDetails(business.bankDetails);
        
        if (!businessValid.isValid || !bankValid.isValid) {
          error = `Invalid approved state: ${businessValid.reason || ''} ${bankValid.reason || ''}`.trim();
          // Determine which state to revert to
          if (!businessValid.isValid) {
            newStep = OnboardingStep.NOT_STARTED;
            changes.push('reverted_to_not_started');
          } else if (!bankValid.isValid) {
            newStep = OnboardingStep.BUSINESS_SETUP;
            changes.push('reverted_to_business_setup');
          } else {
            newStep = OnboardingStep.ACCOUNT_SETUP;
            changes.push('reverted_to_account_setup');
          }
        }
        break;
      }
    }

    return { newStep, changes, error };
  }
} 