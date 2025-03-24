import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOwnerIdToCategories1742181209741 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add ownerId column to categories table
        await queryRunner.query(`
            ALTER TABLE "categories"
            ADD COLUMN "ownerId" VARCHAR;
        `);

        // Add index on ownerId for custom categories
        await queryRunner.query(`
            CREATE INDEX "idx_categories_owner_custom" 
            ON "categories" ("ownerId") 
            WHERE "isCustom" = true;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the index first
        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_categories_owner_custom";
        `);

        // Drop the ownerId column
        await queryRunner.query(`
            ALTER TABLE "categories"
            DROP COLUMN "ownerId";
        `);
    }
} 