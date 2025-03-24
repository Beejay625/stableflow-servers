import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { ethers } from 'ethers';

import { Transaction as WalletTransaction } from '../wallet/entities/transaction.entity';
import { Business } from '../business/entities/business.entity';
import { Transaction, TransactionStatus } from './interfaces/transaction.interface';
import { OrderStatusResponse, PublicKeyResponse } from './interfaces/response.interface';
import { gatewayAbi, erc20Abi } from './abis/abi';
import { 
  fetchSupportedTokens, 
  getGatewayAddressForNetwork,
  customSmartContractWrite,
  mapNetworkFromConfig,
  getTokenAddress
} from './utils';

/**
 * Service responsible for handling cryptocurrency off-ramping operations.
 * Manages the process of converting cryptocurrencies to fiat currencies through:
 * 1. Token approvals
 * 2. Order creation
 * 3. Transaction monitoring
 * 4. Status updates
 */
@Injectable()
export class OfframpService {
  private readonly logger = new Logger(OfframpService.name);
  private readonly aggregatorUrl: string;
  private readonly ngnProviderId: string;
  private readonly kesProviderId: string;
  private readonly provider: ethers.JsonRpcProvider;
  private readonly walletId: string;
  private readonly addressId: string;
  private readonly apiKey: string;
  private readonly network: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>
  ) {
    this.aggregatorUrl = this.configService.get<string>('paycrest.baseUrl');
    this.ngnProviderId = this.configService.get<string>('NGN_PROVIDER_ID');
    this.kesProviderId = this.configService.get<string>('KES_PROVIDER_ID');
    this.walletId = this.configService.get<string>('blockradar.walletId');
    this.apiKey = this.configService.get<string>('paycrest.apiKey');
    
    // Get the network configuration and map it to the appropriate network name
    const configNetwork = this.configService.get<string>('blockradar.network');
    this.network = mapNetworkFromConfig(configNetwork);
    
    // Initialize ethers provider with appropriate RPC URL
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    this.logger.log(`Initialized OfframpService with network: ${this.network}`);
  }

  /**
   * Creates an offramp order for converting cryptocurrency to fiat.
   * 
   * Worker Process Flow:
   * 1. Worker fetches pending transactions from database that need offramping
   * 2. For each transaction:
   *    - Gets token amount ,token itself and currency and recipient details needed for the transaction
   *    - Uses transaction ID as memo for tracking
   *    - Fetches business wallet details for token spending
   * 3. Initiates the offramp process
   * 
   * Offramp Flow:
   * 1. Validates transaction data and network support
   * 2. Approves token spending (ERC20 approve)
   * 3. Encrypts recipient data for privacy
   * 4. Creates the order on the gateway contract
   * 
   * Database Fields Used:
   * - transaction.id (used as memo for tracking)
   * - transaction.amount (token amount to offramp)
   * - transaction.token (token symbol)
   * - transaction.recipientDetails (bank account info)
   * - transaction.businessWallet (wallet holding the tokens)
   * 
   * @param transaction - Contains token, amount, recipient, and currency details
   * @returns Promise<string> - Transaction hash of the created order
   * @throws Error if transaction data is invalid or network unsupported
   */
  async createOrder(transaction: Transaction): Promise<string> {
    try {
      this.logger.log(`Creating offramp order for transaction: ${transaction.id}`);

      // Validate transaction data
      if (!transaction || !transaction.token || !transaction.amount || !transaction.currency) {
        this.logger.error(`Invalid transaction data for offramp processing: ${JSON.stringify(transaction)}`);
        throw new Error('Invalid transaction data for offramp processing');
      }

      // Get the gateway address for current network
      const gatewayAddress = getGatewayAddressForNetwork(this.network);
      
      // Fetch supported tokens
      const supportedTokens = fetchSupportedTokens(this.network);
      if (!supportedTokens) {
        throw new Error(`Unsupported network: ${this.network}`);
      }

      // Step 1: Approve token spending and get transaction hash
      const approvalTx = await this.approveTokenSpending({
        tokenAddress: getTokenAddress(this.network, transaction.token),
        spenderAddress: gatewayAddress,
        amount: transaction.amount.toString(),
      });

      this.logger.log(`Token approval transaction hash: ${approvalTx.txHash}`);

      // Step 2: Wait for a short time to ensure the approval is processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Prepare recipient data
      const recipient = {
        accountIdentifier: transaction.accountIdentifier,
        accountName: transaction.recipientName,
        institution: transaction.institution,
        providerId: transaction.currency === 'NGN' ? this.ngnProviderId : this.kesProviderId,
        memo: transaction.memo || '',
      };

      // Step 4: Encrypt recipient data using aggregator's public key
      const publicKey = await this.fetchAggregatorPublicKey();
      const encryptedRecipient = this.publicKeyEncrypt(recipient, publicKey.data);

      // Step 5: Create the order
      const txResponse = await customSmartContractWrite({
        walletId: this.walletId,
        addressId: this.addressId,
        apiKey: this.apiKey,
        abi: gatewayAbi as unknown as object[],
        address: gatewayAddress,
        method: 'createOrder',
        parameters: [
          getTokenAddress(this.network, transaction.token),
          transaction.amount.toString(),
          encryptedRecipient,
          transaction.refundAddress
        ],
      });

      this.logger.log(`Offramp order creation initiated, txHash: ${txResponse.txHash}`);
      return txResponse.txHash;
    } catch (error) {
      this.logger.error(`Error creating offramp order: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Retrieves the order ID from a transaction using multiple fallback methods.
   * 
   * Fallback Strategy:
   * 1. Attempts to fetch from API (faster, preferred method)
   * 2. Falls back to blockchain logs if API fails
   * 3. Parses OrderCreated events to find matching sender and token
   * 
   * @param txHash - Transaction hash to search for
   * @param senderAddress - Address that initiated the transaction
   * @param tokenAddress - Token contract address used in transaction
   * @returns Promise<string> - Order ID associated with the transaction
   * @throws Error if order ID cannot be found through any method
   */
  async getOrderIdFromTransaction(txHash: string, senderAddress: string, tokenAddress: string): Promise<string> {
    try {
      this.logger.log(`Fetching order ID for transaction: ${txHash}`);
      
      // Get gateway address for the configured network
      const gatewayAddress = getGatewayAddressForNetwork(this.network);
      if (!gatewayAddress) {
        throw new Error('Gateway address not found for network');
      }
      
      // Method 1: Try getting the order ID from the API first
      try {
        const response = await axios.get(
          `${this.aggregatorUrl}/transactions/${txHash}/order`,
          {
            params: {
              sender: senderAddress, 
              token: tokenAddress
            }
          }
        );
        
        if (response.data.status === 'success' && response.data.data.orderId) {
          this.logger.log(`Order ID obtained from API: ${response.data.data.orderId}`);
          return response.data.data.orderId;
        }
      } catch (apiError) {
        this.logger.warn(`API method failed, falling back to blockchain logs: ${apiError.message}`);
        // Continue to Method 2 if API fails
      }
      
      // Method 2: Get the order ID from transaction logs directly
      // Wait for the transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }
      
      // Parse logs using gateway ABI to find OrderCreated event
      const gatewayInterface = new ethers.Interface(gatewayAbi);
      
      // Find the OrderCreated event
      for (const log of receipt.logs) {
        try {
          // Check if the log is from our gateway contract
          if (log.address.toLowerCase() === gatewayAddress.toLowerCase()) {
            const parsedLog = gatewayInterface.parseLog({
              topics: log.topics,
              data: log.data,
            });
            
            // Check if it's the OrderCreated event
            if (parsedLog && parsedLog.name === 'OrderCreated') {
              const { sender, token, orderId } = parsedLog.args;
              
              // Verify sender and token match to ensure we have the right event
              if (
                sender.toLowerCase() === senderAddress.toLowerCase() &&
                token.toLowerCase() === tokenAddress.toLowerCase()
              ) {
                this.logger.log(`Order ID obtained from blockchain logs: ${orderId}`);
                return orderId;
              }
            }
          }
        } catch (parseError) {
          // This log is not from our contract or not the event we're looking for
          continue;
        }
      }
      
      throw new Error('OrderCreated event not found in transaction logs');
    } catch (error) {
      this.logger.error(`Error getting order ID: ${error.message}`, error.stack);
      throw new Error(`Failed to get order ID: ${error.message}`);
    }
  }

  /**
   * Fetches the aggregator's public key for encrypting sensitive recipient data.
   * The key is used to ensure recipient banking details are securely transmitted.
   * 
   * @returns Promise<PublicKeyResponse> - Contains the public key and status
   * @throws Error if unable to fetch or validate the public key
   */
  private async fetchAggregatorPublicKey(): Promise<PublicKeyResponse> {
    try {
      const response = await axios.get<PublicKeyResponse>(`${this.aggregatorUrl}/pubkey`);
      
      if (response.data.status !== 'success') {
        throw new Error(`Failed to fetch public key: ${response.data.message}`);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `API error fetching aggregator public key: ${error.message}`,
          error.response?.data
        );
        throw new Error(`Failed to fetch aggregator public key: ${error.message} - ${JSON.stringify(error.response?.data)}`);
      }
      
      this.logger.error(`Error fetching aggregator public key: ${error.message}`, error.stack);
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
  private publicKeyEncrypt(data: unknown, publicKeyPEM: string): string {
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
      this.logger.error(`Failed to encrypt data: ${error.message}`, error.stack);
      throw new Error(`Failed to encrypt data: ${error.message}`);
    }
  }

  /**
   * Retrieves the current status of an offramp order.
   * 
   * Status Workflow:
   * 1. Order Created -> Pending
   * 2. Processing -> In progress
   * 3. Completed/Failed -> Final status
   * 
   * @param orderId - Unique identifier of the order
   * @returns Promise<OrderStatusResponse> - Current status and details
   * @throws Error if status cannot be fetched
   */
  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    try {
      const response = await axios.get<OrderStatusResponse>(
        `${this.aggregatorUrl}/orders/8453/${orderId}`, // 8453 is the chain id for Base
      );
      
      if (response.data.status !== 'success') {
        throw new Error(`Failed to fetch order status: ${response.data.message}`);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `API error fetching order status: ${error.message}`,
          error.response?.data
        );
        throw new Error(`Failed to fetch order status: ${error.message} - ${JSON.stringify(error.response?.data)}`);
      }
      
      this.logger.error(`Error fetching order status: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch order status: ${error.message}`);
    }
  }
  
  /**
   * Maps the order status from the aggregator to our internal transaction status
   */
  mapOrderStatusToTransactionStatus(orderStatus: string): TransactionStatus {
    switch (orderStatus.toLowerCase()) {
      case 'created':
      case 'pending':
        return TransactionStatus.PROCESSING;//TODO: then update this to pending in the database
      case 'completed':
      case 'settled':
        return TransactionStatus.COMPLETED;//TODO: then update this to completed in the database
      case 'failed':
      case 'expired':
        return TransactionStatus.STALLED;
      default:
        return TransactionStatus.PROCESSING;
    }
  }

  /**
   * Process for creating and tracking an order end-to-end
   */
  async processOrder(transaction: Transaction): Promise<{
    txHash: string;
    orderId: string;
    status: TransactionStatus;
  }> {
    try {
      // Step 1: Create the order
      const txHash = await this.createOrder(transaction);
      
      // Step 2: Wait a short time for transaction to be recognized
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 3: Get the order ID
      const orderId = await this.getOrderIdFromTransaction(
        txHash, 
        transaction.senderAddress, 
        transaction.tokenAddress
      );
      
      // Step 4: Check initial status
      const orderStatus = await this.getOrderStatus(orderId);
      const status = this.mapOrderStatusToTransactionStatus(orderStatus.data.status);
      
      return {
        txHash,
        orderId,
        status
      };
    } catch (error) {
      this.logger.error(`Error processing order: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Approves the gateway contract to spend tokens on behalf of the user.
   * Required before creating an offramp order.
   * 
   * Process:
   * 1. Calls ERC20 approve function
   * 2. Waits for approval confirmation
   * 3. Verifies allowance amount
   * 
   * @param params.tokenAddress - Address of the token contract
   * @param params.spenderAddress - Address of the gateway contract
   * @param params.amount - Amount to approve (in token's smallest unit)
   * @returns Promise<any> - Transaction response from approval
   */
  async approveTokenSpending({
    tokenAddress,
    spenderAddress,
    amount,
  }: {
    tokenAddress: string;
    spenderAddress: string;
    amount: string;
  }): Promise<any> {
    return await customSmartContractWrite({
      walletId: this.walletId,
      addressId: this.addressId,
      apiKey: this.apiKey,
      abi: erc20Abi as unknown as object[],
      address: tokenAddress,
      method: "approve",
      parameters: [spenderAddress, amount],
    });
  }

  /**
   * Check token allowance for the gateway contract
   */
  private async checkAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<string> {
    try {
      const response = await customSmartContractWrite({
        walletId: this.walletId,
        addressId: this.addressId,
        apiKey: this.apiKey,
        abi: erc20Abi as unknown as object[],
        address: tokenAddress,
        method: "allowance",
        parameters: [ownerAddress, spenderAddress],
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Error checking allowance: ${error.message}`, error.stack);
      throw error;
    }
  }
} 