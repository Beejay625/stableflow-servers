import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Business } from './entities/business.entity';
import { Category } from './entities/category.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { PaycrestModule } from '../paycrest/paycrest.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, Category]),
    PaycrestModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_EXPIRY', '24h')
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [BusinessService],
  controllers: [BusinessController],
  exports: [BusinessService],
})
export class BusinessModule {} 