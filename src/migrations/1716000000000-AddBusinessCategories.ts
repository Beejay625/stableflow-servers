import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessCategories1716000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add standard business categories
    const categories = [
      // Retail & Shopping
      { name: 'Clothing & Apparel', description: 'Fashion, clothing, and apparel stores' },
      { name: 'Electronics', description: 'Consumer electronics and gadgets' },
      { name: 'Furniture & Home Decor', description: 'Home furnishings and decor items' },
      { name: 'Beauty & Cosmetics', description: 'Beauty products, cosmetics, and personal care' },
      { name: 'Jewelry & Accessories', description: 'Jewelry, watches, and fashion accessories' },
      { name: 'Toys & Games', description: 'Toys, games, and hobby supplies' },
      { name: 'Sports & Outdoors', description: 'Sporting goods and outdoor equipment' },
      
      // Food & Beverage
      { name: 'Restaurants', description: 'Dining establishments and eateries' },
      { name: 'Cafes & Coffee Shops', description: 'Coffee shops, cafes, and bakeries' },
      { name: 'Bars & Pubs', description: 'Bars, pubs, and nightlife venues' },
      { name: 'Grocery & Food Retail', description: 'Grocery stores and specialty food retailers' },
      { name: 'Catering & Food Services', description: 'Catering and food service providers' },
      
      // Entertainment & Leisure
      { name: 'Entertainment', description: 'Entertainment venues and services' },
      { name: 'Cinema & Theaters', description: 'Movie theaters and performing arts venues' },
      { name: 'Music & Concerts', description: 'Music venues, concert halls, and performances' },
      { name: 'Art Galleries & Museums', description: 'Galleries, museums, and cultural institutions' },
      { name: 'Recreation & Leisure', description: 'Recreational activities and leisure facilities' },
      
      // Health & Wellness
      { name: 'Healthcare Services', description: 'Medical and healthcare service providers' },
      { name: 'Fitness & Gyms', description: 'Fitness centers, gyms, and wellness facilities' },
      { name: 'Spa & Wellness', description: 'Spas, wellness centers, and relaxation services' },
      { name: 'Mental Health', description: 'Mental health services and counseling' },
      
      // Professional Services
      { name: 'Financial Services', description: 'Banking, finance, and investment services' },
      { name: 'Legal Services', description: 'Law firms and legal service providers' },
      { name: 'Consulting', description: 'Business and professional consulting services' },
      { name: 'Real Estate', description: 'Real estate agencies and property services' },
      { name: 'Marketing & Advertising', description: 'Marketing, advertising, and PR agencies' },
      
      // Technology
      { name: 'Software & IT', description: 'Software development and IT services' },
      { name: 'Web Development', description: 'Web design and development services' },
      { name: 'App Development', description: 'Mobile and application development' },
      { name: 'E-commerce', description: 'Online retail and e-commerce businesses' },
      
      // Education & Training
      { name: 'Education', description: 'Educational institutions and services' },
      { name: 'Training & Workshops', description: 'Professional training and workshops' },
      { name: 'Tutoring & Coaching', description: 'Tutoring, coaching, and mentoring services' },
      
      // Travel & Hospitality
      { name: 'Hotels & Accommodation', description: 'Hotels, resorts, and lodging facilities' },
      { name: 'Travel Agencies', description: 'Travel agencies and tour operators' },
      { name: 'Transportation', description: 'Transportation and logistics services' },
      
      // Automotive
      { name: 'Automotive Sales', description: 'Car dealerships and vehicle sales' },
      { name: 'Automotive Service', description: 'Auto repair and maintenance services' },
      
      // Home Services
      { name: 'Construction', description: 'Construction and building services' },
      { name: 'Home Repair & Maintenance', description: 'Home repair and maintenance services' },
      { name: 'Cleaning Services', description: 'Residential and commercial cleaning services' },
      
      // Others
      { name: 'Non-Profit & Charity', description: 'Non-profit organizations and charities' },
      { name: 'Agriculture & Farming', description: 'Agricultural businesses and farming' },
      { name: 'Manufacturing', description: 'Manufacturing and production businesses' },
      { name: 'Arts & Crafts', description: 'Handmade goods and craft businesses' },
      { name: 'Event Planning', description: 'Event planning and management services' },
      { name: 'Pet Services', description: 'Pet care, grooming, and veterinary services' }
    ];

    // Insert categories into database
    for (const category of categories) {
      await queryRunner.query(
        `INSERT INTO "categories" ("name", "description", "isCustom", "isActive", "createdAt", "updatedAt") 
         VALUES ($1, $2, FALSE, TRUE, NOW(), NOW())
         ON CONFLICT ("name") DO NOTHING`,
        [category.name, category.description]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This will not remove the categories as it would be destructive
    // If we want to revert all categories added by this migration,
    // we would need to keep track of their IDs or have some other way to identify them
    console.log('Cannot revert business categories migration as it would be destructive');
  }
} 