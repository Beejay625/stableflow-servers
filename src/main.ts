import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TransformInterceptor, HttpExceptionFilter, ValidationPipe } from './common';
import { RedisService } from './modules/redis/redis.service';
import * as cluster from 'cluster';
import * as os from 'os';
import * as dotenv from 'dotenv';
import * as net from 'net';

// Helper function to check if a port is in use
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port);
  });
}

// Find an available port starting from the given port
async function findAvailablePort(startPort: number, maxAttempts = 20): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
  }
  throw new Error(`Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`);
}

async function bootstrap() {
  // Check if clustering is enabled via env var
  const enableClustering = process.env.ENABLE_CLUSTERING === 'true';
  const logger = new Logger('NestApplication');

  // Check for worker-only mode
  const workerOnly = process.env.WORKER_ONLY === 'true';
  
  if (enableClustering && (cluster as any).isMaster) {
    const numCPUs = os.cpus().length;
    logger.log(`Master server started with ${numCPUs} workers`);
    
    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      (cluster as any).fork();
    }

    // Handle worker exit
    (cluster as any).on('exit', (worker: any) => {
      logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
      (cluster as any).fork();
    });
  } else {
    // Either clustering is disabled or this is a worker process
    const app = await NestFactory.create(AppModule);
    
    try {
      // Enable shutdown hooks for proper cleanup
      app.enableShutdownHooks();
      
      // Get config service
      const configService = app.get(ConfigService);
      
      // Log current environment with more visibility
      const environment = process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT';
      
      // Create a prominent environment banner
      logger.log('----------------------------------------');
      logger.log(`🚀 RUNNING IN ${environment} ENVIRONMENT 🚀`);
      if ((cluster as any).isWorker) {
        logger.log(`🔄 WORKER ${process.pid} STARTED 🔄`);
      }
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
      
      // If we're in worker-only mode, don't start the HTTP server
      if (workerOnly) {
        // Just initialize the application for queue processors to work
        await app.init();
        logger.log('🔥 QUEUE WORKER PROCESS STARTED 🔥');
        logger.log('Listening for transaction queue jobs...');
      } else {
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

        // Swagger configuration - only in primary process or when not clustering
        if (!((cluster as any).isWorker) || !enableClustering) {
          const config = new DocumentBuilder()
            .setTitle('StableFlow API')
            .setDescription('API documentation for the Event Management system')
            .setVersion('1.0')
            .addBearerAuth(
              {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT', // Optional, for better documentation
              },
              'access-token', // Name of the security scheme
            )
            .build();
          const document = SwaggerModule.createDocument(app, config);
          SwaggerModule.setup('api/v1/docs', app, document);
        }

        // Get preferred port from config
        const configuredPort = parseInt(configService.get<string>('PORT') || '3000', 10);
        
        if (isNaN(configuredPort) || configuredPort <= 0 || configuredPort > 65535) {
          throw new Error(`Invalid PORT value: ${configuredPort}`);
        }
        
        // Try to find an available port, starting with the configured port
        let actualPort: number;
        
        try {
          // Check if the configured port is available
          const inUse = await isPortInUse(configuredPort);
          
          if (!inUse) {
            // Preferred port is available
            actualPort = configuredPort;
          } else {
            // Try to find another available port
            logger.warn(`Port ${configuredPort} is already in use, searching for an available port...`);
            actualPort = await findAvailablePort(configuredPort + 1);
            logger.log(`Found available port: ${actualPort}`);
          }
          
          // Start the application on the determined port
          await app.listen(actualPort);
          logger.log(`API server running on port ${actualPort}`);
          logger.log(`Webhook endpoint: ${await app.getUrl()}/api/v1/wallet/webhook/blockradar`);
          
          // Also process queue jobs in the same process (hybrid mode)
          logger.log('🔄 API server is also processing queue jobs');
          
          logger.log(`Application is running on: ${await app.getUrl()}`);
          if (!((cluster as any).isWorker) || !enableClustering) {
            logger.log(`Swagger documentation available at: ${await app.getUrl()}/api/v1/docs`);
          }
        } catch (error) {
          logger.error(`Failed to start the application: ${error.message}`);
          throw error;
        }
      }
    } catch (error) {
      logger.error(`Failed to start the application: ${error.message}`);
      process.exit(1);
    }
  }
}

bootstrap();
