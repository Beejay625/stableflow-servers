import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { OfframpService } from './offramp.service';
import { OfframpController } from './offramp.controller';
import { PrepareTransactionService } from './preparetransaction.service';
import { Transaction } from '../wallet/entities/transaction.entity';
import { Business } from '../business/entities/business.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([Transaction, Business]),
    RedisModule,
    ScheduleModule.forRoot()
  ],
  controllers: [
    OfframpController
  ],
  providers: [
    OfframpService,
    PrepareTransactionService
  ],
  exports: [
    OfframpService,
    PrepareTransactionService
  ]
})
export class OfframpModule {} 