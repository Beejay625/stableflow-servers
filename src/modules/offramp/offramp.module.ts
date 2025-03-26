import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { OfframpService } from './offramp.service';
import { OfframpController } from './offramp.controller';
import { PrepareTransactionService } from './preparetransaction.service';
import { Transaction } from '../wallet/entities/transaction.entity';
import { Business } from '../business/entities/business.entity';
import { RedisModule } from '../redis/redis.module';
import { OfframpProcessor } from './processors/offramp.processor';
import { MailService } from '../../common/utils/email';
import { TransactionRecoveryService } from './services/transaction-recovery.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([Transaction, Business]),
    RedisModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'transaction-processing'
    }),
    QueueModule
  ],
  controllers: [
    OfframpController
  ],
  providers: [
    OfframpService,
    PrepareTransactionService,
    OfframpProcessor,
    MailService,
    TransactionRecoveryService
  ],
  exports: [
    OfframpService,
    PrepareTransactionService,
    TransactionRecoveryService
  ]
})
export class OfframpModule {} 