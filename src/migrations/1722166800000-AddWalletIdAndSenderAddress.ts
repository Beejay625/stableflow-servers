import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWalletIdAndSenderAddress1722166800000 implements MigrationInterface {
    name = 'AddWalletIdAndSenderAddress1722166800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add walletId column
        await queryRunner.query(`ALTER TABLE "transactions" ADD "walletId" character varying`);
        
        // Add senderAddress column with default value
        await queryRunner.query(`ALTER TABLE "transactions" ADD "senderAddress" character varying NOT NULL DEFAULT 'unknown'`);
        
        // Update existing records using data from metadata if available
        await queryRunner.query(`
            UPDATE "transactions" 
            SET "walletId" = 'a4de73b6-de04-45f6-8ed3-fd85d1873ac3'
            WHERE "walletId" IS NULL
        `);
        
        // Update senderAddress from metadata if available
        await queryRunner.query(`
            UPDATE "transactions" 
            SET "senderAddress" = metadata->>'senderAddress' 
            WHERE metadata->>'senderAddress' IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the columns in reverse order
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "senderAddress"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "walletId"`);
    }
} 