import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { databaseConfig } from '../src/common/config/typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const config = databaseConfig(configService);

        return {
          ...config,
          type: 'postgres',  // Ensure PostgreSQL is explicitly set
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USER'),
          password: configService.get<string>('DB_PASSWORD'),
          database: `${configService.get<string>('DB_NAME')}_test`, // Ensure it's a string
          synchronize: true,  // Enable auto schema sync for testing
          dropSchema: true,   // Drop schema after tests
          entities: config.entities || [], // Ensure entities are loaded
          autoLoadEntities: true, // Auto-load entities if needed
        } as TypeOrmModuleOptions;
      },
    }),
  ],
})
export class TestDatabaseModule {}