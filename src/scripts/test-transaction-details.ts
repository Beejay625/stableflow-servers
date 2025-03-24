import axios from 'axios';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
console.log(`Loading environment variables from ${envPath}`);
config({ path: envPath });
console.log(`Application running in ${nodeEnv.toUpperCase()} mode`);

/**
 * Direct script to fetch transaction details from BlockRadar API
 * 
 * Usage: npx ts-node src/scripts/test-transaction-details.ts <transactionId> [walletId]
 * 
 * Example: 
 * - npx ts-node src/scripts/test-transaction-details.ts 4ffd85d4-6ae3-42bd-a523-bd6ff7d1d5dd
 */

/**
 * Interface for extracted transaction data
 */
interface TransactionDetails {
  status: string;
  type: string;
  currency: string;
  senderAddress: string;
  recipientAddress: string;
  tokenName: string;
  tokenSymbol: string;
  blockchainName: string;
  blockchainSymbol: string;
  amount: string;
  amountPaid: string;
  convertedAmount: string;
  convertedGasFee: number;
  hash?: string;
  timestamp?: string;
}

// Get the transaction ID from command line arguments
const transactionId = process.argv[2];
// Get wallet ID from command line or environment variables
const walletId = process.argv[3] || process.env.BLOCKRADAR_WALLET_ID || process.env.WALLET_ID;
// Get API key from environment variables
const apiKey = process.env.BLOCKRADAR_API_KEY;

// Debug wallet ID and API key (don't show full API key for security)
if (apiKey) {
  console.log(`Using API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
} else {
  console.log('API Key not found in environment variables.');
}

console.log(`Using Wallet ID: ${walletId || 'Not provided'}`);

// Validate required parameters
if (!transactionId) {
  console.error('Transaction ID is required');
  console.error('Usage: npx ts-node src/scripts/test-transaction-details.ts <transactionId> [walletId]');
  process.exit(1);
}

if (!walletId) {
  console.error('Wallet ID must be provided as an argument or in BLOCKRADAR_WALLET_ID or WALLET_ID environment variable');
  process.exit(1);
}

if (!apiKey) {
  console.error('BLOCKRADAR_API_KEY environment variable is not set');
  process.exit(1);
}

// Main function to fetch transaction details
async function fetchTransactionDetails() {
  console.log(`Fetching details for Transaction ID: ${transactionId} from Wallet ID: ${walletId}`);

  try {
    // Construct the URL
    const baseUrl = 'https://api.blockradar.co/v1';
    const url = `${baseUrl}/wallets/${walletId}/transactions/${transactionId}`;
    console.log(`Fetching from: ${url}`);
    
    // Make the API request
    const response = await axios.get(url, {
      headers: { 'x-api-key': apiKey }
    });
    
    console.log('Response status:', response.status);
    
    if (!response.data) {
      console.error('Empty response from API');
      process.exit(1);
    }
    
    if (!response.data.data) {
      console.error('Response lacks data property:', JSON.stringify(response.data, null, 2));
      process.exit(1);
    }
    
    const transactionData = response.data.data;
    console.log('Transaction data received successfully');
    
    // Extract the required fields
    const extractedDetails: TransactionDetails = {
      status: transactionData.status,
      type: transactionData.type,
      currency: transactionData.currency,
      senderAddress: transactionData.senderAddress,
      recipientAddress: transactionData.recipientAddress,
      tokenName: transactionData.asset?.name,
      tokenSymbol: transactionData.asset?.symbol,
      blockchainName: transactionData.blockchain?.name,
      blockchainSymbol: transactionData.blockchain?.symbol,
      amount: transactionData.amount,
      amountPaid: transactionData.amountPaid,
      convertedAmount: transactionData.convertedAmount,
      convertedGasFee: transactionData.convertedGasFee,
      hash: transactionData.hash || transactionData.transactionHash,
      timestamp: transactionData.timestamp || transactionData.createdAt || new Date().toISOString()
    };
    
    // Display the extracted information
    console.log('\n===== TRANSACTION DETAILS =====');
    console.log(`Status: ${extractedDetails.status}`);
    console.log(`Type: ${extractedDetails.type}`);
    console.log(`Currency: ${extractedDetails.currency}`);
    console.log(`Sender Address: ${extractedDetails.senderAddress}`);
    console.log(`Recipient Address: ${extractedDetails.recipientAddress}`);
    console.log(`Token: ${extractedDetails.tokenName} (${extractedDetails.tokenSymbol})`);
    console.log(`Blockchain: ${extractedDetails.blockchainName} (${extractedDetails.blockchainSymbol})`);
    console.log(`Amount: ${extractedDetails.amount}`);
    console.log(`Amount Paid: ${extractedDetails.amountPaid}`);
    console.log(`Converted Amount: ${extractedDetails.convertedAmount}`);
    console.log(`Converted Gas Fee: ${extractedDetails.convertedGasFee}`);
    console.log(`Transaction Hash: ${extractedDetails.hash || 'N/A'}`);
    console.log(`Timestamp: ${extractedDetails.timestamp || 'N/A'}`);
    
    console.log('\nDone');
    
  } catch (error) {
    console.error('API request failed:');
    
    if (error.response) {
      // The request was made and the server responded with a status code outside the 2xx range
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server');
      console.error(error.request);
    } else {
      // Something happened in setting up the request
      console.error('Error message:', error.message);
    }
    
    console.error('\nPlease check your wallet ID and API key in the environment variables');
    process.exit(1);
  }
}

// Run the function
fetchTransactionDetails(); 