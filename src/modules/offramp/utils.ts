import { Token } from './interfaces/transaction.interface';
import axios from 'axios';
import * as crypto from 'crypto';

// Import PublicKeyResponse interface or define it here
import { PublicKeyResponse } from './interfaces/response.interface';

/**
 * Maps environment network configuration and chain to actual network names
 * @param configNetwork - The network value from environment config
 * @param chain - The blockchain network from the transaction
 * @returns The actual network name used in the system
 */
function mapNetworkFromConfig(configNetwork: string, chain?: string): string {
  console.log(`[DEBUG] mapNetworkFromConfig called with configNetwork=${configNetwork}, chain=${chain || 'not provided'}`);
  
  // First check if chain is specified
  if (chain) {
    // Handle Base chain explicitly
    if (chain.toLowerCase() === 'base') {
      const result = configNetwork === 'mainnet' ? 'Base' : 'Base Sepolia';
      console.log(`[DEBUG] Chain is 'base', returning ${result} based on configNetwork=${configNetwork}`);
      return result;
    }
    
    // Handle BNB Smart Chain explicitly
    if (chain.toLowerCase().includes('bnb') || chain.toLowerCase().includes('binance')) {
      const result = configNetwork === 'mainnet' ? 'BNB Smart Chain' : 'BNB Smart Chain Testnet';
      console.log(`[DEBUG] Chain contains 'bnb' or 'binance', returning ${result} based on configNetwork=${configNetwork}`);
      return result;
    }
  }

  // Default mapping based on config only (when chain is not provided)
  let result;
  switch (configNetwork) {
    case 'mainnet':
      result = 'BNB Smart Chain'; // Default to BNB Smart Chain if no chain specified
      break;
    case 'testnet':
      result = 'BNB Smart Chain Testnet';
      break;
    case 'base':
      result = 'Base';
      break;
    case 'base-testnet':
      result = 'Base Sepolia';
      break;
    default:
      console.log(`[DEBUG] Unsupported network configuration: ${configNetwork}`);
      throw new Error(`Unsupported network configuration: ${configNetwork}`);
  }
  
  console.log(`[DEBUG] No specific chain match, falling back to config mapping: ${configNetwork} -> ${result}`);
  return result;
}

/**
 * Fetches supported tokens for a network
 * @param network - The network to fetch tokens for
 * @returns Array of supported tokens for the network or undefined if network not supported
 */
function fetchSupportedTokens(network: string): Token[] | undefined {
  const tokens: { [key: string]: Token[] } = {
    Base: [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        rpcUrl: "https://mainnet.base.org",
        chainId: 8453
      },
    ],
    "Base Sepolia": [
      {
        name: "USD Coin Testnet",
        symbol: "USDC",
        decimals: 6,
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        rpcUrl: "https://sepolia.base.org",
        chainId: 84532
      },
      {
        name: "Dai",
        symbol: "DAI",
        decimals: 18,
        address: "0x7683022d84f726a96c4a6611cd31dbf5409c0ac9",
        rpcUrl: "https://sepolia.base.org",
        chainId: 84532
      },
    ],
    "BNB Smart Chain": [
      {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 18,
        address: "0x55d398326f99059fF775485246999027B3197955",
        rpcUrl: "https://bsc-dataseed.binance.org",
        chainId: 56
      },
    ],
    "BNB Smart Chain Testnet": [
      {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 18,
        address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
        rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
        chainId: 97
      },
    ],
  };
  return tokens[network];
}

/**
 * Gets the appropriate gateway contract address based on network
 * @param network - The network name (e.g., 'Base', 'BNB Smart Chain', 'Base Sepolia', 'BNB Smart Chain Testnet')
 * @returns The gateway contract address for the specified network
 * @throws Error if network is not supported
 */
function getGatewayAddressForNetwork(network: string): string {
  const addresses: { [key: string]: string } = {
    'Base': "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f", // Base Mainnet
    'BNB Smart Chain': "0x1FA0EE7F9410F6fa49B7AD5Da72Cf01647090028", // BNB Smart Chain Mainnet
    'Base Sepolia': "0x847dfdaa218f9137229cf8424378871a1da8f625", // Base Testnet
    'BNB Smart Chain Testnet': "0x0000000000000000000000000000000000000000" // BNB Smart Chain Testnet
  };

  const address = addresses[network];
  if (!address) {
    throw new Error(`Unsupported network: ${network}`);
  }

  return address;
}

/**
 * Fetches a token's address for a specific network and symbol
 * @param network - The network to fetch the token address from
 * @param symbol - The token symbol (e.g., 'USDC', 'USDT', 'DAI')
 * @returns The token address
 * @throws Error if network is not supported or token is not found
 */
function getTokenAddress(network: string, symbol: string): string {
  console.log(`[DEBUG] Looking for token ${symbol} on network ${network}`);
  
  // Get tokens for the specified network
  const tokens = fetchSupportedTokens(network);
  if (!tokens) {
    console.log(`[DEBUG] Network not supported: ${network}`);
    throw new Error(`Unsupported network: ${network}`);
  }

  console.log(`[DEBUG] Available tokens on ${network}: ${tokens.map(t => t.symbol).join(', ')}`);

  // Find the token by symbol (case insensitive)
  const token = tokens.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
  if (!token) {
    console.log(`[DEBUG] Token ${symbol} not found on network ${network}`);
    throw new Error(`Token ${symbol} not found on network ${network}`);
  }

  console.log(`[DEBUG] Found token address for ${symbol}: ${token.address} on network ${network}`);
  return token.address;
}

/**
 * Writes to a contract using BlockRadar API
 * @param params - Parameters for contract interaction
 * @returns Promise resolving to the API response
 * @throws Error if the API call fails
 */
async function customSmartContractWrite({
  walletId,
  addressId,
  apiKey,
  abi,
  address,
  method,
  parameters,
}: {
  walletId: string;
  addressId: string;
  apiKey: string;
  abi: object[];
  address: string;
  method: string;
  parameters: string[];
}): Promise<any> {
  try {
    // Validate required parameters
    if (!walletId) {
      throw new Error('Missing walletId for smart contract write');
    }
    
    if (!addressId) {
      throw new Error('Missing addressId for smart contract write');
    }
    
    if (!apiKey) {
      throw new Error('Missing apiKey for smart contract write');
    }
    
    // Log request details (without sensitive information)
    console.log(`[DEBUG] Smart contract write request: method=${method}, address=${address}`);
    console.log(`[DEBUG] Using walletId=${walletId}, addressId=${addressId}`);
    console.log(`[DEBUG] Parameters: ${JSON.stringify(parameters)}`);
    
    const response = await axios.post(
      `https://api.blockradar.co/v1/wallets/${walletId}/addresses/${addressId}/contracts/write`,
      {
        abi,
        address,
        method,
        parameters,
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    // Enhanced error logging with complete API response
    if (axios.isAxiosError(error) && error.response) {
      const errorMessage = `API error (${error.response.status}): ${error.message}`;
      const responseData = error.response.data ? 
        `Response data: ${JSON.stringify(error.response.data)}` : 
        'No response data available';
      
      // Create a more detailed error that includes the API response data
      const enhancedError = new Error(`${errorMessage}. ${responseData}`);
      
      // Copy the original stack trace
      if (error.stack) {
        enhancedError.stack = error.stack;
      }
      
      throw enhancedError;
    }
    
    // For non-Axios errors, just rethrow
    throw error;
  }
}

/**
 * Reads from a contract using BlockRadar API
 * @param params - Parameters for contract interaction
 * @returns Promise resolving to the API response
 * @throws Error if the API call fails
 */
async function customSmartContractRead({
  walletId,
  addressId,
  apiKey,
  abi,
  address,
  method,
  parameters,
}: {
  walletId: string;
  addressId: string;
  apiKey: string;
  abi: object[];
  address: string;
  method: string;
  parameters: string[];
}): Promise<any> {
  try {
    // Validate required parameters
    if (!walletId) {
      throw new Error('Missing walletId for smart contract read');
    }
    
    if (!addressId) {
      throw new Error('Missing addressId for smart contract read');
    }
    
    if (!apiKey) {
      throw new Error('Missing apiKey for smart contract read');
    }
    
    // Log request details (without sensitive information)
    console.log(`[DEBUG] Smart contract read request: method=${method}, address=${address}`);
    console.log(`[DEBUG] Using walletId=${walletId}, addressId=${addressId}`);
    console.log(`[DEBUG] Parameters: ${JSON.stringify(parameters)}`);
    
    const response = await axios.post(
      `https://api.blockradar.co/v1/wallets/${walletId}/addresses/${addressId}/contracts/read`,
      {
        abi,
        address,
        method,
        parameters,
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    // Enhanced error logging with complete API response
    if (axios.isAxiosError(error) && error.response) {
      const errorMessage = `API error (${error.response.status}): ${error.message}`;
      const responseData = error.response.data ? 
        `Response data: ${JSON.stringify(error.response.data)}` : 
        'No response data available';
      
      // Create a more detailed error that includes the API response data
      const enhancedError = new Error(`${errorMessage}. ${responseData}`);
      
      // Copy the original stack trace
      if (error.stack) {
        enhancedError.stack = error.stack;
      }
      
      throw enhancedError;
    }
    
    // For non-Axios errors, just rethrow
    throw error;
  }
}

/**
 * Gets token information by address
 * @param tokenAddress The token address to look up
 * @returns Token information or null if not found
 */
function getTokenInfoByAddress(tokenAddress: string): Token | null {
  // Normalize the address
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check all supported networks
  const networks = [
    'Base',
    'Base Sepolia',
    'BNB Smart Chain',
    'BNB Smart Chain Testnet'
  ];
  
  for (const network of networks) {
    const tokens = fetchSupportedTokens(network);
    if (!tokens) continue;
    
    const token = tokens.find(t => t.address.toLowerCase() === normalizedAddress);
    if (token) {
      return token;
    }
  }
  
  return null;
}

/**
 * Fetches the aggregator's public key for encrypting sensitive recipient data.
 * The key is used to ensure recipient banking details are securely transmitted.
 * 
 * @param aggregatorUrl - Base URL of the aggregator API
 * @returns Promise<PublicKeyResponse> - Contains the public key and status
 * @throws Error if unable to fetch or validate the public key
 */
async function fetchAggregatorPublicKey(aggregatorUrl: string): Promise<PublicKeyResponse> {
  try {
    const response = await axios.get<PublicKeyResponse>(`${aggregatorUrl}/pubkey`);
    
    if (response.data.status !== 'success') {
      throw new Error(`Failed to fetch public key: ${response.data.message}`);
    }
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `API error fetching aggregator public key: ${error.message}`,
        error.response?.data
      );
      throw new Error(`Failed to fetch aggregator public key: ${error.message} - ${JSON.stringify(error.response?.data)}`);
    }
    
    console.error(`Error fetching aggregator public key: ${error.message}`);
    throw new Error(`Failed to fetch aggregator public key: ${error.message}`);
  }
}

/**
 * Encrypts recipient data using RSA-OAEP padding for secure transmission.
 * 
 * Security Features:
 * - Uses RSA-OAEP padding (more secure than PKCS#1 v1.5)
 * - Converts data to JSON before encryption
 * - Returns Base64 encoded encrypted data
 * 
 * @param data - Recipient data to encrypt (account details, etc.)
 * @param publicKeyPEM - PEM formatted public key from aggregator
 * @returns string - Base64 encoded encrypted data
 * @throws Error if encryption fails
 */
function publicKeyEncrypt(data: unknown, publicKeyPEM: string): string {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPEM);
    const buffer = Buffer.from(JSON.stringify(data));
    
    // Using RSA-OAEP padding which is more secure than PKCS#1 v1.5
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      buffer
    );
    
    return encrypted.toString('base64');
  } catch (error) {
    console.error(`Failed to encrypt data: ${error.message}`);
    throw new Error(`Failed to encrypt data: ${error.message}`);
  }
}

export { 
  fetchSupportedTokens,
  getGatewayAddressForNetwork,
  customSmartContractWrite,
  customSmartContractRead,
  mapNetworkFromConfig,
  getTokenAddress,
  getTokenInfoByAddress,
  fetchAggregatorPublicKey,
  publicKeyEncrypt
};
