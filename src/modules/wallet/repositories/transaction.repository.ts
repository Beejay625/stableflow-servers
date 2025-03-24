import { EntityRepository, Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { TransactionStatus } from '../constants/status.enum';
import { LessThan } from 'typeorm';

@EntityRepository(Transaction)
export class TransactionRepository extends Repository<Transaction> {
  async findStalledTransactions(): Promise<Transaction[]> {
    return this.createQueryBuilder('transaction')
      .where('transaction.status = :status', { status: TransactionStatus.STALLED })
      .andWhere('transaction.updatedAt < :threshold', {
        threshold: new Date(Date.now() - 10 * 60 * 1000)
      })
      .getMany();
  }
} 