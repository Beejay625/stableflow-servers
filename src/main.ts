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
    
    // Set the global prefix before Swagger setup so it's included in the documentation
    app.setGlobalPrefix('/api/v1');

    // Configure CORS with explicit options
    app.enableCors({
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'], // Add frontend URLs
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['X-Total-Count'],
      maxAge: 3600, // 1 hour
    });
    
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
    SwaggerModule.setup('api/v1/docs', app, document);

    const configService = app.get(ConfigService);

    const port = parseInt(configService.get<string>('PORT') || '3000', 10);

    if (isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid PORT value: ${port}`);
    }
    await app.listen(port);

    logger.log(`Application is running on: ${await app.getUrl()}`);
    logger.log(`Swagger documentation available at: ${await app.getUrl()}/api/v1/docs`);
  } catch (error) {
    logger.error(`Failed to start the application: ${error.message}`);
    process.exit(1);
  }
}
bootstrap();
