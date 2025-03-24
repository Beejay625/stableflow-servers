import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { OfframpService } from './offramp.service';
import { Transaction } from '../wallet/entities/transaction.entity';
import { Business } from '../business/entities/business.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Transaction, Business])
  ],
  providers: [OfframpService],
  exports: [OfframpService]
})
export class OfframpModule {} 