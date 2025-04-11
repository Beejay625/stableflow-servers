import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connection } from 'typeorm';
import { Transaction as WalletTransaction } from '../../wallet/entities/transaction.entity';
import { OfframpTransaction } from '../entities/offramp-transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';

/**
 * Service dedicated to managing transaction records in the database
 * Centralizes database operations for the offramp process
 */
@Injectable()
export class TransactionManagerService {
  private readonly logger = new Logger(TransactionManagerService.name);

  constructor(
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(OfframpTransaction)
    private readonly offrampTransactionRepository: Repository<OfframpTransaction>,
    private readonly connection: Connection
  ) {}

  /**
   * Create or update the offramp transaction record
   * 
   * @param transactionData Transaction data for creating/updating record
   * @returns Created or updated OfframpTransaction
   */
  async createOrUpdateOfframpTransaction(transactionData: {
    transactionId: string,
    offrampTransactionId: string,
    offrampId: string,
    txHash: string,
    tokenAddress: string,
    tokenSymbol: string,
    amount: number,
    refundAddress: string,
    network: string,
    rpcUrl: string,
    chainId: number,
    rate: number,
    status: string,
    institution: string,
    accountIdentifier: string,
    recipientName: string,
    currency: string,
    metadata: any,
    failureReason?: string
  }): Promise<OfframpTransaction> {
    // Find the transaction record by its transaction ID
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId: transactionData.transactionId }
    });
    
    if (!transaction) {
      throw new Error(`Cannot find main transaction with transactionId: ${transactionData.transactionId}`);
    }
    
    // First check if an offramp record already exists for this transaction's database ID
    let offrampTransaction = await this.offrampTransactionRepository.findOne({
      where: { transactionId: transaction.id }
    });

    if (!offrampTransaction) {
      // Create new offramp transaction record
      offrampTransaction = this.offrampTransactionRepository.create({
        transactionId: transaction.id, // Use the database ID for FK
        originalTransactionId: transactionData.transactionId, // Store the original transactionId
        offrampTransactionId: transactionData.offrampTransactionId,
        offrampId: transactionData.offrampId,
        transactionHash: transactionData.txHash,
        tokenAddress: transactionData.tokenAddress,
        tokenSymbol: transactionData.tokenSymbol,
        amount: transactionData.amount,
        refundAddress: transactionData.refundAddress,
        network: transactionData.network,
        rpcUrl: transactionData.rpcUrl,
        chainId: transactionData.chainId,
        rate: transactionData.rate,
        status: transactionData.status,
        failureReason: transactionData.failureReason,
        recipientBank: transactionData.institution,
        recipientAccount: transactionData.accountIdentifier,
        recipientName: transactionData.recipientName,
        currency: transactionData.currency,
        metadata: transactionData.metadata
      });
      
      await this.offrampTransactionRepository.save(offrampTransaction);
      this.logger.log(`Created new OfframpTransaction record for transaction ${transactionData.transactionId} (DB ID: ${transaction.id})`);
    } else {
      // Update existing offramp transaction record
      await this.offrampTransactionRepository.update(
        { id: offrampTransaction.id },
        {
          offrampTransactionId: transactionData.offrampTransactionId,
          offrampId: transactionData.offrampId,
          transactionHash: transactionData.txHash,
          status: transactionData.status,
          failureReason: transactionData.failureReason,
          metadata: transactionData.metadata
        }
      );
      this.logger.log(`Updated existing OfframpTransaction record for transaction ${transactionData.transactionId}`);
      
      // Refresh the entity
      offrampTransaction = await this.offrampTransactionRepository.findOne({
        where: { id: offrampTransaction.id }
      });
    }
    
    return offrampTransaction;
  }

  /**
   * Update transaction metadata with blockchain related information
   * 
   * @param transactionId Transaction ID (the business identifier, not the database primary key)
   * @param txHash Transaction hash
   * @param offrampId Offramp order ID
   * @param offrampTransactionId Offramp transaction ID
   * @returns Updated metadata
   */
  async updateTransactionMetadataWithBlockchainInfo(
    transactionId: string,
    txHash: string,
    offrampId: string,
    offrampTransactionId: string
  ): Promise<any> {
    // Find by transactionId field (business identifier) not by id (primary key)
    const existingTransaction = await this.transactionRepository.findOne({ 
      where: { transactionId: transactionId } 
    });
    
    if (!existingTransaction) {
      this.logger.warn(`Transaction with business ID ${transactionId} not found for metadata update`);
      return null;
    }
    
    // Get current metadata or initialize if not exists
    const currentMetadata = existingTransaction?.metadata || {};
    
    // Merge with new metadata
    const updatedMetadata = {
      ...currentMetadata,
      offramp: {
        ...(currentMetadata.offramp || {}),
        txHash,
        offrampId,
        offrampTransactionId,
        originalTransactionId: transactionId,
        blockchainAttempted: true,
        blockchainAttemptTime: new Date().toISOString()
      }
    };
    
    // Update the transaction using its primary key (id)
    await this.transactionRepository.update(
      { id: existingTransaction.id },
      { metadata: updatedMetadata }
    );
    
    this.logger.log(`Updated transaction ${transactionId} with blockchain metadata`);
    return updatedMetadata;
  }

  /**
   * Update transaction and offramp transaction status to a final state
   * Uses a database transaction to ensure atomicity
   * 
   * @param transactionId Transaction ID (the business identifier, not the primary key)
   * @param status Status to set (SETTLED, REFUNDED, etc.)
   * @param orderDetails Order details from API
   * @param metadata Additional metadata
   */
  async updateTransactionFinalStatus(
    transactionId: string,
    status: TransactionStatus,
    orderDetails: any,
    metadata: any = {}
  ): Promise<void> {
    // Get existing transaction data by its business ID
    const existingTransaction = await this.transactionRepository.findOne({ 
      where: { transactionId } 
    });
    
    if (!existingTransaction) {
      this.logger.warn(`Cannot update status: Transaction with business ID ${transactionId} not found`);
      return;
    }
    
    const currentMetadata = existingTransaction.metadata || {};
    
    // Execute database transaction atomically
    await this.connection.transaction(async manager => {
      // Update main transaction
      await manager.update(
        'transactions',
        { id: existingTransaction.id }, // Use the primary key for the update
        { 
          status,
          metadata: {
            ...currentMetadata,
            offramp: {
              ...(currentMetadata.offramp || {}),
              lastCheckedStatus: orderDetails?.status,
              completedAt: orderDetails?.updatedAt || new Date().toISOString(),
              lastStatusCheck: new Date().toISOString(),
              ...metadata
            }
          }
        }
      );
      
      // Update offramp transaction record using the primary key of the main transaction
      const offrampTransaction = await this.offrampTransactionRepository.findOne({
        where: { transactionId: existingTransaction.id } // Find by foreign key reference
      });
      
      if (offrampTransaction) {
        await manager.update(
          'offramp_transactions',
          { id: offrampTransaction.id },
          {
            status,
            metadata: {
              ...(offrampTransaction.metadata || {}),
              statusDetails: orderDetails,
              completedAt: orderDetails?.updatedAt,
              ...metadata
            }
          }
        );
      }
    });
    
    this.logger.log(`Updated transaction ${transactionId} to final status ${status}`);
  }

  /**
   * Update transaction with error metadata
   * 
   * @param transactionId The business identifier of the transaction (UUID)
   * @param error Error object
   * @param failureReason Optional reason for failure
   * @returns Updated metadata
   */
  async updateTransactionWithError(
    transactionId: string, 
    error: any,
    failureReason?: string
  ): Promise<any> {
    try {
      const existingTransaction = await this.transactionRepository.findOne({
        where: { transactionId: transactionId }
      });
      
      if (!existingTransaction) {
        this.logger.warn(`Transaction ${transactionId} not found for error update`);
        return null;
      }
      
      const currentMetadata = existingTransaction?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        offramp: {
          ...(currentMetadata.offramp || {}),
          error: error.message || String(error),
          errorTimestamp: new Date().toISOString(),
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
      
      // Also update the offramp transaction record if it exists
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
              error: error.message || String(error),
              errorTimestamp: new Date().toISOString()
            }
          }
        );
      }
      
      return updatedMetadata;
    } catch (dbError) {
      this.logger.error(`Error updating transaction with error: ${dbError.message}`);
      return null;
    }
  }
} 