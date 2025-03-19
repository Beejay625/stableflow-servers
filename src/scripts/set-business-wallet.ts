import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Business } from '../modules/business/entities/business.entity';
import { DataSource } from 'typeorm';

async function setBusinessWallet() {
  try {
    // Get business ID from command line
    const businessId = process.argv[2];
    const walletAddress = process.argv[3];
    const walletId = process.argv[4];
    
    if (!businessId || !walletAddress || !walletId) {
      console.error('Please provide businessId, walletAddress, and walletId as arguments');
      process.exit(1);
    }

    console.log(`Setting wallet details for business: ${businessId}`);
    console.log(`Wallet Address: ${walletAddress}`);
    console.log(`Wallet ID: ${walletId}`);
    
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
    
    console.log('Current business details:');
    console.log(`ID: ${business.id}`);
    console.log(`Name: ${business.name}`);
    console.log(`Onboarding step: ${business.onboardingStep}`);
    console.log(`Wallet address: ${business.walletAddress || 'Not set'}`);
    console.log(`Wallet ID: ${business.walletId || 'Not set'}`);
    
    // Update the business with wallet details
    business.walletAddress = walletAddress;
    business.walletId = walletId;
    
    // Save the updated business
    await businessRepository.save(business);
    
    // Verify the update
    const updatedBusiness = await businessRepository.findOne({ where: { id: businessId } });
    
    console.log('\nUpdated business details:');
    console.log(`ID: ${updatedBusiness.id}`);
    console.log(`Name: ${updatedBusiness.name}`);
    console.log(`Onboarding step: ${updatedBusiness.onboardingStep}`);
    console.log(`Wallet address: ${updatedBusiness.walletAddress || 'Not set'}`);
    console.log(`Wallet ID: ${updatedBusiness.walletId || 'Not set'}`);
    
    // Close the application
    await app.close();
    
    console.log('\nWallet details set successfully!');
    
  } catch (error) {
    console.error('Error setting business wallet:', error);
    process.exit(1);
  }
}

// Run the script
setBusinessWallet(); 