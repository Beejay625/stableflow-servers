import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ethers } from 'ethers';
import { parseUnits } from 'viem';

import { Transaction as WalletTransaction } from '../../wallet/entities/transaction.entity';
import { OrderStatusResponse } from '../interfaces/response.interface';
import { erc20Abi, gatewayAbi } from '../abis/abi';
import { 
  customSmartContractRead,
  customSmartContractWrite,
  getGatewayAddressForNetwork,
  getTokenInfoByAddress,
} from '../utils';

/**
 * Service for handling blockchain order operations related to the offramp process.
 * Contains reusable helper functions for interacting with blockchain and fetching order information.
 */
@Injectable()
export class OrderService {
  private readonly aggregatorUrl: string;
  private readonly network: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
  ) {
    this.aggregatorUrl = this.configService.get<string>('paycrest.baseUrl');
    this.network = this.configService.get<string>('blockradar.network');
  }

  /**
   * Updates a transaction with the blockchain hash in its metadata
   * Called after successful order creation
   * 
   * @param transactionId ID of the transaction to update
   * @param txHash Blockchain transaction hash
   */
  async updateTransactionWithHash(transactionId: string, txHash: string): Promise<void> {
    try {
      const transaction = await this.transactionRepository.findOne({ 
        where: { transactionId } 
      });
      
      if (!transaction) return;
      
      const metadata = this.createUpdatedMetadata(transaction.metadata, txHash);
      
      await this.transactionRepository.update(
        { id: transaction.id },
        { metadata }
      );
    } catch (error) {
      // Error silently handled
    }
  }

  /**
   * Creates updated metadata with transaction hash information
   */
  private createUpdatedMetadata(existingMetadata: any, txHash: string): any {
    return {
      ...(existingMetadata || {}),
      offramp: {
        ...(existingMetadata?.offramp || {}),
        txHash,
        blockchainAttempted: true,
        blockchainAttemptTime: new Date().toISOString()
      }
    };
  }

  /**
   * Retrieves the order ID from a transaction using multiple fallback methods.
   * 
   * Fallback Strategy:
   * 1. Attempts to fetch from API (faster, preferred method)
   * 2. Falls back to blockchain logs if API fails
   * 3. Parses OrderCreated events to find matching sender and token
   */
  async getOrderIdFromTransaction(
    txHash: string, 
    senderAddress: string, 
    tokenAddress: string,
    network?: string
  ): Promise<string> {
    try {
      const useNetwork = network || this.network;
      const gatewayAddress = getGatewayAddressForNetwork(useNetwork);
      
      if (!gatewayAddress) {
        throw new Error(`Gateway address not found for network ${useNetwork}`);
      }
      
      // Try API method first
      const apiOrderId = await this.getOrderIdFromApi(txHash, senderAddress, tokenAddress);
      if (apiOrderId) return apiOrderId;
      
      // Fall back to blockchain method
      return await this.getOrderIdFromBlockchain(txHash, senderAddress, tokenAddress, gatewayAddress);
    } catch (error) {
      throw new Error(`Failed to get order ID: ${error.message}`);
    }
  }

  /**
   * Attempts to retrieve the order ID using the API
   */
  private async getOrderIdFromApi(txHash: string, senderAddress: string, tokenAddress: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.aggregatorUrl}/transactions/${txHash}/order`,
        { params: { sender: senderAddress, token: tokenAddress } }
      );
      
      if (response.data.status === 'success' && response.data.data.orderId) {
        return response.data.data.orderId;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the order ID by scanning blockchain transaction logs
   */
  private async getOrderIdFromBlockchain(
    txHash: string, 
    senderAddress: string, 
    tokenAddress: string, 
    gatewayAddress: string
  ): Promise<string> {
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) throw new Error('Transaction receipt not found');
    
    const gatewayInterface = new ethers.Interface(gatewayAbi);
    
    for (const log of receipt.logs) {
      try {
        if (log.address.toLowerCase() === gatewayAddress.toLowerCase()) {
          const parsedLog = gatewayInterface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          
          if (parsedLog && parsedLog.name === 'OrderCreated') {
            const { sender, token, orderId } = parsedLog.args;
            
            if (
              sender.toLowerCase() === senderAddress.toLowerCase() &&
              token.toLowerCase() === tokenAddress.toLowerCase()
            ) {
              return orderId;
            }
          }
        }
      } catch {
        continue;
      }
    }
    
    throw new Error('OrderCreated event not found in transaction logs');
  }

  /**
   * Retrieves the current status of an offramp order.
   */
  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    try {
      const response = await axios.get<OrderStatusResponse>(
        `${this.aggregatorUrl}/orders/8453/${orderId}`
      );
      
      if (response.data.status !== 'success') {
        throw new Error(`Failed to fetch order status: ${response.data.message}`);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch order status: ${error.message} - ${JSON.stringify(error.response?.data)}`);
      }
      
      throw new Error(`Failed to fetch order status: ${error.message}`);
    }
  }

  /**
   * Approves token spending for the offramp process
   */
  async approveTokenSpending(
    tokenAddress: string,
    spenderAddress: string,
    amount: string,
    ownerAddress: string,
    walletConfig: { walletId: string; apiKey: string; walletName: string; },
    addressId?: string
  ): Promise<any> {
    if (!addressId) throw new Error('Missing addressId for token approval');
    
    try {
      // Check existing allowance
      const currentAllowance = await this.checkAllowance(
        tokenAddress, ownerAddress, spenderAddress, walletConfig, addressId
      );
      
      // Check balance and convert amount
      const { currentBalance, amountInTokenUnits, tokenInfo } = await this.getBalanceAndConvertAmount(
        tokenAddress, ownerAddress, amount, walletConfig, addressId
      );
      
      // Validate sufficient balance
      this.validateSufficientBalance(currentBalance, amountInTokenUnits, amount, tokenInfo);
      
      // Check if allowance is sufficient
      const currentAllowanceBigInt = BigInt(currentAllowance);
      const requiredAmountBigInt = BigInt(amountInTokenUnits);
      
      if (currentAllowanceBigInt >= requiredAmountBigInt) {
        return { txId: 'existing-allowance' };
      }
      
      // Create approval transaction if needed
      return await this.createApprovalTransaction(
        tokenAddress, spenderAddress, amountInTokenUnits, walletConfig, addressId
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieves token balance and converts amount to token units
   */
  private async getBalanceAndConvertAmount(
    tokenAddress: string,
    ownerAddress: string,
    amount: string,
    walletConfig: { walletId: string; apiKey: string; walletName: string; },
    addressId: string
  ): Promise<{ currentBalance: string; amountInTokenUnits: string; tokenInfo: any }> {
    console.log(`[DEBUG] Getting balance for token=${tokenAddress}, owner=${ownerAddress}`);
    
    const balanceResponse = await customSmartContractRead({
      walletId: walletConfig.walletId,
      addressId,
      apiKey: walletConfig.apiKey,
      abi: erc20Abi as unknown as object[],
      address: tokenAddress,
      method: 'balanceOf',
      parameters: [ownerAddress],
    });

    const currentBalance = balanceResponse?.data || '0';
    
    const tokenInfo = getTokenInfoByAddress(tokenAddress);
    if (!tokenInfo) {
      throw new Error(`Token information not found for address ${tokenAddress}`);
    }
    
    // The amount is already in smallest token units, no need to convert again
    // Just verify it's a valid number
    try {
      // Validate that the amount is a valid number
      const amountBigInt = BigInt(amount);
      
      // For logging, show human-readable values
      const tokenDecimals = tokenInfo.decimals;
      const readableAmount = this.formatTokenAmount(amount, tokenDecimals);
      const readableBalance = this.formatTokenAmount(currentBalance, tokenDecimals);
      
      console.log(`[DEBUG] Token balance: ${readableBalance} ${tokenInfo.symbol} (raw: ${currentBalance})`);
      console.log(`[DEBUG] Required amount: ${readableAmount} ${tokenInfo.symbol} (raw: ${amount})`);
      
      return { 
        currentBalance, 
        amountInTokenUnits: amount,  // Just pass the original amount as it's already in token units
        tokenInfo 
      };
    } catch (conversionError) {
      throw new Error(`Invalid amount format: ${conversionError.message}`);
    }
  }

  /**
   * Validates if the balance is sufficient for the transaction
   */
  private validateSufficientBalance(
    currentBalance: string, 
    amountInTokenUnits: string, 
    amount: string, 
    tokenInfo: any
  ): void {
    const balanceBigInt = BigInt(currentBalance);
    const requiredAmountBigInt = BigInt(amountInTokenUnits);
    
    // Format values for human-readable error messages
    const tokenDecimals = tokenInfo.decimals;
    const formattedBalance = this.formatTokenAmount(currentBalance, tokenDecimals);
    const formattedAmount = this.formatTokenAmount(amountInTokenUnits, tokenDecimals);
    
    if (balanceBigInt < requiredAmountBigInt) {
      throw new Error(`Insufficient token balance. Required: ${formattedAmount} ${tokenInfo.symbol}, Available: ${formattedBalance} ${tokenInfo.symbol}`);
    }
  }
  
  /**
   * Helper to format token amounts with proper decimals for human-readable display
   */
  private formatTokenAmount(rawAmount: string, decimals: number): string {
    try {
      const amountBigInt = BigInt(rawAmount);
      const divisor = BigInt(10) ** BigInt(decimals);
      
      // Integer part
      const integerPart = (amountBigInt / divisor).toString();
      
      // Fractional part with proper padding
      let fractionalPart = (amountBigInt % divisor).toString();
      fractionalPart = fractionalPart.padStart(decimals, '0');
      
      // Combine with decimal point, removing trailing zeros
      const formatted = `${integerPart}.${fractionalPart}`;
      return parseFloat(formatted).toFixed(6);
    } catch (error) {
      return rawAmount; // Fallback to raw value if formatting fails
    }
  }

  /**
   * Creates a token approval transaction
   */
  private async createApprovalTransaction(
    tokenAddress: string,
    spenderAddress: string,
    approvalAmount: string,
    walletConfig: { walletId: string; apiKey: string; walletName: string; },
    addressId: string
  ): Promise<{ txId: string }> {
    const txResponse = await customSmartContractWrite({
      walletId: walletConfig.walletId,
      addressId,
      apiKey: walletConfig.apiKey,
      abi: erc20Abi as unknown as object[],
      address: tokenAddress,
      method: 'approve',
      parameters: [spenderAddress, approvalAmount],
    });
    
    const txId = txResponse?.data?.id;
    return { txId: txId || 'pending-tx' };
  }

  /**
   * Checks the current allowance for a token
   */
  async checkAllowance(
    tokenAddress: string, 
    ownerAddress: string, 
    spenderAddress: string,
    walletConfig: { walletId: string; apiKey: string; walletName: string; },
    addressId?: string
  ): Promise<string> {
    if (!addressId) throw new Error('Missing addressId for allowance check');
    
    try {
      const response = await customSmartContractRead({
        walletId: walletConfig.walletId,
        addressId,
        apiKey: walletConfig.apiKey,
        abi: erc20Abi as unknown as object[],
        address: tokenAddress,
        method: 'allowance',
        parameters: [ownerAddress, spenderAddress],
      });
      
      return response?.data || '0';
    } catch (error) {
      throw error;
    }
  }
}