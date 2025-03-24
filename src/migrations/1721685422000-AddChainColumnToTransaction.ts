import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChainColumnToTransaction1721685422000 implements MigrationInterface {
    name = 'AddChainColumnToTransaction1721685422000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add the metadata column if it doesn't exist
        const hasMetadata = await queryRunner.hasColumn('transactions', 'metadata');
        if (!hasMetadata) {
            await queryRunner.query(`ALTER TABLE "transactions" ADD "metadata" jsonb DEFAULT '{}'::jsonb`);
        }

        // Add the chain column to the transactions table
        await queryRunner.query(`ALTER TABLE "transactions" ADD "chain" character varying DEFAULT 'ethereum'`);
        
        // Update existing records using data from metadata if available
        await queryRunner.query(`
            UPDATE "transactions" 
            SET "chain" = COALESCE(metadata->>'chain', 'ethereum')
        `);

        // Make chain not null
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "chain" SET NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the chain column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "chain"`);
    }
} 