import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BusinessService } from '../modules/business/services/business.service';

async function getBusinessResponse() {
  try {
    // Get business ID from command line
    const businessId = process.argv[2];
    
    if (!businessId) {
      console.error('Please provide a business ID as an argument');
      process.exit(1);
    }

    console.log(`Getting business response for: ${businessId}`);
    
    // Create a standalone application
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Get the business service
    const businessService = app.get(BusinessService);
    
    // Get the business by ID
    const ownerIdParam = process.argv[3] || null; // Optional owner ID
    const businessResponse = await businessService.getBusinessById(businessId, ownerIdParam);
    
    // Print the response
    console.log('\nBusiness Response:');
    console.log(JSON.stringify(businessResponse, null, 2));
    
    // Specifically check wallet details
    console.log('\nWallet Details:');
    if (businessResponse?.data?.walletDetails) {
      console.log(JSON.stringify(businessResponse.data.walletDetails, null, 2));
    } else {
      console.log('No wallet details in response');
    }
    
    // Close the application
    await app.close();
    
  } catch (error) {
    console.error('Error getting business response:', error);
    process.exit(1);
  }
}

// Run the script
getBusinessResponse(); 