import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameWalletIdToAddressId1721685420000 implements MigrationInterface {
    name = 'RenameWalletIdToAddressId1721685420000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if transactions table exists
        const hasTransactionsTable = await queryRunner.hasTable('transactions');
        if (!hasTransactionsTable) {
            // Create transactions table if it doesn't exist
            await queryRunner.query(`
                CREATE TABLE "transactions" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "transactionId" character varying NOT NULL,
                    "businessId" uuid NOT NULL,
                    "status" character varying NOT NULL,
                    "walletId" character varying NOT NULL,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_transactions_id" PRIMARY KEY ("id")
                )
            `);
        }

        // Add new column
        await queryRunner.query(`ALTER TABLE "transactions" ADD "addressId" character varying`);
        
        // Copy data from old column to new column
        await queryRunner.query(`UPDATE "transactions" SET "addressId" = "walletId"`);
        
        // Make the new column not null
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "addressId" SET NOT NULL`);
        
        // Drop old column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "walletId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Check if transactions table exists
        const hasTransactionsTable = await queryRunner.hasTable('transactions');
        if (hasTransactionsTable) {
            // Add old column back
            await queryRunner.query(`ALTER TABLE "transactions" ADD "walletId" character varying`);
            
            // Copy data from new column to old column
            await queryRunner.query(`UPDATE "transactions" SET "walletId" = "addressId"`);
            
            // Make the old column not null
            await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "walletId" SET NOT NULL`);
            
            // Drop new column
            await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "addressId"`);
        }
    }
}
