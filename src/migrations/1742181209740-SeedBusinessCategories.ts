import { MigrationInterface, QueryRunner } from "typeorm";
import { v4 as uuidv4 } from 'uuid';

export class SeedBusinessCategories1742181209740 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Standard business categories
        const categories = [
            { name: 'Retail', description: 'Physical or online stores selling products directly to consumers' },
            { name: 'Food & Beverage', description: 'Restaurants, cafes, food trucks, and other food service businesses' },
            { name: 'Technology', description: 'Software, hardware, IT services, and tech consulting' },
            { name: 'Healthcare', description: 'Medical services, healthcare products, and wellness businesses' },
            { name: 'Education', description: 'Schools, training programs, tutoring, and educational services' },
            { name: 'Financial Services', description: 'Banking, insurance, investment, and financial consulting' },
            { name: 'Real Estate', description: 'Property sales, rentals, management, and development' },
            { name: 'Professional Services', description: 'Legal, accounting, consulting, and business services' },
            { name: 'Transportation', description: 'Logistics, delivery, ride-sharing, and transportation services' },
            { name: 'Entertainment', description: 'Media, events, venues, and entertainment services' },
            { name: 'Manufacturing', description: 'Production of goods and materials' },
            { name: 'Hospitality', description: 'Hotels, accommodations, and tourism services' },
            { name: 'Construction', description: 'Building, renovation, and construction services' },
            { name: 'Agriculture', description: 'Farming, livestock, and agricultural products' },
            { name: 'Wholesale', description: 'Business-to-business product distribution' }
        ];

        // Insert each category with a UUID if it doesn't already exist
        for (const category of categories) {
            // Check if the category already exists
            const existingCategory = await queryRunner.query(
                `SELECT * FROM categories WHERE name = $1`,
                [category.name]
            );

            if (existingCategory.length === 0) {
                const uuid = uuidv4();
                await queryRunner.query(
                    `INSERT INTO categories (id, name, description, "isCustom", "isActive", "createdAt", "updatedAt")
                    VALUES ($1, $2, $3, false, true, NOW(), NOW())`,
                    [uuid, category.name, category.description]
                );
                console.log(`Added category: ${category.name}`);
            } else {
                console.log(`Category already exists: ${category.name}`);
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This is a data seeding migration, so we don't want to remove data
        // If you want to remove the data, you can uncomment the below line
        // await queryRunner.query(`DELETE FROM categories WHERE "isCustom" = false`);
    }

}
