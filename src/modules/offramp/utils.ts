import { Token } from './interfaces/transaction.interface';
import fetch from 'node-fetch';

/**
 * Maps environment network configuration to actual network names
 * @param configNetwork - The network value from environment config
 * @returns The actual network name used in the system
 */
function mapNetworkFromConfig(configNetwork: string): string {
  switch (configNetwork) {
    case 'mainnet':
      return 'BNB Smart Chain';
    case 'testnet':
      return 'BNB Smart Chain Testnet';
    case 'base':
      return 'Base';
    case 'base-testnet':
      return 'Base Sepolia';
    default:
      throw new Error(`Unsupported network configuration: ${configNetwork}`);
  }
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
      },
    ],
    "Base Sepolia": [
      {
        name: "Dai",
        symbol: "DAI",
        decimals: 18,
        address: "0x7683022d84f726a96c4a6611cd31dbf5409c0ac9",
      },
    ],
    "BNB Smart Chain": [
      {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 18,
        address: "0x55d398326f99059fF775485246999027B3197955",
      },
    ],
    "BNB Smart Chain Testnet": [
      {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 18,
        address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
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
    'Base': "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f",
    'BNB Smart Chain': "0x1FA0EE7F9410F6fa49B7AD5Da72Cf01647090028",
    'Base Sepolia': "0x847dfdaa218f9137229cf8424378871a1da8f625",
    'BNB Smart Chain Testnet': "0x0000000000000000000000000000000000000000"
  };

  const address = addresses[network];
  if (!address) {
    throw new Error(`Unsupported network: ${network}`);
  }

  return address;
}

/**
 * Fetches a token's address for a specific network
 * @param network - The network to fetch the token address from
 * @param symbol - The token symbol (e.g., 'USDC', 'USDT', 'DAI')
 * @returns The token address
 * @throws Error if network is not supported or token is not found
 */
function getTokenAddress(network: string, symbol: string): string {
  const tokens = fetchSupportedTokens(network);
  if (!tokens) {
    throw new Error(`Unsupported network: ${network}`);
  }

  const token = tokens.find(t => t.symbol === symbol);
  if (!token) {
    throw new Error(`Token ${symbol} not found on network ${network}`);
  }

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
  const options = {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      abi,
      address,
      method,
      parameters,
    }),
  };

  const response = await fetch(`https://api.blockradar.co/v1/wallets/${walletId}/addresses/${addressId}/contracts/write`, options);
  if (!response.ok) {
    throw new Error(`Failed to write contract: ${response.statusText}`);
  }
  return response.json();
}

export { 
  fetchSupportedTokens,
  getGatewayAddressForNetwork,
  customSmartContractWrite,
  mapNetworkFromConfig,
  getTokenAddress
};
