import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisQueueService } from './redis.queue.service';
import { RedisService } from '../../redis/redis.service';
import { QueueError } from '../../common/exceptions/queue.exception';
import { Queue } from 'bullmq';

// Mock the Queue class
const mockQueue = {
  add: jest.fn(),
  addBulk: jest.fn(),
  close: jest.fn()
};

// Use BullMQ mocking
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue)
}));

describe('RedisQueueService', () => {
  let service: RedisQueueService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisQueueService,
        {
          provide: RedisService,
          useValue: {
            getQueue: jest.fn().mockReturnValue(mockQueue)
          }
        },
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

    service = module.get<RedisQueueService>(RedisQueueService);
    redisService = module.get<RedisService>(RedisService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addJob', () => {
    it('should add a job to the queue', async () => {
      const queueName = 'test-queue';
      const jobName = 'test-job';
      const jobData = { test: 'data' };
      mockQueue.add.mockResolvedValueOnce({ id: 'test-job-id' });

      const result = await service.addJob(queueName, jobName, jobData);

      expect(redisService.getQueue).toHaveBeenCalledWith(queueName);
      expect(mockQueue.add).toHaveBeenCalledWith(jobName, jobData);
      expect(result).toEqual({ id: 'test-job-id' });
    });

    it('should throw QueueError when adding job fails', async () => {
      const queueName = 'test-queue';
      const jobName = 'test-job';
      const jobData = { test: 'data' };
      mockQueue.add.mockRejectedValueOnce(new Error('Queue error'));

      await expect(service.addJob(queueName, jobName, jobData)).rejects.toThrow(
        new QueueError('Failed to add job to queue: Queue error')
      );
    });
  });

  describe('addBulk', () => {
    it('should add multiple jobs to the queue', async () => {
      const queueName = 'test-queue';
      const jobs = [
        { name: 'job1', data: { test: 'data1' } },
        { name: 'job2', data: { test: 'data2' } }
      ];
      mockQueue.addBulk.mockResolvedValueOnce([
        { id: 'job1-id' },
        { id: 'job2-id' }
      ]);

      const result = await service.addBulk(queueName, jobs);

      expect(redisService.getQueue).toHaveBeenCalledWith(queueName);
      expect(mockQueue.addBulk).toHaveBeenCalledWith(jobs);
      expect(result).toEqual([{ id: 'job1-id' }, { id: 'job2-id' }]);
    });

    it('should throw QueueError when adding bulk jobs fails', async () => {
      const queueName = 'test-queue';
      const jobs = [
        { name: 'job1', data: { test: 'data1' } },
        { name: 'job2', data: { test: 'data2' } }
      ];
      mockQueue.addBulk.mockRejectedValueOnce(new Error('Queue error'));

      await expect(service.addBulk(queueName, jobs)).rejects.toThrow(
        new QueueError('Failed to add bulk jobs to queue: Queue error')
      );
    });
  });
}); 