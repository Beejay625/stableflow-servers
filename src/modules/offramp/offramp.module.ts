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

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([Transaction, Business, OfframpTransaction]),
    RedisModule,
    ScheduleModule.forRoot(),
    QueueModule,
    PaycrestModule,
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
