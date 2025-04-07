import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { WalletService } from "./services/wallet.service";
import { Business } from "../business/entities/business.entity";
import { User } from "../auth/entities/auth.entity";
import { TokenService } from "./services/token.service";
import { BalanceService } from "./services/balance.service";
import { Transaction } from "./entities/transaction.entity";

import { SortTransactionService } from "./services/sort.transaction.service";
import { WebhookService } from "./services/webhook.service";
import { QueueModule } from "../queue/queue.module";
import { WalletController } from "./wallet.controller";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { RedisModule } from "../redis/redis.module";
import { TransactionRepository } from "./repositories/transaction.repository";
import { MailService } from "../../common/utils/email";
import { CommonModule } from "../../common/common.module";
import { OfframpModule } from "../offramp/offramp.module";
import { WalletConfigService } from "../../common/utils/wallet-config";
import { ResendWebhookService } from "./services/resendwebhook.service";
import { ValidateSignatureService } from "./services/validatesignature.service";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    RedisModule,
    OfframpModule,
    TypeOrmModule.forFeature([Business, User, Transaction]),
    QueueModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRY", "24h"),
        },
      }),
      inject: [ConfigService],
    }),
    CommonModule,
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    TokenService,
    BalanceService,
    SortTransactionService,
    WebhookService,
    TransactionRepository,
    MailService,
    WalletConfigService,
    ResendWebhookService,
    ValidateSignatureService,
  ],
  exports: [
    WalletService,
    TokenService,
    BalanceService,
    SortTransactionService,
    WebhookService,
    TransactionRepository,
    MailService,
    WalletConfigService,
    ResendWebhookService,
    ValidateSignatureService,
  ],
})
export class WalletModule {}
