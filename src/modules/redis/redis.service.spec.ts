import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// Create a proper mock for Redis
class MockRedis {
  quit = jest.fn().mockResolvedValue('OK');
  on = jest.fn();
  ping = jest.fn().mockResolvedValue('PONG');
  status = 'ready';
}

// Shared instance that will be returned by the mock constructor
const mockRedisInstance = new MockRedis();

// Mock ioredis with a proper default export structure
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedisInstance)
  };
});

// Mock Queue
const mockQueueInstance = {
  close: jest.fn().mockResolvedValue(undefined),
};

// Mock the Queue class
jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => mockQueueInstance)
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'REDIS_HOST') return 'test-host';
      if (key === 'REDIS_PORT') return '6379';
      if (key === 'REDIS_PASSWORD') return 'test-password';
      return null;
    })
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService
        }
      ]
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClient', () => {
    it('should return the same Redis client instance', () => {
      const client1 = service.getClient();
      const client2 = service.getClient();
      expect(client1).toBe(client2);
      // Check that our Redis constructor was called
      const Redis = require('ioredis').default;
      expect(Redis).toHaveBeenCalled();
    });
  });

  describe('getQueue', () => {
    it('should create a Queue with correct configuration', () => {
      const queueName = 'test-queue';
      const queue = service.getQueue(queueName);
      expect(queue).toBeDefined();
      // Check that Queue constructor was called
      const Queue = require('bullmq').Queue;
      expect(Queue).toHaveBeenCalledWith(queueName, expect.objectContaining({
        connection: expect.objectContaining({
          host: 'test-host',
          port: 6379
        })
      }));
    });

    it('should return the same queue instance for the same name', () => {
      const queueName = 'test-queue';
      const queue1 = service.getQueue(queueName);
      const queue2 = service.getQueue(queueName);
      expect(queue1).toBe(queue2);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close Redis client and queues when module is destroyed', async () => {
      // Setup by calling the methods to create instances
      service.getClient();  // This will create a Redis client using our mock
      service.getQueue('test-queue');  // This will create a queue using our mock
      
      await service.onModuleDestroy();

      // Check if quit was called on Redis client - using our shared instance
      expect(mockRedisInstance.quit).toHaveBeenCalled();
      // Check if close was called on the queue
      expect(mockQueueInstance.close).toHaveBeenCalled();
    });
  });
}); 