import { EntityRepository, Repository } from "typeorm";
import { Transaction } from "../entities/transaction.entity";
import { TransactionStatus } from "../constants/status.enum";
import { LessThan } from "typeorm";

@EntityRepository(Transaction)
export class TransactionRepository extends Repository<Transaction> {
  // ... existing code ...
}
