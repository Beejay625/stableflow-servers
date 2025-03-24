import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BusinessService } from '../modules/business/business.service';
import { Logger } from '@nestjs/common';

async function checkBusinessWallet(businessId: string) {
  const logger = new Logger('CheckBusinessWallet');
  const app = await NestFactory.createApplicationContext(AppModule);
  const businessService = app.get(BusinessService);

  try {
    const businessResponse = await businessService.getBusinessById(businessId, null);
    const business = businessResponse.data;

    if (!business) {
      console.error(`Business ${businessId} not found`);
      process.exit(1);
    }

    console.log('Business Details:');
    console.log(`ID: ${business.Business_id}`);
    console.log(`Name: ${business.name}`);
    console.log(`Phone: ${business.phoneNumber}`);
    console.log(`Onboarding Step: ${business.onboardingStep}`);
    console.log(`Wallet Address: ${business.walletDetails?.address || 'Not set'}`);
    console.log(`Address ID: ${business.walletDetails?.addressId || 'Not set'}`);

    if (business.bankDetails) {
      console.log('\nBank Details:');
      console.log(`Bank code: ${business.bankDetails.bankCode || 'Not set'}`);
      console.log(`Bank name: ${business.bankDetails.bankName || 'Not set'}`);
      console.log(`Account number: ${business.bankDetails.accountNumber || 'Not set'}`);
      console.log(`Account name: ${business.bankDetails.accountName || 'Not set'}`);
      console.log(`Account type: ${business.bankDetails.accountType || 'Not set'}`);
    } else {
      console.log('\nNo bank details found');
    }

    console.log('\nBusiness Status:', business.business_status);
    console.log('Created:', business.createdAt);
    console.log('Updated:', business.updatedAt);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Get business ID from command line argument
const businessId = process.argv[2];
if (!businessId) {
  console.error('Please provide a business ID as a command line argument');
  process.exit(1);
}

checkBusinessWallet(businessId).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 