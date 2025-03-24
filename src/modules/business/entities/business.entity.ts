import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Check
} from 'typeorm';
import { User } from '../../auth/entities/auth.entity';
import { Category } from './category.entity';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { BankDetails, AccountType } from './bank-details.entity';

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

// Re-export AccountType from bank-details.entity
export { AccountType } from './bank-details.entity';

/**
 * Entity for storing business information
 * Business verification follows a two-step process:
 * 1. Business entity setup
 * 2. Account details setup
 */
@Entity('businesses')
@Check(`"isVerified" = false OR ("onboardingStep" = 'COMPLETED')`)
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 20 })
  phoneNumber: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({
    type: 'enum',
    enum: Object.values(OnboardingStep),
    default: OnboardingStep.NOT_STARTED
  })
  onboardingStep: OnboardingStep;

  // Blockchain wallet address
  @Column({ nullable: true, length: 42 })
  walletAddress: string;

  // Blockchain wallet ID from BlockRadar
  @Column({ nullable: true, length: 36 })
  addressId: string;

  // Category relationship
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

  // Bank details relationship
  @OneToOne(() => BankDetails, bankDetails => bankDetails.business, {
    eager: true,
    cascade: true
  })
  bankDetails: BankDetails;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Transaction, transaction => transaction.business)
  transactions: Transaction[];
}