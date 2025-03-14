import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

// Mock the Queue class
const mockQueue = {
  close: jest.fn().mockResolvedValue(undefined)
};

jest.mock('bull', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockQueue)
  };
});

jest.mock('ioredis');

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              if (key === 'REDIS_HOST') return 'test-host';
              if (key === 'REDIS_PORT') return 6379;
              if (key === 'REDIS_PASSWORD') return 'test-password';
              return undefined;
            })
          }
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
      expect(Redis).toHaveBeenCalledWith({
        host: 'test-host',
        port: 6379,
        password: 'test-password'
      });
    });
  });

  describe('getQueue', () => {
    it('should create a Bull queue with correct configuration', () => {
      const queueName = 'test-queue';
      const queue = service.getQueue(queueName);
      expect(queue).toBeDefined();
      expect(queue).toBe(mockQueue);
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
      const client = service.getClient();
      const queue = service.getQueue('test-queue');
      
      const clientQuitSpy = jest.spyOn(client, 'quit').mockResolvedValue('OK');
      const queueCloseSpy = jest.spyOn(queue, 'close').mockResolvedValue();

      await service.onModuleDestroy();

      expect(clientQuitSpy).toHaveBeenCalled();
      expect(queueCloseSpy).toHaveBeenCalled();
    });
  });
}); 