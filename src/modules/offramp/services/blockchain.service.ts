import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, TransactionReceipt } from 'ethers';
import { gatewayAbi } from '../abis/abi';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfframpTransaction } from '../entities/offramp-transaction.entity';
import { Transaction as WalletTransaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';
import { mapNetworkFromConfig, getTokenInfoByAddress } from '../utils';

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
   * Gets the order ID from a transaction hash by parsing logs
   */
  async getOrderIdFromTransaction(
    txHash: string,
    rpcUrl: string,
    transactionId?: string // Optional ID for DB updates
  ): Promise<string | null> {
    try {
      this.logger.log(`Getting order ID from transaction ${txHash}`);
      
      // Get transaction receipt
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        throw new Error(`No receipt found for transaction ${txHash}`);
      }

      // Get transaction data to find token address
      const tx = await provider.getTransaction(txHash);
      if (!tx || !tx.to) {
        throw new Error(`No transaction data found for ${txHash}`);
      }

      // Get token info to get gateway address
      const tokenInfo = getTokenInfoByAddress(tx.to);
      if (!tokenInfo) {
        throw new Error(`Token information not found for address ${tx.to}`);
      }
      
      const gatewayAddress = tokenInfo.gatewayAddress;
      if (!gatewayAddress) {
        throw new Error(`Gateway address not found for token ${tx.to}`);
      }

      // Create contract interface
      const iface = new ethers.Interface(gatewayAbi);
      
      // Look for OrderCreated event in logs
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === gatewayAddress.toLowerCase()) {
          try {
            const parsedLog = iface.parseLog(log);
            if (parsedLog && parsedLog.name === 'OrderCreated') {
              const orderId = parsedLog.args.orderId;
              
              // Update DB if we have a transaction ID
              if (transactionId) {
                await this._updateTransactionWithOrderId(transactionId, orderId);
              }
              
              return orderId;
            }
          } catch (parseError) {
            // Skip logs that can't be parsed
            continue;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error getting order ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Updates the OfframpTransaction record with the extracted order ID.
   * @param transactionId The business identifier of the transaction (originalTransactionId)
   * @param orderId The extracted blockchain order ID
   */
  private async _updateTransactionWithOrderId(transactionId: string, orderId: string): Promise<void> {
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
} 