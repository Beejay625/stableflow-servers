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
    metadata: any
  }): Promise<OfframpTransaction> {
    // First check if a record already exists for this transaction
    let offrampTransaction = await this.offrampTransactionRepository.findOne({
      where: { transactionId: transactionData.transactionId }
    });

    if (!offrampTransaction) {
      // Create new offramp transaction record
      offrampTransaction = this.offrampTransactionRepository.create({
        transactionId: transactionData.transactionId,
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
        recipientBank: transactionData.institution,
        recipientAccount: transactionData.accountIdentifier,
        recipientName: transactionData.recipientName,
        currency: transactionData.currency,
        metadata: transactionData.metadata
      });
      
      await this.offrampTransactionRepository.save(offrampTransaction);
      this.logger.log(`Created new OfframpTransaction record for transaction ${transactionData.transactionId}`);
    } else {
      // Update existing offramp transaction record
      await this.offrampTransactionRepository.update(
        { id: offrampTransaction.id },
        {
          offrampTransactionId: transactionData.offrampTransactionId,
          offrampId: transactionData.offrampId,
          transactionHash: transactionData.txHash,
          status: transactionData.status,
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
   * @param transactionId Transaction ID
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
    const existingTransaction = await this.transactionRepository.findOne({ 
      where: { id: transactionId } 
    });
    
    if (!existingTransaction) {
      this.logger.warn(`Transaction ${transactionId} not found for metadata update`);
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
    
    // Update the transaction
    await this.transactionRepository.update(
      { id: transactionId },
      { metadata: updatedMetadata }
    );
    
    this.logger.log(`Updated transaction ${transactionId} with blockchain metadata`);
    return updatedMetadata;
  }

  /**
   * Update transaction and offramp transaction status to a final state
   * Uses a database transaction to ensure atomicity
   * 
   * @param transactionId Transaction ID
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
    // Get existing transaction data
    const existingTransaction = await this.transactionRepository.findOne({ 
      where: { id: transactionId } 
    });
    
    if (!existingTransaction) {
      this.logger.warn(`Cannot update status: Transaction ${transactionId} not found`);
      return;
    }
    
    const currentMetadata = existingTransaction.metadata || {};
    
    // Execute database transaction atomically
    await this.connection.transaction(async manager => {
      // Update main transaction
      await manager.update(
        'transactions',
        { id: transactionId },
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
      
      // Update offramp transaction record
      const offrampTransaction = await this.offrampTransactionRepository.findOne({
        where: { transactionId }
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
   * @param transactionId Transaction ID
   * @param error Error object
   */
  async updateTransactionWithError(transactionId: string, error: Error): Promise<void> {
    const existingTransaction = await this.transactionRepository.findOne({ 
      where: { id: transactionId } 
    });
    
    if (!existingTransaction) {
      this.logger.warn(`Transaction ${transactionId} not found for error update`);
      return;
    }
    
    const currentMetadata = existingTransaction.metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      offramp: {
        ...(currentMetadata.offramp || {}),
        errors: [
          ...(currentMetadata.offramp?.errors || []),
          {
            time: new Date().toISOString(),
            message: error.message,
            stack: error.stack
          }
        ]
      }
    };
    
    await this.transactionRepository.update(
      { id: transactionId },
      { metadata: updatedMetadata }
    );
    
    this.logger.log(`Updated error information for transaction ${transactionId}`);
  }
} 