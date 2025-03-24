import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Check
} from 'typeorm';
import { User } from '../../auth/entities/auth.entity';
import { Category } from './category.entity';
import { Transaction } from '../../wallet/entities/transaction.entity';

/**
 * Constants for onboarding steps
 */
export const OnboardingStep = {
  NOT_STARTED: 'NOT_STARTED',
  BUSINESS_SETUP: 'BUSINESS_SETUP',
  ACCOUNT_SETUP: 'ACCOUNT_SETUP',
  COMPLETED: 'COMPLETED'
} as const;

export type OnboardingStep = typeof OnboardingStep[keyof typeof OnboardingStep];

/**
 * Constants for account types
 */
export const AccountType = {
  POS: 'pos',
  CASH: 'cash'
} as const;

export type AccountType = typeof AccountType[keyof typeof AccountType];

/**
 * Entity for storing business information including bank details
 * Business verification follows a two-step process:
 * 1. Business entity setup
 * 2. Account details setup
 */
@Entity('businesses')
@Check(`"isVerified" = false OR ("bankCode" IS NOT NULL AND "accountNumber" IS NOT NULL AND "onboardingStep" = 'COMPLETED')`)
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 20 })
  phoneNumber: string;

  /**
   * @deprecated This field is no longer used. Will be removed in a future version.
   */
  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({
    type: 'enum',
    enum: Object.values(OnboardingStep),
    default: OnboardingStep.NOT_STARTED
  })
  onboardingStep: OnboardingStep;

  // Bank account information
  // These are nullable during initial registration but required for verified businesses
  @Column({ nullable: true })
  bankCode: string;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  accountName: string;

  @Column({ nullable: true })
  accountType: string;

  // Blockchain wallet address
  @Column({ nullable: true, length: 42 })
  walletAddress: string;

  // Blockchain wallet ID from BlockRadar
  @Column({ nullable: true, length: 36 })
  addressId: string;

  // Category relationship using proper TypeORM way to handle circular dependencies
  @ManyToOne(type => Category, category => category.businesses, { 
    nullable: true,
    eager: true 
  })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ nullable: true })
  categoryId: string;

  // Owner relationship
  @ManyToOne(() => User)
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: string;

  // Wallet addresses will be linked via a relation from the Wallet module
  // Transactions will be linked via a relation from the Transaction module

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Transaction, transaction => transaction.business)
  transactions: Transaction[];
}