import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameWalletAddressToRecipientAddress1721685421000 implements MigrationInterface {
    name = 'RenameWalletAddressToRecipientAddress1721685421000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new column
        await queryRunner.query(`ALTER TABLE "transactions" ADD "recipientAddress" character varying DEFAULT 'unknown'`);
        
        // Copy data from old column to new column
        await queryRunner.query(`UPDATE "transactions" SET "recipientAddress" = "walletAddress"`);
        
        // Make the new column not null
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "recipientAddress" SET NOT NULL`);
        
        // Drop the old index
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_4c0dfa8d3f69951987f75fa583"`);
        
        // Create new index
        await queryRunner.query(`CREATE INDEX "IDX_transactions_recipient_address" ON "transactions" ("recipientAddress")`);
        
        // Drop old column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "walletAddress"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add old column back
        await queryRunner.query(`ALTER TABLE "transactions" ADD "walletAddress" character varying DEFAULT 'unknown'`);
        
        // Copy data from new column to old column
        await queryRunner.query(`UPDATE "transactions" SET "walletAddress" = "recipientAddress"`);
        
        // Make the old column not null
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "walletAddress" SET NOT NULL`);
        
        // Drop new index
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_recipient_address"`);
        
        // Recreate old index
        await queryRunner.query(`CREATE INDEX "IDX_4c0dfa8d3f69951987f75fa583" ON "transactions" ("walletAddress")`);
        
        // Drop new column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "recipientAddress"`);
    }
} 