import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankNameToBusiness1716724800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists first to avoid errors if it does
    const hasColumn = await queryRunner.hasColumn('businesses', 'bankName');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "businesses" ADD "bankName" character varying NULL`);
      console.log('Added bankName column to businesses table');
    } else {
      console.log('bankName column already exists in businesses table');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists first to avoid errors if it doesn't
    const hasColumn = await queryRunner.hasColumn('businesses', 'bankName');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "bankName"`);
      console.log('Removed bankName column from businesses table');
    }
  }
} 