import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { TransactionStatus } from '../constants/status.enum';
// Commenting out import since offramp is in skeleton form
// import { OfframpAttempt } from './offramp-attempt.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  transactionId: string;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8,
    default: 0 
  })
  tokenAmount: number;

  @Column({ 
    nullable: true, 
    type: 'numeric', 
    precision: 10, 
    scale: 2
  })
  fiatAmount: number;

  @CreateDateColumn()
  @Index()
  receivedAt: Date;
  
  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  token: string; // Token symbol (e.g. USDT, USDC)

  @Column({ 
    nullable: true 
  })
  chain: string; // Blockchain name (e.g. BNB smart chain, Ethereum)

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.UNSETTLED
  })
  @Index()
  status: TransactionStatus;

  @Column({ 
    default: 'unknown' 
  })
  @Index()
  businessAddress: string;

  @Column({ 
    default: 'unknown' 
  })
  senderAddress: string;

  @Column({ 
    nullable: true 
  })
  walletId: string;

  @Column({ 
    default: 'unknown' 
  })
  @Index()
  addressId: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  offrampOrderId: string;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  // Relationships
  @ManyToOne(() => Business, business => business.transactions)
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  @Index()
  businessId: string;

  // Commenting out the entire offramp relationship as it's still in skeleton form
  /*
  @ManyToOne(
    () => OfframpAttempt,
    (offrampAttempt) => offrampAttempt.transactions,
    { nullable: true },
  )
  @JoinColumn({ name: 'offrampOrderId', referencedColumnName: 'orderId' })
  offrampAttempt: OfframpAttempt;
  */
} 