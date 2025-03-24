import { Module } from '@nestjs/common';
import { MailService } from './utils/email';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class CommonModule {} 