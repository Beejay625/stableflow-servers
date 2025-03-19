import { SimplifiedBusinessResponseDto, BusinessResponseDto, WalletDetailsDto } from './business-response.dto';
import { OnboardingStep, AccountType } from '../entities/business.entity';

describe('BusinessResponseDto', () => {
  describe('SimplifiedBusinessResponseDto', () => {
    it('should have the correct structure with business_status instead of isActive', () => {
      // Arrange
      const dto = new SimplifiedBusinessResponseDto();
      const timestamp = new Date();
      
      // Act
      dto.Business_id = '7dfe2c46-d0de-4b16-b6fa-9ad25cda90af';
      dto.name = 'Seyi Idowu';
      dto.phoneNumber = '067777777';
      dto.category = {
        id: '2085118b-f5cc-4d09-adc9-9e46a868864f',
        name: '794494949',
        description: 'Category description',
        isCustom: true,
        isActive: true,
        businesses: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      dto.onboardingStep = OnboardingStep.COMPLETED;
      dto.business_status = 'ACTIVE';
      dto.bankDetails = {
        bankCode: '090405',
        bankName: 'MONIEPOINT MICROFINANCE BANK',
        accountNumber: '8280061637',
        accountName: 'BLESSING ESAN',
        accountType: AccountType.POS,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      // Create wallet details
      dto.walletDetails = new WalletDetailsDto();
      dto.walletDetails.walletId = '12345';
      dto.walletDetails.address = '0x123456789';
      dto.walletDetails.network = 'testnet';
      dto.walletDetails.isEvmCompatible = true;
      dto.walletDetails.metadata = { user_id: 'e3dc6448-cf26-414a-ba2c-1cf5a6b507d6' };

      dto.user_Id = 'e3dc6448-cf26-414a-ba2c-1cf5a6b507d6';
      dto.createdAt = timestamp;
      dto.updatedAt = timestamp;
      
      // Assert
      // Verify the properties exist
      expect(dto).toHaveProperty('Business_id');
      expect(dto).toHaveProperty('name');
      expect(dto).toHaveProperty('phoneNumber');
      expect(dto).toHaveProperty('category');
      expect(dto).toHaveProperty('onboardingStep');
      expect(dto).toHaveProperty('business_status');
      expect(dto).toHaveProperty('bankDetails');
      expect(dto).toHaveProperty('walletDetails');
      expect(dto).toHaveProperty('user_Id');
      expect(dto).toHaveProperty('createdAt');
      expect(dto).toHaveProperty('updatedAt');
      
      // Verify properties that should not exist
      expect(dto).not.toHaveProperty('isActive');
      expect(dto).not.toHaveProperty('isVerified');
      expect(dto).not.toHaveProperty('categoryId');
      
      // Verify business_status is correct
      expect(dto.business_status).toBe('ACTIVE');
    });
    
    it('should match the expected sample response structure', () => {
      // Arrange
      const expectedResponse = {
        statusCode: 200,
        message: 'Success',
        data: {
          Business_id: '7dfe2c46-d0de-4b16-b6fa-9ad25cda90af',
          name: 'Seyi Idowu',
          phoneNumber: '067777777',
          category: {
            id: '2085118b-f5cc-4d09-adc9-9e46a868864f',
            name: '794494949',
            isCustom: true
          },
          onboardingStep: 'COMPLETED',
          business_status: 'ACTIVE',
          bankDetails: {
            bankCode: '090405',
            bankName: 'MONIEPOINT MICROFINANCE BANK',
            accountNumber: '8280061637',
            accountName: 'BLESSING ESAN',
            accountType: 'pos',
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
          },
          walletDetails: {
            walletId: '12345',
            address: '0x123456789',
            network: 'testnet',
            isEvmCompatible: true,
            metadata: expect.any(Object)
          },
          user_Id: 'e3dc6448-cf26-414a-ba2c-1cf5a6b507d6',
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        }
      };
      
      // Act
      const actualResponse = new BusinessResponseDto();
      const businessDto = new SimplifiedBusinessResponseDto();
      const timestamp = new Date().toISOString();
      
      businessDto.Business_id = '7dfe2c46-d0de-4b16-b6fa-9ad25cda90af';
      businessDto.name = 'Seyi Idowu';
      businessDto.phoneNumber = '067777777';
      businessDto.category = {
        id: '2085118b-f5cc-4d09-adc9-9e46a868864f',
        name: '794494949',
        description: 'Category description',
        isCustom: true,
        isActive: true,
        businesses: [],
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp)
      };
      businessDto.onboardingStep = OnboardingStep.COMPLETED;
      businessDto.business_status = 'ACTIVE';
      businessDto.bankDetails = {
        bankCode: '090405',
        bankName: 'MONIEPOINT MICROFINANCE BANK',
        accountNumber: '8280061637',
        accountName: 'BLESSING ESAN',
        accountType: AccountType.POS,
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp)
      };
      
      // Create wallet details
      businessDto.walletDetails = new WalletDetailsDto();
      businessDto.walletDetails.address = '0x123456789';
      businessDto.walletDetails.walletId = '12345';
      businessDto.walletDetails.network = 'testnet';
      businessDto.walletDetails.isEvmCompatible = true;
      businessDto.walletDetails.metadata = { user_id: 'e3dc6448-cf26-414a-ba2c-1cf5a6b507d6' };
      
      businessDto.user_Id = 'e3dc6448-cf26-414a-ba2c-1cf5a6b507d6';
      businessDto.createdAt = new Date(timestamp);
      businessDto.updatedAt = new Date(timestamp);
      
      actualResponse.statusCode = 200;
      actualResponse.message = 'Success';
      actualResponse.data = businessDto;
      
      // Convert dates to strings for comparison
      const actualResponseJson = JSON.parse(JSON.stringify(actualResponse));
      
      // Assert
      expect(actualResponseJson).toMatchObject(expectedResponse);
    });
  });
});
