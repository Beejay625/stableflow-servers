import axios from 'axios';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
console.log(`Loading environment variables from ${envPath}`);
config({ path: envPath });
console.log(`Application running in ${nodeEnv.toUpperCase()} mode`);

// Get network from .env file (was already loaded by config() call above)
// No need to provide it with env NETWORK=mainnet when running the script
const network = process.env.NETWORK || 'mainnet';
console.log(`Using network: ${network} (from .env.${nodeEnv})`);

// Get token symbols from command line arguments
// Usage: npx ts-node ... [USDC] [USDT]
const tokenSymbols = process.argv.slice(2).map(symbol => symbol.toUpperCase());
console.log(`Filtering for tokens: ${tokenSymbols.length > 0 ? tokenSymbols.join(', ') : 'All supported stablecoins'}`);

interface TokenData {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  blockchainId: string;
  blockchainName: string;
  network: string;
}

const getTokenDetails = async (
  targetNetwork: string = 'mainnet',
  targetSymbols: string[] = []
): Promise<TokenData[]> => {
  const apiKey = process.env.BLOCKRADAR_API_KEY;
  
  if (!apiKey) {
    throw new Error('BLOCKRADAR_API_KEY environment variable is not set');
  }
  
  const url = 'https://api.blockradar.co/v1/assets';

  try {
    console.log(`Fetching token details from ${url}`);
    const response = await axios.get(url, {
      headers: { 'x-api-key': apiKey },
    });

    if (!response.data || !response.data.data) {
      console.error('Unexpected API response format:', response.data);
      return [];
    }

    const tokens = response.data.data;
    console.log(`Received ${tokens.length} tokens from API`);

    // Print all unique blockchain names and token symbols for reference
    const blockchainNames = [...new Set(tokens.map((token: any) => token.blockchain?.name))];
    const availableSymbols = [...new Set(tokens.map((token: any) => token.symbol?.toUpperCase()))];
    
    console.log('\nAvailable blockchain names:');
    console.log(blockchainNames);
    console.log('\nAvailable token symbols:');
    console.log(availableSymbols);

    // Filter tokens with case-insensitive matching
    const filteredTokens = tokens.filter((token: any) => {
      // Check if blockchain name contains any of our target chains (case insensitive)
      const blockchainMatches = token.blockchain?.name && 
        (token.blockchain.name.toLowerCase().includes('bnb') || 
         token.blockchain.name.toLowerCase().includes('tron') || 
         token.blockchain.name.toLowerCase() === 'base');
         
      // Check if network matches our target network
      const networkMatches = token.network === targetNetwork;
         
      // Check if token symbol matches any of our target symbols (if provided)
      // If no symbols are provided, include all supported stablecoins
      const symbolMatches = targetSymbols.length === 0 || 
        (token.symbol && targetSymbols.includes(token.symbol.toUpperCase()));
        
      return blockchainMatches && networkMatches && symbolMatches;
    });

    const networkFilterText = `${targetNetwork} network`;
    const symbolFilterText = targetSymbols.length > 0 
      ? targetSymbols.join(', ') 
      : 'all supported stablecoins';
    
    console.log(`\nFiltered to ${filteredTokens.length} tokens (${symbolFilterText} on ${networkFilterText})`);
    
    // Print the filtered tokens for reference
    if (filteredTokens.length > 0) {
      console.log('\nMatched tokens:');
      filteredTokens.forEach((token: any, index: number) => {
        console.log(`${index + 1}. ${token.name} (${token.symbol}) on ${token.blockchain?.name} (Network: ${token.network})`);
      });
    }

    return filteredTokens.map((token: any) => ({
      tokenId: token.id,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      blockchainId: token.blockchain?.id,
      blockchainName: token.blockchain?.name,
      network: token.network,
    }));
  } catch (error) {
    console.error('Error fetching token details:', error.response?.data || error.message);
    return [];
  }
};

// Main function to run the script
async function main() {
  try {
    console.log('Fetching token details...');
    const tokens = await getTokenDetails(network, tokenSymbols);
    
    if (tokens.length === 0) {
      console.log('No tokens matching the filter criteria found');
      return;
    }
    
    console.log('\nFound the following filtered tokens:');
    console.table(tokens);
  } catch (error) {
    console.error('Script execution failed:', error);
    process.exit(1);
  }
}

// Run the script
main().then(() => {
  console.log('Script completed successfully');
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 