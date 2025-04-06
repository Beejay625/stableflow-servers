import { Injectable } from '@nestjs/common';
import { Business, OnboardingStep } from '../entities/business.entity';
import { SimplifiedBusinessResponseDto, WalletDetailsDto } from '../dto/business-response.dto';
import { BusinessWalletService } from '../services/business-wallet.service';

@Injectable()
export class BusinessTransformer {
  constructor(
    private readonly businessWalletService: BusinessWalletService,
  ) {}

  /**
   * Converts a business entity to a simplified response DTO
   */
  toSimplifiedResponse(business: Business): SimplifiedBusinessResponseDto {
    const response = new SimplifiedBusinessResponseDto();
    response.Business_id = business.id;
    response.name = business.name;
    response.phoneNumber = business.phoneNumber;
    response.onboardingStep = business.onboardingStep;
    
    // Business status shows if business is approved
    response.business_status = business.onboardingStep === OnboardingStep.APPROVED ? 'APPROVED' : 'NOT_APPROVED';
    
    // Offramp status shows if transactions can be processed
    response.offramp_status = (business.onboardingStep === OnboardingStep.APPROVED && business.isActive) ? 'ACTIVE' : 'INACTIVE';
    
    response.user_Id = business.ownerId;
    response.createdAt = business.createdAt;
    response.updatedAt = business.updatedAt;

    if (business.category) {
      response.category = business.category;
    }

    if (business.bankDetails) {
      response.bankDetails = {
        bankCode: business.bankDetails.bankCode,
        bankName: business.bankDetails.bankName,
        accountNumber: business.bankDetails.accountNumber,
        accountName: business.bankDetails.accountName,
        accountType: business.bankDetails.accountType,
        createdAt: business.bankDetails.createdAt,
        updatedAt: business.bankDetails.updatedAt
      };
    }

    const walletDetails = this.businessWalletService.getWalletDetails(business);
    if (walletDetails) {
      response.walletDetails = walletDetails;
    }

    return response;
  }
} 