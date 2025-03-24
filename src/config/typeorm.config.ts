import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

const logger = new Logger('Database');

// This configuration is used by the NestJS application
export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  // Use only connection string
  const connectionString = configService.get<string>('DATABASE_URL');
  
  if (!connectionString) {
    logger.error('[DATABASE CONFIG] DATABASE_URL is not defined in environment variables');
    throw new Error('DATABASE_URL is required');
  }
  
  const config: TypeOrmModuleOptions = {
    type: 'postgres',
    url: connectionString,
    autoLoadEntities: true,
    synchronize: process.env.NODE_ENV === 'development',
    ssl: connectionString.includes('sslmode=require'),
    logging: process.env.NODE_ENV === 'development',
    extra: {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    },
  };
  
  // Log connection info (hiding sensitive details)
  const sanitizedUrl = connectionString.replace(/\/\/.*@/, '//***:***@');
  logger.log(`[DATABASE CONFIG] Connection URL: ${sanitizedUrl}`);
  logger.log(`[DATABASE CONFIG] Connection Pool Size: ${config.extra.max}`);
  logger.log(`[DATABASE CONFIG] Environment: ${process.env.NODE_ENV}`);
  
  return config;
};

// This DataSource is used for TypeORM CLI migrations and direct database access
const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
  synchronize: false, // ✅ Use migrations instead of synchronize for schema changes
  ssl: process.env.DATABASE_URL?.includes('sslmode=require'),
  logging: process.env.NODE_ENV === 'development',
  extra: {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
});

export default dataSource; 