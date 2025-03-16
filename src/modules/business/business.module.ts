import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from './entities/business.entity';
import { Category } from './entities/category.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { PaycrestModule } from '../paycrest/paycrest.module';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, Category]),
    PaycrestModule,
  ],
  providers: [BusinessService],
  controllers: [BusinessController],
  exports: [BusinessService],
})
export class BusinessModule {} 