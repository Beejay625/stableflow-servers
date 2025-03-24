import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Transaction } from './transaction.entity';
import { IsUUID, IsNotEmpty } from 'class-validator';

/*
 * This is a skeleton entity for offramp attempts
 * Relationship with Transaction is commented out until fully implemented
 */
@Entity('offramp_attempts')
export class OfframpAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @IsUUID()
  @Column()
  transactionId: string;

  @IsNotEmpty()
  @Column()
  orderId: string;

  @Column({ type: 'json' })
  payload: Record<string, any>;

  @CreateDateColumn()
  attemptedAt: Date;

  @Column({ nullable: true })
  responseCode: string;

  @Column({ nullable: true })
  responseStatus: string;

  @Column({ nullable: true, type: 'json' })
  responseData: Record<string, any>;

  @Column({ nullable: true })
  processingDuration: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // Commenting out transaction relationship as it's still in skeleton form
  /*
  @ManyToOne(() => Transaction, transaction => transaction.offrampAttempts)
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;
  */
}
