import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryProvider } from './modules/cloudinary/cloudinary.provider';
import { QueueModule } from './modules/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
    }),
    DatabaseModule,
    QueueModule,
    AuthModule,
    RedisModule
  ],
  providers: [CloudinaryProvider],
  exports: [CloudinaryProvider]
})
export class AppModule {}
