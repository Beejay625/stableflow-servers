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
import { TransactionProcessor } from './processors/transaction.processor';
import { QueueModule } from '../queue/queue.module';
import { WalletController } from './wallet.controller';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { OfframpService } from '../offramp/offramp.service';
import { OfframpScheduleService } from './schedule/offramp-schedule.service';
import { OfframpAttempt } from './entities/offramp-attempt.entity';
import { RedisModule } from '../redis/redis.module';
import { TransactionRepository } from './repositories/transaction.repository';
import { MailService } from '../../common/utils/email';
import { CommonModule } from '../../common/common.module';
import { TransactionRecoveryService } from './services/transaction-recovery.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    RedisModule,
    TypeOrmModule.forFeature([Business, User, Transaction, OfframpAttempt]),
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
    TransactionProcessor,
    OfframpService,
    OfframpScheduleService,
    TransactionRepository,
    MailService,
    TransactionRecoveryService,
  ],
  exports: [
    WalletService,
    TokenService,
    BalanceService,
    GetTransactionService,
    SortTransactionService,
    WebhookService,
    OfframpService,
    TransactionRepository,
    MailService,
  ],
})
export class WalletModule {} 