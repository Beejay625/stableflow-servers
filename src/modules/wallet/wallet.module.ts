import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { Business } from '../business/entities/business.entity';
import { User } from '../auth/entities/auth.entity';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    TypeOrmModule.forFeature([Business, User]),
  ],
  providers: [WalletService, TokenService],
  exports: [WalletService, TokenService],
})
export class WalletModule {} 