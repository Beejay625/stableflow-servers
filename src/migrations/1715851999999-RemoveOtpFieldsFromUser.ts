import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOtpFieldsFromUser1715851999999 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "otp"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "otpExpiresAt"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "otp" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "otpExpiresAt" TIMESTAMP`);
  }
} 