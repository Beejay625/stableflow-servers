import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TokenService } from '../modules/wallet/services/token.service';
import { firstValueFrom } from 'rxjs';

/**
 * Test script to fetch token balances from BlockRadar API
 * 
 * Usage: npx ts-node -r tsconfig-paths/register src/scripts/test-token-balances.ts <walletId> <addressId> [tokenId1 tokenId2 ...]
 * 
 * Examples: 
 * - Get all supported tokens: npx ts-node -r tsconfig-paths/register src/scripts/test-token-balances.ts <walletId> <addressId>
 * - Get specific tokens: npx ts-node -r tsconfig-paths/register src/scripts/test-token-balances.ts <walletId> <addressId> 13446c1b-748b-4c42-bcf0-b2b6af5c6170 fb9e3baf-57de-43b7-9201-220bfc87e779
 */

/**
 * Interface for token balance data
 */
interface TokenBalance {
  tokenName: string;
  tokenSymbol: string;
  tokenId: string;
  balance: string;
  convertedBalance: string;
  blockchain: string;
  blockchainId: string;
  address: string;
}

/**
 * No hardcoded token IDs - we'll get them from TokenService instead
 */

async function testTokenBalances() {
  // Get wallet ID and address ID from command line arguments
  const walletId = process.argv[2];
  const addressId = process.argv[3];
  // Any additional arguments are treated as token IDs
  const tokenIdArgs = process.argv.slice(4);

  if (!walletId || !addressId) {
    console.error('Usage: npx ts-node -r tsconfig-paths/register src/scripts/test-token-balances.ts <walletId> <addressId> [tokenId1 tokenId2 ...]');
    console.error('Examples:');
    console.error('  - Get all supported tokens: npx ts-node -r tsconfig-paths/register src/scripts/test-token-balances.ts <walletId> <addressId>');
    console.error('  - Get specific tokens: npx ts-node -r tsconfig-paths/register src/scripts/test-token-balances.ts <walletId> <addressId> 13446c1b-748b-4c42-bcf0-b2b6af5c6170 fb9e3baf-57de-43b7-9201-220bfc87e779');
    process.exit(1);
  }

  console.log(`Fetching balances for Wallet ID: ${walletId}, Address ID: ${addressId}`);
  console.log(`Using network from .env file: ${process.env.NETWORK || 'not set'}`);

  try {
    // Create a standalone application context
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Get HttpService and ConfigService from the application context
    const httpService = app.get(HttpService);
    const configService = app.get(ConfigService);
    const tokenService = app.get(TokenService);
    
    // Get API key from configuration
    const apiKey = configService.get<string>('blockradar.apiKey');
    if (!apiKey) {
      throw new Error('BlockRadar API key is not configured');
    }
    
    // Get token IDs from tokenService or from command line arguments
    let tokenIds: string[] = [];
    
    if (tokenIdArgs.length > 0) {
      console.log(`Using custom token IDs from command line: ${tokenIdArgs.join(', ')}`);
      tokenIds = tokenIdArgs;
    } else {
      // Get supported platform tokens from TokenService
      console.log('Fetching supported platform tokens from TokenService...');
      const supportedTokens = await tokenService.getSupportedPlatformTokens();
      
      tokenIds = supportedTokens.map(token => token.tokenId);
      
      console.log(`Using platform supported tokens (${tokenIds.length}):`);
      supportedTokens.forEach(token => {
        console.log(`- ${token.tokenSymbol} on ${token.blockchainName} (ID: ${token.tokenId})`);
      });
    }
    
    if (tokenIds.length === 0) {
      console.log('Warning: No token IDs found. Check if TokenService is configured correctly.');
    }
    
    // Get token details first to be able to show information about the tokens we're filtering for
    console.log('Fetching token details from API...');
    
    // Fetch all tokens to get details about the tokens we're filtering
    const allTokens = await firstValueFrom(
      httpService.get('https://api.blockradar.co/v1/assets', {
        headers: { 'x-api-key': apiKey }
      })
    );
    
    if (!allTokens.data || !allTokens.data.data) {
      console.error('Could not fetch token details');
    } else {
      const tokenDetails = allTokens.data.data.filter((token: any) => 
        tokenIds.includes(token.id)
      );
      
      if (tokenDetails.length > 0) {
        console.log('Filtering for the following tokens:');
        tokenDetails.forEach((token: any) => {
          console.log(`- ${token.symbol} on ${token.blockchain.name} (ID: ${token.id})`);
          console.log(`  Address: ${token.address}`);
        });
      } else {
        console.log('Warning: None of the specified token IDs were found in the API');
      }
    }
    
    // Construct the URL for the balances API
    const url = `https://api.blockradar.co/v1/wallets/${walletId}/addresses/${addressId}/balances`;
    
    // Make the API call
    console.log(`Calling ${url} to fetch balances...`);
    const response = await firstValueFrom(
      httpService.get(url, {
        headers: { 'x-api-key': apiKey }
      })
    );
    
    if (!response.data || !response.data.data) {
      console.error('Unexpected API response format');
      console.log('Response:', JSON.stringify(response.data, null, 2));
      process.exit(1);
    }
    
    // Store the raw response for debugging
    console.log('API Response received with', response.data.data.length, 'token balances');
    
    // Process the balances
    const balances = response.data.data;
    const tokenBalances: TokenBalance[] = [];
    
    // Extract the relevant balances
    for (const balance of balances) {
      // The API response has a nested structure: balance.asset.asset contains the token details
      const token = balance.asset?.asset;
      const blockchain = token?.blockchain;
      
      // Skip if token doesn't have required data
      if (!token || !blockchain) {
        console.log('Skipping token with missing data:', balance);
        continue;
      }
      
      const tokenId = token.id;
      const symbol = token.symbol;
      const blockchainName = blockchain.name;
      
      console.log(`Found token: ${symbol} on ${blockchainName} (ID: ${tokenId})`);
      
      // Check if this token matches any of our target token IDs
      if (!tokenIds.includes(tokenId)) {
        console.log(`Token ID ${tokenId} is not in the filter list`);
        continue;
      }
      
      console.log(`Found matching token ID: ${tokenId}`);
      
      tokenBalances.push({
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenId: tokenId,
        balance: balance.balance || '0',
        convertedBalance: balance.convertedBalance || '0',
        blockchain: blockchainName,
        blockchainId: blockchain.id || 'Unknown',
        address: token.address || 'Unknown'
      });
    }
    
    // Display the results
    if (tokenBalances.length === 0) {
      console.log('No matching token balances found for this address');
    } else {
      console.log('\n===== MATCHING TOKEN BALANCES =====');
      
      tokenBalances.forEach(token => {
        console.log(`\n${token.tokenSymbol} on ${token.blockchain}:`);
        console.log(`- Token Name: ${token.tokenName}`);
        console.log(`- Token Symbol: ${token.tokenSymbol}`);
        console.log(`- Token ID: ${token.tokenId}`);
        console.log(`- Blockchain: ${token.blockchain}`);
        console.log(`- Blockchain ID: ${token.blockchainId}`);
        console.log(`- Token Address: ${token.address}`);
        console.log(`- Balance: ${token.balance}`);
        console.log(`- Converted Balance: ${token.convertedBalance}`);
      });
      
      console.log('\n===== SUMMARY =====');
      const summary = tokenBalances.map(t => 
        `${t.tokenSymbol} on ${t.blockchain}: ${t.balance} (${t.convertedBalance} USD)`
      );
      summary.forEach(s => console.log(s));
    }
    
    // Close the application context
    await app.close();
    console.log('\nScript completed successfully');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
testTokenBalances(); 