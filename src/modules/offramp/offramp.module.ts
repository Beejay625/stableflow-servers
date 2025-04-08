import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { ScheduleModule } from "@nestjs/schedule";
import { OfframpService } from "./offramp.service";
import { OfframpController } from "./offramp.controller";
import { PrepareTransactionService } from "./preparetransaction.service";
import { Transaction } from "../wallet/entities/transaction.entity";
import { Business } from "../business/entities/business.entity";
import { RedisModule } from "../redis/redis.module";
import { OfframpProcessor } from "./processors/offramp.processor";
import { MailService } from "../../common/utils/email";
import { QueueModule } from "../queue/queue.module";
import { WalletConfigService } from "../../common/utils/wallet-config";
import { PaycrestModule } from "../paycrest/paycrest.module";
import { WebhookHandler } from './handlers/webhook.handler';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([Transaction, Business]),
    RedisModule,
    ScheduleModule.forRoot(),
    QueueModule,
    PaycrestModule,
  ],
  controllers: [OfframpController],
  providers: [
    OfframpService,
    PrepareTransactionService,
    OfframpProcessor,
    MailService,
    WalletConfigService,
    WebhookHandler,
  ],
  exports: [
    OfframpService,
    PrepareTransactionService,
    WebhookHandler,
  ],
})
export class OfframpModule {}
