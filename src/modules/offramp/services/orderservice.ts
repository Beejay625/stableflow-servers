import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ethers } from 'ethers';
import { parseUnits } from 'viem';
import { PrepareTransactionService } from '../preparetransaction.service';
import { WalletConfigService } from '../../../common/utils/wallet-config';

import { Transaction as WalletTransaction } from '../../wallet/entities/transaction.entity';
import { OrderStatusResponse } from '../interfaces/response.interface';
import { erc20Abi, gatewayAbi } from '../abis/abi';
import { 
  customSmartContractRead,
  customSmartContractWrite,
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
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly prepareTransactionService: PrepareTransactionService,
    private readonly walletConfigService: WalletConfigService,
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
    network?: string,
    rpcUrl?: string
  ): Promise<string> {
    try {
      if (!rpcUrl) {
        throw new Error('RPC URL is required for blockchain interaction');
      }

      // Get token configuration from PrepareTransactionService
      const { tokenInfo } = await this.prepareTransactionService.validateTokenConfiguration(
        tokenAddress,
        network || this.network
      );
      
      if (!tokenInfo.gatewayAddress) {
        throw new Error(`Gateway address not found for token ${tokenAddress}`);
      }
      
      // Get order ID from blockchain logs
      return await this.getOrderIdFromBlockchain(txHash, senderAddress, tokenAddress, tokenInfo.gatewayAddress, rpcUrl);
    } catch (error) {
      throw new Error(`Failed to get order ID: ${error.message}`);
    }
  }

  /**
   * Retrieves the order ID by scanning blockchain transaction logs
   */
  private async getOrderIdFromBlockchain(
    txHash: string, 
    senderAddress: string, 
    tokenAddress: string, 
    gatewayAddress: string,
    rpcUrl: string
  ): Promise<string> {
    this.logger.log(`Getting order ID from blockchain for tx ${txHash}`);
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error('Transaction receipt not found');
    }
    
    const gatewayInterface = new ethers.Interface(gatewayAbi);
    
    for (const log of receipt.logs) {
      try {
        if (log.address.toLowerCase() === gatewayAddress.toLowerCase()) {
          const parsedLog = gatewayInterface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          
          if (parsedLog && parsedLog.name === 'OrderCreated') {
            const { orderId } = parsedLog.args;
            this.logger.log(`Found order ID ${orderId} for transaction ${txHash}`);
            return orderId;
          }
        }
      } catch (parseError) {
        this.logger.debug(`Failed to parse log: ${parseError.message}`);
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
    addressId: string,
    rpcUrl: string,
    walletConfig: { walletId: string; apiKey: string; walletName: string; },
    network: string
  ): Promise<any> {
    if (!addressId) throw new Error('Missing addressId for token approval');
    if (!rpcUrl) throw new Error('RPC URL is required for token approval');
    
    try {
      this.logger.log(`Using provided RPC URL for approval: ${rpcUrl}`);
      
      // Check existing allowance and get token info using centralized service
      const { tokenInfo } = await this.prepareTransactionService.validateTokenConfiguration(
        tokenAddress,
        network
      );

      // Use walletConfig passed as parameter
      // Check existing allowance
      const currentAllowance = await this.checkAllowance(
        tokenAddress, ownerAddress, spenderAddress, walletConfig, addressId
      );
      
      // Validate balance using centralized service
      await this.prepareTransactionService.validateSufficientBalance(
        ownerAddress,
        amount,
        tokenInfo
      );
      
      // Check if allowance is sufficient
      const currentAllowanceBigInt = BigInt(currentAllowance);
      const requiredAmountBigInt = BigInt(amount);
      
      if (currentAllowanceBigInt >= requiredAmountBigInt) {
        return { txId: 'existing-allowance' };
      }
      
      // Create approval transaction if needed
      return await this.createApprovalTransaction(
        tokenAddress, spenderAddress, amount, walletConfig, addressId
      );
    } catch (error) {
      this.logger.error(`Token approval failed: ${error.message}`);
      throw error;
    }
  }

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

  async validateTokenBalance(
    walletAddress: string,
    tokenAddress: string,
    amount: string,
    network: string,
  ): Promise<void> {
    try {
      // Use centralized token validation
      const { tokenInfo } = await this.prepareTransactionService.validateTokenConfiguration(
        tokenAddress,
        network,
      );

      // Use centralized balance validation
      await this.prepareTransactionService.validateSufficientBalance(
        walletAddress,
        amount,
        tokenInfo,
      );
    } catch (error) {
      this.logger.error(`Failed to validate token balance: ${error.message}`);
      throw error;
    }
  }
}