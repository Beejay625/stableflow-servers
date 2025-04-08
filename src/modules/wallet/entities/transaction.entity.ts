import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from "typeorm";
import { Business } from "../../business/entities/business.entity";
import { TransactionStatus } from "../constants/status.enum";
// Commenting out import since offramp is in skeleton form
// import { OfframpAttempt } from './offramp-attempt.entity';

@Entity({ name: "transactions" })
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ nullable: false, unique: true })
  @Index()
  transactionId: string;

  @Column({ nullable: false })
  @Index()
  businessId: string;

  @Column({ type: "float", default: 0 })
  tokenAmount: number;

  @Column({ type: "float", nullable: true })
  fiatAmount: number;

  @Column({ nullable: true })
  fiatCurrency: string;

  @Column({ nullable: false })
  token: string;

  @Column({ nullable: false })
  chain: string;

  @Column({
    type: "varchar",
    default: TransactionStatus.UNSETTLED,
  })
  status: string; // Using string type for status

  @Column({ nullable: true })
  txHash: string;

  @Column({ nullable: true })
  gatewayTxId: string;

  @Column({ nullable: true })
  senderAddress: string;

  @Column({ nullable: true })
  businessAddress: string;

  @Column({ nullable: true })
  addressId: string;

  @Column({ nullable: true })
  walletId: string;

  @Column({ type: "float", nullable: true })
  exchangeRate: number;

  @Column({ nullable: true })
  settlementProvider: string;

  @Column({ nullable: true })
  settlementReference: string;

  @Column({ nullable: true })
  offrampOrderId: string;

  @Column({ default: false })
  isSettled: boolean;

  @Column({ nullable: true })
  settledAt: Date;

  @Column({ nullable: true })
  processedAt: Date;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;

  @Column({ nullable: true, type: "jsonb" })
  settlementData: any;

  @CreateDateColumn()
  receivedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Business)
  @JoinColumn({ name: "businessId" })
  business: Business;
}
