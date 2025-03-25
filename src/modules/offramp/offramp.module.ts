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
import { AwaitingWebhookWorker } from './workers/awaiting-webhook.worker';
import { ProcessTransactionsWorker } from './workers/process-transactions.worker';
import { OfframpQueueProcessor } from './workers/process-queue.worker';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([Transaction, Business]),
    RedisModule,
    QueueModule,
    ScheduleModule.forRoot()
  ],
  controllers: [
    OfframpController
  ],
  providers: [
    OfframpService,
    PrepareTransactionService,
    AwaitingWebhookWorker,
    ProcessTransactionsWorker,
    OfframpQueueProcessor,
    {
      provide: 'OfframpQueueProcessor',
      useExisting: OfframpQueueProcessor
    }
  ],
  exports: [
    OfframpService,
    PrepareTransactionService,
    OfframpQueueProcessor,
    'OfframpQueueProcessor'
  ]
})
export class OfframpModule {} 