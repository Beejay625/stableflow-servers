import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { RedisModule } from "../redis/redis.module";
import { BullModule } from "@nestjs/bull";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Transaction } from "../wallet/entities/transaction.entity";

@Module({
  imports: [
    RedisModule,
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>("REDIS_HOST"),
          port: configService.get<number>("REDIS_PORT"),
          password: configService.get<string>("REDIS_PASSWORD"),
          tls: {
            rejectUnauthorized: false,
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: "transaction-processing",
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    BullModule.registerQueue({
      name: "transaction-dlq",
    }),
    BullModule.registerQueue({
      name: "processing-attempt",
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    BullModule.registerQueue({
      name: "failed-recovery",
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 120000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    TypeOrmModule.forFeature([Transaction]),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
