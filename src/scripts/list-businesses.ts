import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Business } from '../modules/business/entities/business.entity';
import { DataSource } from 'typeorm';

async function listBusinesses() {
  try {
    console.log('Listing all businesses in the database...');
    
    // Create a standalone application
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Get the DataSource from app context
    const dataSource = app.get(DataSource);
    
    // Get the business repository
    const businessRepository = dataSource.getRepository(Business);
    
    // Find all businesses
    const businesses = await businessRepository.find({
      order: {
        createdAt: 'DESC'
      },
      take: 10 // Limit to 10 most recent businesses
    });
    
    if (businesses.length === 0) {
      console.log('No businesses found in the database.');
    } else {
      console.log(`Found ${businesses.length} businesses:`);
      
      businesses.forEach((business, index) => {
        console.log(`\nBusiness #${index + 1}:`);
        console.log(`ID: ${business.id}`);
        console.log(`Name: ${business.name}`);
        console.log(`Onboarding step: ${business.onboardingStep}`);
        console.log(`Wallet address: ${business.walletAddress || 'Not set'}`);
        console.log(`Address ID: ${business.addressId || 'Not set'}`);
        console.log(`Owner ID: ${business.ownerId}`);
        console.log(`Created at: ${business.createdAt}`);
      });
    }
    
    // Close the application
    await app.close();
    
  } catch (error) {
    console.error('Error listing businesses:', error);
    process.exit(1);
  }
}

// Run the script
listBusinesses(); 