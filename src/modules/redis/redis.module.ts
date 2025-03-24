import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConfigModule } from '@nestjs/config';
import { RedlockService } from './redlock.service';

@Module({
  imports: [ConfigModule],
  providers: [RedisService, RedlockService],
  exports: [RedisService, RedlockService],
})
export class RedisModule {} 