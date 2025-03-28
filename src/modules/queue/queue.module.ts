import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { RedisModule } from "../redis/redis.module";
import { TransactionQueueService } from './services/transaction-queue.service';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TransactionRepository } from '../wallet/repositories/transaction.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../wallet/entities/transaction.entity';

@Module({
  imports: [
    RedisModule,
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
          tls: {
            rejectUnauthorized: false
          }
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'transaction-processing',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
        removeOnFail: false
      }
    }),
    BullModule.registerQueue({
      name: 'transaction-dlq'
    }),
    TypeOrmModule.forFeature([Transaction])
  ],
  providers: [QueueService, TransactionQueueService, TransactionRepository],
  exports: [QueueService, TransactionQueueService, TransactionRepository],
})
export class QueueModule {}
