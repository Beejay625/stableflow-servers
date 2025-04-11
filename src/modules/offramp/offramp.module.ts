import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { ScheduleModule } from "@nestjs/schedule";
import { OfframpService } from "./services/offramp.service";
import { PrepareTransactionService } from "./preparetransaction.service";
import { Transaction } from "../wallet/entities/transaction.entity";
import { Business } from "../business/entities/business.entity";
import { RedisModule } from "../redis/redis.module";
import { OfframpProcessor } from "./processors/offramp.processor";
import { MailService } from "../../common/utils/email";
import { QueueModule } from "../queue/queue.module";
import { WalletConfigService } from "../../common/utils/wallet-config";
import { PaycrestModule } from "../paycrest/paycrest.module";
import { OrderService } from "./services/orderservice";
import { OfframpTransaction } from './entities/offramp-transaction.entity';
import { BlockchainService } from "./services/blockchain.service";
import { OfframpApiService } from "./services/offramp-api.service";
import { TransactionManagerService } from "./services/transaction-manager.service";
import { RecoveryProcessor } from './processors/recovery';
import { FailedRecoveryProcessor } from './processors/failed_recovery';
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([Transaction, Business, OfframpTransaction]),
    RedisModule,
    ScheduleModule.forRoot(),
    QueueModule,
    PaycrestModule,
    BullModule.registerQueue({
      name: 'transaction-processing',
    }),
    BullModule.registerQueue({
      name: 'processing-attempt',
    }),
    BullModule.registerQueue({
      name: 'failed-recovery',
    }),
  ],
  providers: [
    OfframpService,
    PrepareTransactionService,
    OfframpProcessor,
    MailService,
    WalletConfigService,
    OrderService,
    BlockchainService,
    OfframpApiService,
    TransactionManagerService,
    RecoveryProcessor,
    FailedRecoveryProcessor,
  ],
  exports: [
    OfframpService,
    PrepareTransactionService,
    OrderService,
    BlockchainService,
    OfframpApiService,
    TransactionManagerService,
    WalletConfigService,
  ],
})
export class OfframpModule {}
