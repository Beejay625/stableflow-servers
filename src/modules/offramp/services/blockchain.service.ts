import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { gatewayAbi } from '../abis/abi';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfframpTransaction } from '../entities/offramp-transaction.entity';
import { Transaction as WalletTransaction } from '../../wallet/entities/transaction.entity';
import { TransactionStatus } from '../../wallet/constants/status.enum';

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
   * Process a transaction receipt to extract order logs
   * Used between initial check and polling to avoid duplicate code
   */
  async extractLogsFromReceipt(receipt: any, txHash: string, originalTransactionId?: string): Promise<any> {
    // Create interface for parsing logs
    const orderInterface = new ethers.Interface([
      "event OrderCreated(address indexed refundAddress, address indexed token, uint256 amount, uint256 fee, uint256 indexed orderId, uint256 rate, bytes32 messageHash)"
    ]);
    
    // Parse logs to find OrderCreated event
    const logs = receipt.logs.map(log => {
      try {
        return orderInterface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
      } catch (e) {
        return null;
      }
    }).filter(log => log !== null && log.name === "OrderCreated");
    
    // If we found a log, return its parsed args
    if (logs.length > 0) {
      const orderLog = logs[0];
      this.logger.log(`Found OrderCreated event in transaction ${txHash}`);
      
      const parsedLogs = {
        refundAddress: orderLog.args[0],
        token: orderLog.args[1],
        amount: orderLog.args[2].toString(),
        fee: orderLog.args[3].toString(),
        orderId: orderLog.args[4].toString(),
        rate: orderLog.args[5].toString(),
        messageHash: orderLog.args[6]
      };
      
      // Update the OfframpTransaction with the log data if we have a transaction ID
      if (originalTransactionId) {
        try {
          const offrampTransaction = await this.offrampTransactionRepository.findOne({
            where: { transactionId: originalTransactionId }
          });
          
          if (offrampTransaction) {
            await this.offrampTransactionRepository.update(
              { id: offrampTransaction.id },
              {
                offrampId: parsedLogs.orderId,
                logs: parsedLogs,
                status: TransactionStatus.PROCESSING // Moving to PROCESSING once confirmed on blockchain
              }
            );
            this.logger.log(`Updated OfframpTransaction with blockchain logs for transaction ${originalTransactionId}`);
          }
        } catch (dbError) {
          this.logger.error(`Error updating OfframpTransaction with logs: ${dbError.message}`);
        }
      }
      
      return parsedLogs;
    }
    
    this.logger.warn(`No OrderCreated event found in transaction ${txHash}`);
    return null;
  }

  /**
   * Extract order details from transaction logs
   * 
   * @param txHash Transaction hash to get logs from
   * @param rpcUrl RPC URL to connect to the blockchain
   * @param originalTransactionId Original transaction ID for database updates
   * @returns Promise<{ orderId: string, other log data... }>
   */
  async extractOrderLogsFromTransaction(txHash: string, rpcUrl: string, originalTransactionId?: string): Promise<any> {
    try {
      this.logger.log(`Extracting order logs from transaction ${txHash} using RPC ${rpcUrl}`);
      
      // Create a provider using the RPC URL
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Check if transaction is already mined and potentially reverted before starting polling
      try {
        const initialReceipt = await provider.getTransactionReceipt(txHash);
        if (initialReceipt) {
          this.logger.log(`Transaction ${txHash} already mined, checking status`);
          
          // Check if the transaction reverted
          if (initialReceipt.status === 0) {
            this.logger.warn(`Transaction ${txHash} found immediately and is reverted on-chain`);
            
            // If we have the original transaction ID, update the database to mark it as failed
            if (originalTransactionId) {
              try {
                const existingTransaction = await this.transactionRepository.findOne({ where: { id: originalTransactionId } });
                
                if (existingTransaction) {
                  // Get current metadata or initialize if not exists
                  const currentMetadata = existingTransaction?.metadata || {};
                  
                  // Update metadata to include information about the revert
                  const updatedMetadata = {
                    ...currentMetadata,
                    offramp: {
                      ...(currentMetadata.offramp || {}),
                      txHash,
                      transactionReverted: true,
                      revertTimestamp: new Date().toISOString()
                    }
                  };
                  
                  // Update the transaction in the database
                  await this.transactionRepository.update(
                    { id: originalTransactionId },
                    { 
                      metadata: updatedMetadata,
                      status: TransactionStatus.FAILED  // Mark as FAILED since the transaction reverted
                    }
                  );
                  
                  // Update OfframpTransaction record
                  let offrampTransaction = await this.offrampTransactionRepository.findOne({
                    where: { transactionId: originalTransactionId }
                  });
                  
                  if (offrampTransaction) {
                    await this.offrampTransactionRepository.update(
                      { id: offrampTransaction.id },
                      {
                        status: TransactionStatus.FAILED,
                        metadata: {
                          ...(offrampTransaction.metadata || {}),
                          transactionReverted: true,
                          revertTimestamp: new Date().toISOString()
                        }
                      }
                    );
                  }
                  
                  this.logger.log(`Updated transaction ${originalTransactionId} as failed due to on-chain revert (before polling)`);
                }
              } catch (dbError) {
                this.logger.error(`Error updating transaction ${originalTransactionId} as failed: ${dbError.message}`);
              }
            }
            
            return { reverted: true, receipt: initialReceipt };
          }
          
          // If we have the receipt already, no need to poll
          this.logger.log(`Transaction ${txHash} already mined and successful, processing logs`);
          return this.extractLogsFromReceipt(initialReceipt, txHash, originalTransactionId);
        }
      } catch (error) {
        this.logger.warn(`Error in initial receipt check: ${error.message}`);
        // Continue to polling - don't abort on initial check error
      }
      
      // Wait for transaction to be mined with timeout
      this.logger.log(`Waiting for transaction ${txHash} to be mined...`);
      let receipt = null;
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = 3000; // 3 seconds between polls
      
      while (!receipt && attempts < maxAttempts) {
        attempts++;
        try {
          receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) {
            this.logger.log(`Transaction ${txHash} mined after ${attempts} attempts`);
            break;
          }
          this.logger.log(`Transaction ${txHash} not yet mined, attempt ${attempts}/${maxAttempts}`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        } catch (error) {
          this.logger.warn(`Error checking transaction receipt (attempt ${attempts}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
      
      if (!receipt) {
        this.logger.warn(`Transaction ${txHash} not mined after ${maxAttempts} attempts`);
        
        // If we have the original transaction ID, update the database to mark it as pending for later processing
        if (originalTransactionId) {
          try {
            const existingTransaction = await this.transactionRepository.findOne({ where: { id: originalTransactionId } });
            
            if (existingTransaction) {
              // Get current metadata or initialize if not exists
              const currentMetadata = existingTransaction?.metadata || {};
              
              // Update metadata to include information about pending blockchain confirmation
              const updatedMetadata = {
                ...currentMetadata,
                offramp: {
                  ...(currentMetadata.offramp || {}),
                  txHash,
                  lastPollingAttempt: new Date().toISOString(),
                  maxAttemptsReached: true
                }
              };
              
              // Update the transaction in the database
              await this.transactionRepository.update(
                { id: originalTransactionId },
                { 
                  metadata: updatedMetadata,
                  status: TransactionStatus.PENDING  // Make sure it stays as PENDING for later processing
                }
              );
              
              // Create or update OfframpTransaction record
              let offrampTransaction = await this.offrampTransactionRepository.findOne({
                where: { transactionId: originalTransactionId }
              });
              
              if (offrampTransaction) {
                await this.offrampTransactionRepository.update(
                  { id: offrampTransaction.id },
                  {
                    status: TransactionStatus.PENDING,
                    metadata: updatedMetadata.offramp
                  }
                );
              } else {
                // We should have created this in the processOrder method, but create it here as backup
                offrampTransaction = this.offrampTransactionRepository.create({
                  transactionId: originalTransactionId,
                  transactionHash: txHash,
                  status: TransactionStatus.PENDING,
                  metadata: updatedMetadata.offramp
                });
                await this.offrampTransactionRepository.save(offrampTransaction);
              }
              
              this.logger.log(`Updated transaction ${originalTransactionId} as pending confirmation - max polling attempts reached`);
            } else {
              this.logger.warn(`Transaction ${originalTransactionId} not found for pending update`);
            }
          } catch (dbError) {
            this.logger.error(`Error updating transaction ${originalTransactionId} as pending: ${dbError.message}`);
          }
        }
        
        return null;
      }
      
      // Check if the transaction reverted
      if (receipt.status === 0) {
        this.logger.warn(`Transaction ${txHash} reverted on-chain`);
        
        // If we have the original transaction ID, update the database to mark it as failed
        if (originalTransactionId) {
          try {
            const existingTransaction = await this.transactionRepository.findOne({ where: { id: originalTransactionId } });
            
            if (existingTransaction) {
              // Get current metadata or initialize if not exists
              const currentMetadata = existingTransaction?.metadata || {};
              
              // Update metadata to include information about the revert
              const updatedMetadata = {
                ...currentMetadata,
                offramp: {
                  ...(currentMetadata.offramp || {}),
                  txHash,
                  lastPollingAttempt: new Date().toISOString(),
                  transactionReverted: true,
                  revertTimestamp: new Date().toISOString()
                }
              };
              
              // Update the transaction in the database
              await this.transactionRepository.update(
                { id: originalTransactionId },
                { 
                  metadata: updatedMetadata,
                  status: TransactionStatus.FAILED  // Mark as FAILED since the transaction reverted
                }
              );
              
              // Update OfframpTransaction record
              let offrampTransaction = await this.offrampTransactionRepository.findOne({
                where: { transactionId: originalTransactionId }
              });
              
              if (offrampTransaction) {
                await this.offrampTransactionRepository.update(
                  { id: offrampTransaction.id },
                  {
                    status: TransactionStatus.FAILED,
                    metadata: {
                      ...(offrampTransaction.metadata || {}),
                      transactionReverted: true,
                      revertTimestamp: new Date().toISOString()
                    }
                  }
                );
              }
              
              this.logger.log(`Updated transaction ${originalTransactionId} as failed due to on-chain revert`);
            }
          } catch (dbError) {
            this.logger.error(`Error updating transaction ${originalTransactionId} as failed: ${dbError.message}`);
          }
        }
        
        return { reverted: true, receipt };
      }
      
      // Extract logs from the receipt
      return this.extractLogsFromReceipt(receipt, txHash, originalTransactionId);
    } catch (error) {
      this.logger.error(`Error extracting logs from transaction ${txHash}: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Final safety check to verify transaction state after polling is complete
   * Checks transaction hash from the database to ensure it hasn't reverted
   */
  async verifyTransactionFinalState(chainId: number | string, orderId: string, transactionId: string): Promise<void> {
    try {
      // Get transaction data
      const offrampTransaction = await this.offrampTransactionRepository.findOne({
        where: { transactionId }
      });
      
      if (!offrampTransaction || !offrampTransaction.transactionHash) {
        this.logger.warn(`Cannot verify final state for ${transactionId} - no transaction hash found`);
        return;
      }
      
      const txHash = offrampTransaction.transactionHash;
      const rpcUrl = offrampTransaction.rpcUrl;
      
      if (!rpcUrl) {
        this.logger.warn(`Cannot verify final state for transaction ${txHash} - no RPC URL found`);
        return;
      }
      
      // Create provider using the stored RPC URL
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Get the final transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      
      // If transaction reverted, update status
      if (receipt && receipt.status === 0) {
        this.logger.warn(`Final verification: Transaction ${txHash} reverted on-chain`);
        
        // Update transaction status to failed
        await this.updateTransactionAsFailed(transactionId, offrampTransaction);
        
        this.logger.log(`Updated transaction ${transactionId} as failed in final verification`);
      } else {
        this.logger.log(`Final verification: Transaction ${txHash} confirmed successful`);
      }
    } catch (error) {
      this.logger.error(`Error in final transaction verification: ${error.message}`);
    }
  }

  /**
   * Helper method to update transaction as failed during final verification
   */
  private async updateTransactionAsFailed(transactionId: string, offrampTransaction: OfframpTransaction): Promise<void> {
    // Update transaction status to failed
    await this.transactionRepository.update(
      { id: transactionId },
      { 
        status: TransactionStatus.FAILED,
        metadata: {
          ...(offrampTransaction.metadata || {}),
          finalVerification: {
            verifiedAt: new Date().toISOString(),
            reverted: true
          }
        }
      }
    );
    
    // Update offramp transaction
    await this.offrampTransactionRepository.update(
      { id: offrampTransaction.id },
      {
        status: TransactionStatus.FAILED,
        metadata: {
          ...(offrampTransaction.metadata || {}),
          finalVerification: {
            verifiedAt: new Date().toISOString(),
            reverted: true
          }
        }
      }
    );
  }
} 