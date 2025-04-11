import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Transaction } from '../../wallet/entities/transaction.entity';

/**
 * Entity to store offramp-specific transaction data
 * Links to the main Transaction entity and provides dedicated columns for offramp details
 */
@Entity({ name: 'offramp_transactions' })
export class OfframpTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  @Index()
  transactionId: string;  // ID of the parent Transaction entity

  @Column({ nullable: true })
  @Index()
  offrampTransactionId: string;  // ID from the offramp API response

  @Column({ nullable: true })
  @Index()
  offrampId: string;  // Order ID from blockchain logs

  @Column({ nullable: true })
  transactionHash: string;  // Blockchain transaction hash

  @Column({ nullable: true })
  tokenAddress: string;  // Address of the token used

  @Column({ nullable: true })
  tokenSymbol: string;  // Symbol of the token used

  @Column({ type: 'float', nullable: true })
  amount: number;  // Amount of tokens in the transaction

  @Column({ nullable: true })
  refundAddress: string;  // Address for refunds if needed

  @Column({ nullable: true })
  network: string;  // Blockchain network (e.g., "BNB Smart Chain")

  @Column({ nullable: true })
  rpcUrl: string;  // RPC URL used for blockchain interactions

  @Column({ nullable: true })
  chainId: number;  // Chain ID for the blockchain network

  @Column({ type: 'float', nullable: true })
  rate: number;  // Exchange rate in basis points

  @Column({ nullable: true })
  status: string;  // Processing status of the offramp

  @Column({ nullable: true })
  recipientBank: string;  // Recipient's bank code

  @Column({ nullable: true })
  recipientAccount: string;  // Recipient's account number

  @Column({ nullable: true })
  recipientName: string;  // Recipient's name

  @Column({ nullable: true })
  currency: string;  // Fiat currency (e.g., "NGN")

  @Column({ type: 'jsonb', nullable: true })
  logs: any;  // Raw logs from blockchain

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;  // Additional metadata

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Transaction)
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;
} 