import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PaycrestService } from "./paycrest.service";

/**
 * Paycrest API integration module for payment services
 * This module provides integration with the Paycrest API for bank account verification,
 * currency selection, financial institution selection, and payment order management
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [PaycrestService],
  exports: [PaycrestService],
})
export class PaycrestModule {}
