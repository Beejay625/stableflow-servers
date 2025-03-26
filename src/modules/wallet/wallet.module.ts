import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { WalletService } from './wallet.service';
import { Business } from '../business/entities/business.entity';
import { User } from '../auth/entities/auth.entity';
import { TokenService } from './services/token.service';
import { BalanceService } from './services/balance.service';
import { Transaction } from './entities/transaction.entity';
import { GetTransactionService } from './services/gettransaction.service';
import { SortTransactionService } from './services/sort.transaction.service';
import { WebhookService } from './services/webhook.service';
import { QueueModule } from '../queue/queue.module';
import { WalletController } from './wallet.controller';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '../redis/redis.module';
import { TransactionRepository } from './repositories/transaction.repository';
import { MailService } from '../../common/utils/email';
import { CommonModule } from '../../common/common.module';
import { OfframpModule } from '../offramp/offramp.module';
import { WalletConfigService } from '../../common/utils/wallet-config';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    RedisModule,
    OfframpModule,
    TypeOrmModule.forFeature([Business, User, Transaction]),
    BullModule.registerQueue({
      name: 'transactions',
    }),
    BullModule.registerQueue({
      name: 'transaction-processing',
    }),
    QueueModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_EXPIRY', '24h')
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
    GetTransactionService,
    SortTransactionService,
    WebhookService,
    TransactionRepository,
    MailService,
    WalletConfigService,
  ],
  exports: [
    WalletService,
    TokenService,
    BalanceService,
    GetTransactionService,
    SortTransactionService,
    WebhookService,
    TransactionRepository,
    MailService,
    WalletConfigService,
  ],
})
export class WalletModule {} 