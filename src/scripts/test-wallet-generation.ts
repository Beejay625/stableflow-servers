import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { WalletService } from "../modules/wallet/services/wallet.service";
import { BusinessService } from "../modules/business/services/business.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Business } from "../modules/business/entities/business.entity";
import { Repository } from "typeorm";

async function testWalletGeneration() {
  // Get business ID from command line
  const businessId = process.argv[2];
  const forceOption = process.argv[3] === "force";

  if (!businessId) {
    console.error("Please provide a business ID as an argument");
    console.error(
      "Usage: npx ts-node -r tsconfig-paths/register src/scripts/test-wallet-generation.ts <businessId> [force]",
    );
    console.error(
      "  - businessId: ID of the business to test wallet generation",
    );
    console.error(
      '  - force: Optional "force" parameter to force wallet regeneration even if business already has one',
    );
    process.exit(1);
  }

  console.log(
    `Testing wallet generation for business: ${businessId}${forceOption ? " (force mode)" : ""}`,
  );

  // Create a standalone application
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    // Get the business service and wallet service
    const businessService = app.get(BusinessService);
    const walletService = app.get(WalletService);
    const businessRepository = app.get("BusinessRepository");

    // Get the business initial state
    const businessResponse = await businessService.getBusinessById(
      businessId,
      null,
    );
    const business = businessResponse.data;

    console.log("Business details:");
    console.log(`ID: ${business.Business_id}`);
    console.log(`Name: ${business.name}`);
    console.log(`Onboarding step: ${business.onboardingStep}`);
    console.log(
      `Current wallet address: ${business.walletDetails?.address || "Not set"}`,
    );
    console.log(
      `Current address ID: ${business.walletDetails?.addressId || "Not set"}`,
    );

    if (business.walletDetails && !forceOption) {
      console.log(
        '\nBusiness already has a wallet. Use "force" option to regenerate.',
      );
      console.log(
        "Example: npx ts-node -r tsconfig-paths/register src/scripts/test-wallet-generation.ts <businessId> force",
      );
      process.exit(0);
    }

    if (forceOption && business.walletDetails) {
      console.log(
        "\nForce option detected. Clearing existing wallet details...",
      );
      await businessRepository.update(
        { id: businessId },
        { walletAddress: null, addressId: null },
      );
      console.log(
        "Wallet details cleared. Proceeding with new wallet generation.",
      );
    }

    // Check if the business is ready for wallet generation
    console.log("\nChecking if business is ready for wallet generation...");
    const isReady = await walletService.isBusinessReadyForWallet(businessId);

    if (isReady) {
      console.log("\nBusiness is ready for wallet generation!");

      // Generate wallet
      console.log("\nGenerating wallet...");
      const result =
        await walletService.generateWalletForCompletedBusiness(businessId);

      // If we made it here, generation was successful
      console.log("\nWallet generation successful!");
      console.log(`Wallet address: ${result.data.address}`);
      console.log(`Wallet ID: ${result.data.id}`);
      console.log(`Network: ${result.data.network}`);
      console.log(
        `Is EVM compatible: ${result.data.blockchain?.isEvmCompatible}`,
      );

      // Get the updated business to verify wallet was saved
      const updatedBusinessResponse = await businessService.getBusinessById(
        businessId,
        null,
      );
      const updatedBusiness = updatedBusinessResponse.data;

      console.log("\nUpdated business details after wallet generation:");
      console.log(`ID: ${updatedBusiness.Business_id}`);
      console.log(`Name: ${updatedBusiness.name}`);
      console.log(`Onboarding step: ${updatedBusiness.onboardingStep}`);
      console.log(
        `Current wallet address: ${updatedBusiness.walletDetails?.address || "Not set"}`,
      );
      console.log(
        `Current address ID: ${updatedBusiness.walletDetails?.addressId || "Not set"}`,
      );

      if (
        updatedBusiness.walletDetails?.address &&
        updatedBusiness.walletDetails?.addressId
      ) {
        console.log("\n✅ Wallet details successfully saved to business!");
      } else {
        console.log("\n❌ Wallet details were NOT saved to business!");
      }
    } else {
      console.log("\nBusiness is NOT ready for wallet generation:");
      console.log("- Business must be in COMPLETED onboarding step");
      console.log("- Business must not have an existing wallet address");
    }
  } catch (error) {
    console.error("\nError during wallet generation test:", error.message);
    if (error.response) {
      console.error(
        "API Error Response:",
        JSON.stringify(error.response.data, null, 2),
      );
    }
  } finally {
    // Ensure app is closed in all cases
    await app.close();
  }
}

// Run the test
testWalletGeneration();
