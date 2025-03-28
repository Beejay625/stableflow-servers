import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis | null = null;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Initialize Redis connection during module initialization
    this.logger.log('=== INITIALIZING REDIS CONNECTION ===');
    try {
      await this.getClient();
      this.logger.log('=== REDIS CLIENT INITIALIZED SUCCESSFULLY ===');
    } catch (error) {
      this.logger.error(`=== FAILED TO INITIALIZE REDIS CLIENT: ${error.message} ===`, error.stack);
    }
  }

  getClient(): Redis {
    if (!this.redisClient) {
      const host = this.configService.get('REDIS_HOST');
      const port = parseInt(this.configService.get('REDIS_PORT') || '6379');
      const password = this.configService.get('REDIS_PASSWORD');
      
      this.logger.log(`=== CREATING REDIS CLIENT FOR ${host}:${port} ===`);
      console.log(`\n\n🔴 CONNECTING TO REDIS AT ${host}:${port} 🔴\n\n`);
      
      // Initialize the Redis client with better configuration for Upstash
      this.redisClient = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 5,
        connectTimeout: 15000, // 15 seconds
        enableReadyCheck: true,
        lazyConnect: false, // Connect immediately
        retryStrategy: (times) => {
          if (times > 5) {
            this.logger.error(`=== REDIS CONNECTION FAILED AFTER ${times} ATTEMPTS, GIVING UP ===`);
            console.log(`\n\n❌ REDIS CONNECTION FAILED AFTER ${times} ATTEMPTS, GIVING UP ❌\n\n`);
            return null; // Stop retrying
          }
          const delay = Math.min(times * 500, 3000);
          this.logger.log(`=== RETRYING REDIS CONNECTION IN ${delay}ms (ATTEMPT ${times}) ===`);
          return delay;
        },
        // Add TLS options for Upstash
        tls: {
          rejectUnauthorized: false // Important for some Redis providers
        }
      });
      
      // Add connection error handler for debugging
      this.redisClient.on('error', (err) => {
        this.logger.error(`=== REDIS CONNECTION ERROR: ${err.message} ===`, err.stack);
        console.log(`\n\n❌ REDIS ERROR: ${err.message} ❌\n\n`);
        this.isConnected = false;
        this.isConnecting = false;
      });
      
      // Add successful connection log
      this.redisClient.on('connect', () => {
        this.logger.log('=== SUCCESSFULLY CONNECTED TO REDIS ===');
        console.log(`\n\n🟢 CONNECTED TO REDIS AT ${host}:${port} 🟢\n\n`);
        this.isConnecting = false;
      });

      // Add ready handler
      this.redisClient.on('ready', () => {
        this.logger.log('=== REDIS CLIENT IS READY ===');
        console.log(`\n\n✅ REDIS CLIENT IS READY AND OPERATIONAL ✅\n\n`);
        this.isConnected = true;
        this.isConnecting = false;
      });

      // Add disconnect handler
      this.redisClient.on('end', () => {
        this.logger.log('=== REDIS CONNECTION CLOSED ===');
        console.log(`\n\n🔴 REDIS CONNECTION CLOSED 🔴\n\n`);
        this.isConnected = false;
        this.isConnecting = false;
      });
    }
    return this.redisClient;
  }

  /**
   * Check if Redis is connected and ready
   * @returns Promise<boolean>
   * @throws Error if Redis fails to connect
   */
  async checkConnection(): Promise<boolean> {
    try {
      if (!this.redisClient) {
        this.logger.log('=== NO REDIS CLIENT FOUND, CREATING ONE... ===');
        // Get client will create and connect automatically
        this.getClient();
      }
      
      // If we're still not connected, try to ping
      if (!this.isConnected) {
        this.logger.log('=== CHECKING REDIS CONNECTION WITH PING... ===');
        console.log('\n\n🔍 CHECKING REDIS CONNECTION WITH PING... 🔍\n\n');
        await this.redisClient.ping();
        this.isConnected = true;
        this.logger.log('=== REDIS CONNECTION VERIFIED WITH PING ===');
        console.log('\n\n✅ REDIS CONNECTION VERIFIED WITH PING ✅\n\n');
      }
      
      return true;
    } catch (error) {
      this.logger.error(`=== REDIS CONNECTION CHECK FAILED: ${error.message} ===`, error.stack);
      console.log(`\n\n❌ REDIS CONNECTION CHECK FAILED: ${error.message} ❌\n\n`);
      this.isConnected = false;
      throw new Error(`Failed to connect to Redis: ${error.message}`);
    }
  }

  /**
   * Get a value from Redis
   * @param key - Key to get
   * @returns Promise<string | null>
   */
  async get(key: string): Promise<string | null> {
    const client = this.getClient();
    return client.get(key);
  }
  
  /**
   * Delete a key from Redis
   * @param key - Key to delete
   * @returns Promise<number> - Number of keys deleted
   */
  async del(key: string): Promise<number> {
    const client = this.getClient();
    return client.del(key);
  }

  /**
   * Set a value in Redis with optional expiry
   * @param key - Key to set
   * @param value - Value to set
   * @param expireInSeconds - Optional expiry time in seconds
   * @returns Promise<'OK'>
   */
  async setKey(key: string, value: string, expireInSeconds?: number): Promise<'OK'> {
    const client = this.getClient();
    if (expireInSeconds) {
      return client.set(key, value, 'EX', expireInSeconds);
    }
    return client.set(key, value);
  }

  async onModuleDestroy() {
    // Close Redis client
    if (this.redisClient) {
      try {
        this.logger.log('=== CLOSING REDIS CONNECTION... ===');
        await this.redisClient.quit();
        this.logger.log('=== REDIS CONNECTION CLOSED SUCCESSFULLY ===');
      } catch (error) {
        this.logger.error(`=== ERROR CLOSING REDIS CONNECTION: ${error.message} ===`, error.stack);
      } finally {
        this.redisClient = null;
        this.isConnected = false;
      }
    }
  }
} 