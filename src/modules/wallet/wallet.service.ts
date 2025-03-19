import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, OnboardingStep } from '../business/entities/business.entity';
import { User } from '../auth/entities/auth.entity';
import { firstValueFrom } from 'rxjs';
import { BlockRadarAddressResponse, WalletAddressRequest } from './interfaces/wallet.interface';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Check if a business is ready for wallet address generation
   * A business is ready when:
   * - It has completed the onboarding process
   * - It doesn't already have a wallet address
   * 
   * @param businessId - ID of the business to check
   * @returns Promise<boolean> - True if the business is ready, false otherwise
   */
  async isBusinessReadyForWallet(businessId: string): Promise<boolean> {
    this.logger.log(`Checking if business ${businessId} is ready for wallet generation`);
    
    const business = await this.businessRepository.findOne({
      where: { id: businessId },
    });
    
    if (!business) {
      this.logger.error(`Business with ID ${businessId} not found`);
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }
    
    // Business is ready if it has completed onboarding and doesn't have a wallet address yet
    const isReady = business.onboardingStep === OnboardingStep.COMPLETED && !business.walletAddress;
    
    this.logger.log(`Business ${businessId} is ${isReady ? 'ready' : 'not ready'} for wallet generation`);
    return isReady;
  }

  /**
   * Generate a wallet address for a business that has completed onboarding
   * This method is called when a business completes the onboarding process
   * 
   * @param businessId - ID of the business
   * @returns Promise with the result of the wallet generation
   */
  async generateWalletForCompletedBusiness(businessId: string): Promise<any> {
    this.logger.log(`Generating wallet for completed business ${businessId}`);
    
    const business = await this.businessRepository.findOne({
      where: { id: businessId },
    });
    
    if (!business) {
      this.logger.error(`Business with ID ${businessId} not found`);
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }
    
    // Check if the business is in the COMPLETED onboarding step
    if (business.onboardingStep !== OnboardingStep.COMPLETED) {
      this.logger.error(`Business ${businessId} is not ready for wallet generation (onboardingStep: ${business.onboardingStep})`);
      throw new InternalServerErrorException(`Business must complete onboarding before generating a wallet address`);
    }
    
    // Check if the business already has a wallet address
    if (business.walletAddress) {
      this.logger.log(`Business ${businessId} already has a wallet address: ${business.walletAddress}`);
      throw new InternalServerErrorException(`Business already has a wallet address`);
    }
    
    // Generate wallet address for the business
    const result = await this.generateWalletAddress(businessId, business.ownerId);
    
    return result;
  }

  /**
   * Generate a blockchain wallet address for a business
   * @param businessId - ID of the business
   * @param userId - ID of the user who owns the business
   * @returns Promise with the wallet address data
   */
  async generateWalletAddress(businessId: string, userId: string): Promise<BlockRadarAddressResponse> {
    this.logger.log(`Generating wallet address for business ${businessId} and user ${userId}`);
    
    // Validate business exists
    const business = await this.businessRepository.findOne({
      where: { id: businessId },
    });
    
    if (!business) {
      this.logger.error(`Business with ID ${businessId} not found`);
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }
    
    // Validate user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    
    if (!user) {
      this.logger.error(`User with ID ${userId} not found`);
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    
    try {
      // Format business name for BlockRadar (replace spaces with underscores)
      const formattedBusinessName = business.name.replace(/\s+/g, '_');
      
      // Get BlockRadar API key and wallet ID from config
      const apiKey = this.configService.get<string>('blockradar.apiKey') || 
                     this.configService.get<string>('BLOCKRADAR_API_KEY');
      const walletId = this.configService.get<string>('blockradar.walletId') ||
                       this.configService.get<string>('WALLET_ID');
      
      if (!apiKey || !walletId) {
        throw new Error('BlockRadar API key or wallet ID is not configured');
      }
      
      // Prepare request data
      const url = `https://api.blockradar.co/v1/wallets/${walletId}/addresses`;
      const data: WalletAddressRequest = {
        disableAutoSweep: false,
        enableGaslessWithdraw: false,
        metadata: {
          business_id: businessId,
          user_id: userId,
        },
        name: `${formattedBusinessName}_${businessId}`,
        showPrivateKey: false,
      };
      
      const headers = {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      };
      
      this.logger.debug(`Sending request to BlockRadar API: ${url}`);
      
      // Make request to BlockRadar API
      const response = await firstValueFrom(
        this.httpService.post<BlockRadarAddressResponse>(url, data, { headers })
      );
      
      this.logger.log(`Wallet address generated successfully for business ${businessId}`);
      
      // Log the full response for debugging
      console.log(`[DEBUG] BlockRadar API response:`, JSON.stringify(response.data, null, 2));
      
      // Safely extract data from the response with proper error handling
      if (!response.data) {
        throw new Error('Empty response from BlockRadar API');
      }
      
      // Extract wallet address and ID from the response
      if (!response.data.data || !response.data.data.address) {
        this.logger.error(`Invalid response structure from BlockRadar API: ${JSON.stringify(response.data)}`);
        throw new Error('Invalid wallet address response from BlockRadar API');
      }
      
      const walletAddress = response.data.data.address;
      const blockradarWalletId = response.data.data.id;
      
      if (!walletAddress) {
        throw new Error('No wallet address found in BlockRadar API response');
      }
      
      if (!blockradarWalletId) {
        throw new Error('No wallet ID found in BlockRadar API response');
      }
      
      this.logger.log(`Successfully extracted wallet address ${walletAddress} and ID ${blockradarWalletId}`);
      
      // Save wallet address to business
      await this.saveWalletAddressToBusiness(businessId, walletAddress, blockradarWalletId);
      
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error generating wallet address: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        `Failed to generate wallet address: ${error.message}`
      );
    }
  }

  /**
   * Save wallet address to business entity
   * @param businessId - ID of the business
   * @param walletAddress - Wallet address to save
   * @param walletId - BlockRadar wallet ID to save
   * @returns Promise<void>
   */
  private async saveWalletAddressToBusiness(
    businessId: string, 
    walletAddress: string, 
    walletId: string
  ): Promise<void> {
    this.logger.log(`Saving wallet address ${walletAddress} to business ${businessId}`);
    console.log(`[DEBUG] Saving wallet address ${walletAddress} with ID ${walletId} to business ${businessId}`);
    
    try {
      // Update business with wallet address
      const updateResult = await this.businessRepository.update(
        { id: businessId },
        { 
          walletAddress,
          walletId,
        }
      );
      
      console.log(`[DEBUG] Update result:`, JSON.stringify(updateResult));
      
      // Verify the update was successful by fetching the business
      const updatedBusiness = await this.businessRepository.findOne({
        where: { id: businessId }
      });
      
      console.log(`[DEBUG] Business after update:`, 
        updatedBusiness ? 
        `walletAddress: ${updatedBusiness.walletAddress}, walletId: ${updatedBusiness.walletId}` : 
        'Business not found');
        
      // Additional check to confirm wallet was saved correctly  
      if (!updatedBusiness || !updatedBusiness.walletAddress) {
        console.error(`[DEBUG] Wallet address was not saved to business ${businessId}!`);
        this.logger.error(`Failed to save wallet address to business ${businessId}`);
        
        // Try again with query builder to see if that approach works better
        try {
          console.log('[DEBUG] Trying alternative update method with query builder');
          await this.businessRepository
            .createQueryBuilder()
            .update('businesses') // Make sure this matches your actual table name
            .set({ walletAddress, walletId })
            .where("id = :id", { id: businessId })
            .execute();
            
          // Verify the second attempt
          const reCheckedBusiness = await this.businessRepository.findOne({
            where: { id: businessId }
          });
          
          console.log(`[DEBUG] Business after second update attempt:`, 
            reCheckedBusiness ? 
            `walletAddress: ${reCheckedBusiness.walletAddress}, walletId: ${reCheckedBusiness.walletId}` : 
            'Business not found');
            
          if (!reCheckedBusiness || !reCheckedBusiness.walletAddress) {
            console.error(`[DEBUG] Second attempt to save wallet address failed!`);
          }
        } catch (secondError) {
          console.error(`[DEBUG] Error in second update attempt:`, secondError);
        }
      }
    } catch (error) {
      this.logger.error(`Error saving wallet address to business: ${error.message}`, error.stack);
      console.error(`[DEBUG] Error saving wallet address:`, error);
      throw error;
    }
  }
} 