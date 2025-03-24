import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChainColumnToTransaction1721685422000 implements MigrationInterface {
    name = 'AddChainColumnToTransaction1721685422000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add the chain column to the transactions table
        await queryRunner.query(`ALTER TABLE "transactions" ADD "chain" character varying`);
        
        // Update existing records using data from metadata if available
        await queryRunner.query(`
            UPDATE "transactions" 
            SET "chain" = metadata->>'chain' 
            WHERE metadata->>'chain' IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the chain column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "chain"`);
    }
} 