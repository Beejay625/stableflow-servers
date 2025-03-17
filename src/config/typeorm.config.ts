import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

// This configuration is used by the NestJS application
export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  username: configService.get<string>('DB_USER'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_NAME'),
  autoLoadEntities: true, // Automatically load all entities registered by feature modules
  synchronize: process.env.NODE_ENV === 'development', // ❌ Should be disabled in production
  ssl: { rejectUnauthorized: false },
  logging: process.env.NODE_ENV === 'development',
  extra: {
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 10000, // How long to wait for a connection to become available
  },
});

// This DataSource is used for TypeORM CLI migrations and direct database access
const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
  // For CLI migrations, we need to specify the entity pattern
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
  synchronize: false, // ✅ Use migrations instead of synchronize for schema changes
  ssl: { rejectUnauthorized: false },
  logging: process.env.NODE_ENV === 'development',
  extra: {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
});

export default dataSource; 