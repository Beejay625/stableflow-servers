import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Business } from '../modules/business/entities/business.entity';
import { DataSource } from 'typeorm';

async function checkBusinessWallet() {
  try {
    // Get business ID from command line
    const businessId = process.argv[2];
    
    if (!businessId) {
      console.error('Please provide a business ID as an argument');
      process.exit(1);
    }

    console.log(`Checking wallet details for business: ${businessId}`);
    
    // Create a standalone application
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Get the DataSource from app context
    const dataSource = app.get(DataSource);
    
    // Get the business repository
    const businessRepository = dataSource.getRepository(Business);
    
    // Find the business
    const business = await businessRepository.findOne({ where: { id: businessId } });
    
    if (!business) {
      console.error(`Business with ID ${businessId} not found`);
      process.exit(1);
    }
    
    console.log('Business details:');
    console.log(`ID: ${business.id}`);
    console.log(`Name: ${business.name}`);
    console.log(`Onboarding step: ${business.onboardingStep}`);
    console.log(`Wallet address: ${business.walletAddress || 'Not set'}`);
    console.log(`Address ID: ${business.addressId || 'Not set'}`);
    console.log(`Bank code: ${business.bankCode || 'Not set'}`);
    console.log(`Bank name: ${business.bankName || 'Not set'}`);
    console.log(`Account number: ${business.accountNumber || 'Not set'}`);
    console.log(`Account name: ${business.accountName || 'Not set'}`);
    
    // Close the application
    await app.close();
    
  } catch (error) {
    console.error('Error checking business wallet:', error);
    process.exit(1);
  }
}

// Run the check
checkBusinessWallet(); 