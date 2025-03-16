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
// Remove direct import to avoid circular dependency
// import { Category } from './category.entity';

/**
 * Enum for onboarding steps
 */
export enum OnboardingStep {
  NOT_STARTED = 'NOT_STARTED',
  BUSINESS_SETUP = 'BUSINESS_SETUP',
  ACCOUNT_SETUP = 'ACCOUNT_SETUP',
  COMPLETED = 'COMPLETED'
}

/**
 * Enum for account types
 */
export enum AccountType {
  POS = 'pos',
  CASH = 'cash'
}

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

  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({
    type: 'enum',
    enum: OnboardingStep,
    default: OnboardingStep.NOT_STARTED
  })
  onboardingStep: OnboardingStep;

  // Bank account information
  // These are nullable during initial registration but required for verified businesses
  @Column({ nullable: true, length: 20 })
  bankCode: string;

  @Column({ nullable: true, length: 20 })
  accountNumber: string;

  @Column({ nullable: true, length: 50 })
  accountName: string;

  @Column({ 
    nullable: true, 
    type: 'enum',
    enum: AccountType
  })
  accountType: AccountType;

  @Column({ nullable: true, default: 'USD' })
  settlementCurrency: string;

  // Category relationship
  @ManyToOne('Category', (category: any) => category.businesses)
  @JoinColumn({ name: 'category_id' })
  category: any;

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
}