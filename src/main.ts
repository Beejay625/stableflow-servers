import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors';
import { HttpExceptionFilter } from './common/filters';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import envConfig from './config/env.config';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { RedisService } from './modules/redis/redis.service';

import * as dotenv from 'dotenv';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('NestApplication');
  try {
    // Log current environment with more visibility
    const environment = envConfig.env.toUpperCase();
    
    // Create a prominent environment banner
    logger.log('----------------------------------------');
    logger.log(`🚀 RUNNING IN ${environment} ENVIRONMENT 🚀`);
    logger.log('----------------------------------------');
    
    if (environment === 'DEVELOPMENT') {
      logger.log('Debug mode enabled - verbose logging will be active');
    } else if (environment === 'STAGING') {
      logger.log('Staging environment - using test data and staging services');
    } else if (environment === 'PRODUCTION') {
      logger.log('Production environment - running with optimized settings');
    }
    
    // Check Redis connection before proceeding
    logger.log('Checking Redis connection...');
    const redisService = app.get(RedisService);
    await redisService.checkConnection();
    logger.log('Redis connection verified ✅');
    
    app.enableCors();
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    // Swagger configuration
    const config = new DocumentBuilder()
      .setTitle('StableFlow API')
      .setDescription('API documentation for the Event Management system')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    app.setGlobalPrefix('/api/v1');

    const configService = app.get(ConfigService);

    const port = parseInt(configService.get<string>('PORT') || '3000', 10);

    if (isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid PORT value: ${port}`);
    }
    await app.listen(port);

    logger.log(`Application is running on: ${await app.getUrl()}`);
    logger.log(`Swagger documentation available at: ${await app.getUrl()}/api`);
  } catch (error) {
    logger.error(`Failed to start the application: ${error.message}`);
    process.exit(1);
  }
}
bootstrap();
