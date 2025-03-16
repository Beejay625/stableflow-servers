import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  OneToMany
} from 'typeorm';
// Remove this import to avoid circular dependency
// import { Business } from './business.entity';

/**
 * Entity for storing business categories
 */
@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true })
  name: string;

  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({ default: false })
  isCustom: boolean;
  
  @Column({ default: true })
  isActive: boolean;

  @OneToMany('Business', (business: any) => business.category)
  businesses: any[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
