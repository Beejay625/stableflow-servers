import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { Queue, QueueOptions } from 'bullmq';
import { Redis as UpstashRedis } from '@upstash/redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private redisClient: Redis | null = null;
  private upstashClient: UpstashRedis | null = null;
  private queues: Map<string, Queue> = new Map();

  constructor(private configService: ConfigService) {}

  getClient(): Redis {
    if (!this.redisClient) {
      this.redisClient = new Redis({
        host: this.configService.get('REDIS_HOST'),
        port: this.configService.get('REDIS_PORT'),
        password: this.configService.get('REDIS_PASSWORD'),
      });
    }
    return this.redisClient;
  }

  getUpstashClient(): UpstashRedis {
    if (!this.upstashClient) {
      this.upstashClient = new UpstashRedis({
        url: this.configService.get('UPSTASH_REDIS_REST_URL'),
        token: this.configService.get('UPSTASH_REDIS_REST_TOKEN'),
      });
    }
    return this.upstashClient;
  }

  getQueue(name: string, options?: Partial<QueueOptions>): Queue {
    if (!this.queues.has(name)) {
      const defaultOptions: QueueOptions = {
        connection: {
          host: this.configService.get('REDIS_HOST'),
          port: this.configService.get('REDIS_PORT'),
          password: this.configService.get('REDIS_PASSWORD'),
        },
      };

      const queue = new Queue(name, {
        ...defaultOptions,
        ...options,
      });

      this.queues.set(name, queue);
    }

    return this.queues.get(name);
  }

  async onModuleDestroy() {
    // Close Redis client
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }

    // Close all queues
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
  }
} 