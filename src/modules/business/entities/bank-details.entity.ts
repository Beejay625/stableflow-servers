import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  OneToOne,
  JoinColumn
} from 'typeorm';
import { Business } from './business.entity';

export enum AccountType {
  POS = 'pos',
  CASH = 'cash',
  SAVINGS = 'savings',
  CURRENT = 'current',
}

@Entity('bank_details')
export class BankDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  bankCode: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  accountName: string;

  @Column({
    type: 'enum',
    enum: AccountType,
    nullable: true
  })
  accountType: AccountType;

  @Column({ type: 'uuid' })
  businessId: string;

  @Column({ type: 'timestamp', nullable: true })
  lastVerifiedAt: Date;

  @OneToOne(() => Business, business => business.bankDetails)
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 