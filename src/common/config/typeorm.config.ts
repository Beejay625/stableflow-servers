import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const nodeEnv = configService.get('NODE_ENV');
  
  return {
    type: 'postgres',
    host: configService.get('DB_HOST'),
    port: configService.get('DB_PORT'),
    username: configService.get('DB_USER') || configService.get('DB_USERNAME'),
    password: configService.get('DB_PASSWORD'),
    database: configService.get('DB_NAME') || configService.get('DB_DATABASE'),
    entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
    // Only enable synchronize in development to prevent accidental data loss in production
    synchronize: nodeEnv === 'development',
    logging: nodeEnv === 'development',
    ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    dropSchema: false,
    migrationsRun: false,
  };
}; 