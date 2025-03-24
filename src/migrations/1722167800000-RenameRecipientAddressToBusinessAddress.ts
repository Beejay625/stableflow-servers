import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameRecipientAddressToBusinessAddress1722167800000 implements MigrationInterface {
    name = 'RenameRecipientAddressToBusinessAddress1722167800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add the new column first (cannot rename columns directly in Postgres)
        await queryRunner.query(`ALTER TABLE "transactions" ADD "businessAddress" character varying NOT NULL DEFAULT 'unknown'`);
        
        // Copy data from old column to new column
        await queryRunner.query(`UPDATE "transactions" SET "businessAddress" = "recipientAddress"`);
        
        // Add index to the new column
        await queryRunner.query(`CREATE INDEX "IDX_transactions_businessAddress" ON "transactions" ("businessAddress")`);
        
        // Drop the index from the old column if it exists
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_87daab7100f442109f5081c581"`);
        
        // Drop the old column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "recipientAddress"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Recreate the old column
        await queryRunner.query(`ALTER TABLE "transactions" ADD "recipientAddress" character varying NOT NULL DEFAULT 'unknown'`);
        
        // Copy data back
        await queryRunner.query(`UPDATE "transactions" SET "recipientAddress" = "businessAddress"`);
        
        // Recreate the original index
        await queryRunner.query(`CREATE INDEX "IDX_87daab7100f442109f5081c581" ON "transactions" ("recipientAddress")`);
        
        // Drop the new index
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_businessAddress"`);
        
        // Drop the new column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "businessAddress"`);
    }
} 