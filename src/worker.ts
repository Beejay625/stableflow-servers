import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";

// Load environment variables before any imports that might use them
function loadEnvironment() {
  const environment = process.env.NODE_ENV || "development";
  let envPath;

  switch (environment) {
    case "development":
      envPath = path.resolve(process.cwd(), ".env.development");
      break;
    case "staging":
      envPath = path.resolve(process.cwd(), ".env.staging");
      break;
    case "production":
      envPath = path.resolve(process.cwd(), ".env");
      break;
  }

  // Clear existing environment variables
  Object.keys(process.env).forEach((key) => {
    if (!["PATH", "NODE_ENV", "PWD", "HOME", "SHELL"].includes(key)) {
      delete process.env[key];
    }
  });

  console.log(`[WORKER ENV] Loading environment from: ${envPath}`);

  if (!fs.existsSync(envPath)) {
    console.error(
      `[WORKER ENV] ERROR: Environment file ${envPath} not found. Worker cannot start.`,
    );
    process.exit(1);
  }

  dotenv.config({ path: envPath });

  // Force correct NODE_ENV
  process.env.NODE_ENV = environment;
  console.log(`[WORKER ENV] Environment loaded: ${process.env.NODE_ENV}`);
}

// Ensure environment is loaded first
loadEnvironment();

async function bootstrap() {
  const logger = new Logger("Worker");
  logger.log("[WORKER] Starting transaction processing worker...");

  // Log environment information
  logger.log(`[WORKER] NODE_ENV=${process.env.NODE_ENV}`);
  logger.log(`[WORKER] Process ID: ${process.pid}`);

  const sanitizedDbUrl = process.env.DATABASE_URL.replace(
    /\/\/.*@/,
    "//***:***@",
  );
  logger.log(`[WORKER] Using database URL: ${sanitizedDbUrl}`);
  logger.log(`[WORKER] REDIS_HOST=${process.env.REDIS_HOST}`);

  // Create the application instance
  logger.debug("[WORKER] Creating NestJS application instance");
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug"],
  });
  logger.debug("[WORKER] NestJS application instance created successfully");

  // Initialize the application but don't expose HTTP endpoints
  logger.debug(
    "[WORKER] Initializing application (services, repositories, and connections)",
  );
  await app.init();

  // Check the active database connections
  try {
    const dataSource = app.get("DATA_SOURCE");
    if (dataSource) {
      const sanitizedUrl = dataSource.options.url.replace(
        /\/\/.*@/,
        "//***:***@",
      );
      logger.log(
        `[WORKER] Database connection established via URL: ${sanitizedUrl}`,
      );
      logger.log(
        `[WORKER] Connection pool size: ${dataSource.options.extra?.max || "default"}`,
      );
      logger.log(
        `[WORKER] Connection status: ${dataSource.isInitialized ? "Initialized" : "Not initialized"}`,
      );
    }
  } catch (err) {
    logger.error("[WORKER] Failed to get database connection details", err);
    process.exit(1);
  }

  // Check Redis connection
  try {
    const redisService = app.get("RedisService");
    if (redisService) {
      logger.log("[WORKER] Redis service found");
      logger.log(
        `[WORKER] Redis connection status: ${redisService.isConnected() ? "Connected" : "Not connected"}`,
      );
      if (!redisService.isConnected()) {
        throw new Error("Redis connection failed");
      }
    }
  } catch (err) {
    logger.error("[WORKER] Redis service error", err.message);
    process.exit(1);
  }

  logger.debug("[WORKER] Application initialization complete");

  // Log queue service information
  try {
    const queueService = app.get("TransactionQueueService");
    if (queueService) {
      logger.log("[WORKER] Transaction queue service initialized");
      logger.log(`[WORKER] Queue name: ${queueService.getQueueName()}`);
      logger.log(
        `[WORKER] Active workers: ${await queueService.getWorkerCount()}`,
      );
    }
  } catch (err) {
    logger.error("[WORKER] Queue service error", err.message);
    process.exit(1);
  }

  logger.log("[WORKER] 🔥 Transaction processing worker started successfully");
  logger.log(
    "[WORKER] Worker is using the same connection pool as the API server",
  );
  logger.log("[WORKER] Waiting for jobs in transaction-processing queue...");

  // Handle shutdown gracefully
  const shutdown = async () => {
    logger.log("[WORKER] Shutting down worker...");
    await app.close();
    logger.log("[WORKER] Worker shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap();
