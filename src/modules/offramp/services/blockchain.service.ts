import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, TransactionReceipt } from 'ethers';
import { gatewayAbi } from '../abis/abi';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfframpTransaction } from '../entities/offramp-transaction.entity';
import { Transaction as WalletTransaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { getGatewayAddressForNetwork, mapNetworkFromConfig } from '../utils';

/**
 * Service for blockchain-related functionality for the offramp process
 * Handles blockchain transaction processing, log extraction, and receipt handling
 */
@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(OfframpTransaction)
    private readonly offrampTransactionRepository: Repository<OfframpTransaction>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
  ) {}

  /**
   * Extracts the order ID from transaction logs using txHash and rpcUrl.
   * Orchestrates fetching receipt, finding logs, and updating DB.
   */
  async getOrderIdFromTransaction(txHash: string, rpcUrl: string, originalTransactionId?: string): Promise<string | null> {
    try {
      this.logger.log(`Extracting order ID from transaction ${txHash} using RPC ${rpcUrl}`);
      
      // 1. Get Transaction Receipt
      const receipt = await this._getTransactionReceipt(txHash, rpcUrl);
      if (!receipt) return null;

      // 2. Determine Gateway Address
      const gatewayAddress = this._getGatewayAddress(rpcUrl);
      if (!gatewayAddress) return null;

      // 3. Find Order ID in Logs
      const orderId = this._findOrderIdInLogs(receipt, gatewayAddress, txHash);
      if (!orderId) return null;

      // 4. Update Database (Optional)
      if (originalTransactionId) {
        await this._updateOfframpTransactionWithOrderId(originalTransactionId, orderId, gatewayAddress);
      }
      
      return orderId;
      
    } catch (error) {
      this.logger.error(`Error extracting Order ID from transaction ${txHash}: ${error.message}`);
      return null;
    }
  }

  /**
   * Gets a transaction receipt from the specified RPC provider.
   */
  private async _getTransactionReceipt(txHash: string, rpcUrl: string): Promise<TransactionReceipt | null> {
    try {
      if (!rpcUrl) {
        this.logger.warn('Missing RPC URL for transaction receipt retrieval');
        return null;
      }
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        this.logger.warn(`Transaction receipt not found for hash ${txHash}`);
        return null;
      }
      
      return receipt;
    } catch (error) {
      this.logger.error(`Error getting transaction receipt: ${error.message}`);
      return null;
    }
  }

  /**
   * Determines the gateway address based on configuration.
   * Uses the RPC URL to determine the correct network
   */
  private _getGatewayAddress(rpcUrl: string): string | null {
    try {
      // Determine network based on RPC URL
      let networkName: string;
      
      if (rpcUrl.includes('sepolia')) {
        // This is Base Sepolia
        networkName = 'Base Sepolia';
      } else if (rpcUrl.includes('base.org')) {
        // This is Base Mainnet
        networkName = 'Base';
      } else if (rpcUrl.includes('binance') && rpcUrl.includes('seed-prebsc')) {
        // This is BNB Smart Chain Testnet
        networkName = 'BNB Smart Chain Testnet';
      } else if (rpcUrl.includes('binance') || rpcUrl.includes('bsc')) {
        // This is BNB Smart Chain Mainnet
        networkName = 'BNB Smart Chain';
      } else {
        // Fall back to config mapping as a last resort
        const configNetwork = this.configService.get<string>('blockradar.network');
        networkName = mapNetworkFromConfig(configNetwork);
      }
      
      this.logger.log(`Determined network name: ${networkName} from RPC URL: ${rpcUrl}`);
      
      const gatewayAddress = getGatewayAddressForNetwork(networkName);
      if (!gatewayAddress) {
        throw new Error(`Could not determine gateway address for network: ${networkName}`);
      }
      
      this.logger.log(`Using gateway address ${gatewayAddress} for network ${networkName}`);
      return gatewayAddress;
    } catch (error) {
      this.logger.error(`Failed to get gateway address: ${error.message}`);
      return null;
    }
  }

  /**
   * Finds the OrderCreated log from the gateway contract and extracts the orderId.
   */
  private _findOrderIdInLogs(receipt: TransactionReceipt, gatewayAddress: string, txHash: string): string | null {
    for (const log of receipt.logs) {
      if (log.address && log.address.toLowerCase() === gatewayAddress.toLowerCase()) {
        if (log.topics.length >= 4) {
          const potentialOrderId = BigInt(log.topics[3]).toString();
          if (potentialOrderId && potentialOrderId !== "0") {
            this.logger.log(`Found Order ID ${potentialOrderId} in logs for transaction ${txHash}`);
            return potentialOrderId;
          }
        }
      }
    }
    this.logger.warn(`Order ID not found in logs for transaction ${txHash}`);
    return null;
  }

  /**
   * Updates the OfframpTransaction record with the extracted order ID.
   * @param transactionId The business identifier of the transaction (originalTransactionId)
   * @param orderId The extracted blockchain order ID
   * @param gatewayAddress The address of the gateway contract
   */
  private async _updateOfframpTransactionWithOrderId(transactionId: string, orderId: string, gatewayAddress: string): Promise<void> {
    try {
      // First find the main transaction by its business ID
      const mainTransaction = await this.transactionRepository.findOne({
        where: { transactionId }
      });
      
      if (!mainTransaction) {
        this.logger.warn(`Main transaction with business ID ${transactionId} not found`);
        return;
      }
      
      // Then find the offramp transaction using the main transaction's primary key
      const offrampTransaction = await this.offrampTransactionRepository.findOne({
        where: { transactionId: mainTransaction.id }
      });
      
      if (offrampTransaction) {
        await this.offrampTransactionRepository.update(
          { id: offrampTransaction.id },
          {
            offrampId: orderId,
            logs: { // Cast to any to satisfy TypeORM update typing for jsonb
              orderId: orderId,
              fromContract: gatewayAddress
            } as any,
            status: TransactionStatus.PROCESSING // Mark as processing now that we have the ID
          }
        );
        this.logger.log(`Updated OfframpTransaction ${offrampTransaction.id} with Order ID ${orderId}`);
      } else {
        this.logger.warn(`OfframpTransaction not found for transaction ID ${mainTransaction.id} (business ID: ${transactionId})`);
      }
    } catch (dbError) {
      this.logger.error(`Error updating OfframpTransaction with Order ID: ${dbError.message}`);
      // Don't throw error, the main function still succeeded in finding the ID
    }
  }
  
  /**
   * Update transaction as pending for later processing
   * 
   * @param transactionId The business identifier of the transaction (UUID)
   * @param txHash Transaction hash
   */
  private async updateTransactionAsPending(transactionId: string, txHash: string): Promise<void> {
    try {
      const existingTransaction = await this.transactionRepository.findOne({ 
        where: { transactionId: transactionId } 
      });
      
      if (existingTransaction) {
        const currentMetadata = existingTransaction?.metadata || {};
        
        const updatedMetadata = {
          ...currentMetadata,
          offramp: {
            ...(currentMetadata.offramp || {}),
            txHash,
            lastPollingAttempt: new Date().toISOString(),
            maxAttemptsReached: true
          }
        };
        
        await this.transactionRepository.update(
          { id: existingTransaction.id }, // Use the DB primary key for the update condition
          { 
            metadata: updatedMetadata,
            status: TransactionStatus.PENDING
          }
        );
        
        // Find the related offramp transaction using the transaction's primary key
        const offrampTransaction = await this.offrampTransactionRepository.findOne({
          where: { transactionId: existingTransaction.id }
        });
        
        if (offrampTransaction) {
          await this.offrampTransactionRepository.update(
            { id: offrampTransaction.id },
            {
              status: TransactionStatus.PENDING,
              failureReason: "Transaction not mined after maximum attempts",
              metadata: updatedMetadata.offramp
            }
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error updating transaction ${transactionId} as pending: ${error.message}`);
    }
  }

  /**
   * Update transaction as reverted in the database
   * 
   * @param transactionId The business identifier of the transaction (UUID)
   * @param failureReason Reason for transaction failure
   */
  private async updateTransactionAsReverted(transactionId: string, failureReason: string = "Transaction reverted"): Promise<void> {
    try {
      const existingTransaction = await this.transactionRepository.findOne({ 
        where: { transactionId: transactionId } 
      });
      
      if (existingTransaction) {
        const currentMetadata = existingTransaction?.metadata || {};
        
        const updatedMetadata = {
          ...currentMetadata,
          offramp: {
            ...(currentMetadata.offramp || {}),
            transactionReverted: true,
            revertTimestamp: new Date().toISOString(),
            failureReason: failureReason
          }
        };
        
        await this.transactionRepository.update(
          { id: existingTransaction.id },
          { 
            metadata: updatedMetadata,
            status: TransactionStatus.FAILED
          }
        );
        
        const offrampTransaction = await this.offrampTransactionRepository.findOne({
          where: { transactionId: existingTransaction.id }
        });
        
        if (offrampTransaction) {
          await this.offrampTransactionRepository.update(
            { id: offrampTransaction.id },
            {
              status: TransactionStatus.FAILED,
              failureReason: failureReason,
              metadata: {
                ...(offrampTransaction.metadata || {}),
                transactionReverted: true,
                revertTimestamp: new Date().toISOString()
              }
            }
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error updating transaction ${transactionId} as failed: ${error.message}`);
    }
  }

  /**
   * Final safety check to verify transaction state after polling is complete
   * 
   * @param chainId The blockchain chain ID
   * @param orderId The offramp order ID
   * @param transactionId The business identifier of the transaction (UUID)
   */
  async verifyTransactionFinalState(chainId: number | string, orderId: string, transactionId: string): Promise<void> {
    try {
      // First find the main transaction by its business ID
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId }
      });
      
      if (!transaction) {
        this.logger.warn(`Main transaction ${transactionId} not found in final verification`);
        return;
      }
      
      // Then find the offramp transaction using the transaction's primary key
      const offrampTransaction = await this.offrampTransactionRepository.findOne({
        where: { transactionId: transaction.id }
      });
      
      if (!offrampTransaction || !offrampTransaction.transactionHash || !offrampTransaction.rpcUrl) {
        this.logger.warn(`Offramp transaction for ${transactionId} not found in final verification or missing required data`);
        return;
      }
      
      const txHash = offrampTransaction.transactionHash;
      const rpcUrl = offrampTransaction.rpcUrl;
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (receipt && receipt.status === 0) {
        await this.updateTransactionAsReverted(transactionId, "Transaction reverted in final verification");
        this.logger.log(`Updated transaction ${transactionId} as failed in final verification`);
      }
    } catch (error) {
      this.logger.error(`Error in final transaction verification: ${error.message}`);
    }
  }
} 