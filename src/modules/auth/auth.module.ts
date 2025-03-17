import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from './entities/auth.entity';
import { RedisModule } from '../redis/redis.module';
import { MailService } from '../../common/utils';
import { Business } from '../business/entities/business.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Business]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret-key',
        signOptions: { expiresIn: '24h' },
      }),
    }),
    RedisModule

  ],
  controllers: [AuthController],
  providers: [AuthService, MailService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
