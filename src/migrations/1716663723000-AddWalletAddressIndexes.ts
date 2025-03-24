import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletAddressIndexes1716663723000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the walletAddress column exists before creating the index
    const hasWalletAddress = await queryRunner.hasColumn('businesses', 'walletAddress');
    if (hasWalletAddress) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_businesses_wallet_address" 
        ON "businesses" ("walletAddress")
      `);
    }
    
    // Check if the addressId column exists before creating the index
    const hasAddressId = await queryRunner.hasColumn('businesses', 'addressId');
    if (hasAddressId) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_businesses_address_id" 
        ON "businesses" ("addressId")
      `);
    }
    
    // Check if transactions table exists before creating indexes
    const hasTransactionsTable = await queryRunner.hasTable('transactions');
    if (hasTransactionsTable) {
      // Add index to transactions.transactionId for faster duplicate checks
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_transactions_transaction_id" 
        ON "transactions" ("transactionId")
      `);
      
      // Add composite index on business ID and status for faster transaction lookups
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_transactions_business_status" 
        ON "transactions" ("businessId", "status")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes if needed
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_businesses_wallet_address"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_businesses_address_id"`);
    
    // Check if transactions table exists before dropping indexes
    const hasTransactionsTable = await queryRunner.hasTable('transactions');
    if (hasTransactionsTable) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_transaction_id"`);
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_business_status"`);
    }
  }
} 