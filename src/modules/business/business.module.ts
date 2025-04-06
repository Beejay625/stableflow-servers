import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Business } from './entities/business.entity';
import { Category } from './entities/category.entity';
import { BankDetails } from './entities/bank-details.entity';
import { BusinessService } from './services/business.service';
import { BankService } from './services/bank.service';
import { BusinessValidationService } from './services/business-validation.service';
import { BusinessWalletService } from './services/business-wallet.service';
import { BusinessTransformer } from './transformers/business.transformer';
import { WalletModule } from '../wallet/wallet.module';
import { PaycrestModule } from '../paycrest/paycrest.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, Category, BankDetails]),
    WalletModule,
    HttpModule,
    ConfigModule,
    PaycrestModule,
  ],
  providers: [
    BusinessService,
    BankService,
    BusinessValidationService,
    BusinessWalletService,
    BusinessTransformer,
  ],
  exports: [BusinessService],
})
export class BusinessModule {} 