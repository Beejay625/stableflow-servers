import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../entities/business.entity';
import { WalletService } from '../../wallet/wallet.service';
import { WalletDetailsDto } from '../dto/business-response.dto';

@Injectable()
export class BusinessWalletService {
  private readonly logger = new Logger(BusinessWalletService.name);
  private readonly WALLET_GENERATE_TIMEOUT = 20000; // 20 seconds

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Creates wallet details DTO from business entity
   */
  getWalletDetails(business: Business): WalletDetailsDto | null {
    this.logger.debug(`Getting wallet details for business ${business.id}: ` + 
      `walletAddress: ${business.walletAddress || 'none'}, addressId: ${business.addressId || 'none'}`);
    
    // If either wallet address or ID is missing, return null
    if (!business.walletAddress || !business.addressId) {
      this.logger.debug(`No wallet details available, returning null`);
      return null;
    }
    
    // Create a wallet details object with the available information
    const walletDetails = new WalletDetailsDto();
    walletDetails.addressId = business.addressId;
    walletDetails.address = business.walletAddress;
    
    // Since we don't have blockchain network details in the business entity,
    // use default values for now
    walletDetails.network = 'mainnet'; 
    walletDetails.isEvmCompatible = true;
    
    // Add metadata
    walletDetails.metadata = {
      business_id: business.id,
      user_id: business.ownerId
    };
    
    this.logger.debug(`Returning wallet details:`, JSON.stringify(walletDetails));
    return walletDetails;
  }

  /**
   * Centralized wallet generation with retries and error handling
   */
  async generateWalletWithRetries(
    business: Business,
    queryRunner?: any
  ): Promise<{ walletDetails: any; changes: string[] }> {
    const changes: string[] = [];
    
    if (!business || !business.onboardingStep || business.walletAddress) {
      return { walletDetails: null, changes };
    }

    try {
      // Generate wallet with timeout
      const walletResult = await Promise.race([
        this.walletService.generateWalletForCompletedBusiness(business.id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Wallet generation timeout')), this.WALLET_GENERATE_TIMEOUT)
        )
      ]);

      if (walletResult?.data?.address) {
        changes.push('wallet_generated');
        
        // Update business with wallet details
        const updateData = {
          walletAddress: walletResult.data.address,
          addressId: walletResult.data.id
        };

        if (queryRunner) {
          await queryRunner.manager.update(Business, business.id, updateData);
        } else {
          await this.businessRepository.update(business.id, updateData);
        }

        return { walletDetails: walletResult.data, changes };
      }
      
      throw new Error('Invalid wallet generation response');
    } catch (error) {
      this.logger.error(`Error generating wallet for business ${business.id}: ${error.message}`, error.stack);
      return { walletDetails: null, changes };
    }
  }
} 