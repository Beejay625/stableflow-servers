import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameWalletIdToAddressId1721685420000 implements MigrationInterface {
    name = 'RenameWalletIdToAddressId1721685420000'

    public async up(queryRunner: QueryRunner): Promise<void> {
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
