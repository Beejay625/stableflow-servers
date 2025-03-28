import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue, Job } from "bull";
import { RedisService } from "../redis/redis.service";
import { QueueError } from "./queue.error";

/**
 * Service for managing queue operations using Redis/Bull
 */
@Injectable()
export class QueueService {
  protected readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('transaction-processing')
    private readonly transactionQueue: Queue,
    private readonly redisService: RedisService
  ) {}

  /**
   * Add an item to a queue
   * @param queueName - The name of the queue
   * @param data - The data to add to the queue
   * @returns Promise<Job<any>> - The job that was added to the queue
   */
  async addToQueue(queueName: string, data: any): Promise<Job<any>> {
    try {
      // Ensure data is in a format supported by Redis
      const jobData = typeof data === 'object' ? 
        { ...data } :  // Create a new object to avoid reference issues
        { value: data }; // Wrap primitives in an object
      
      // Add the job to the queue
      const job = await this.transactionQueue.add('process', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 seconds
        },
      });
      
      this.logger.log(`Added job ${job.id} to queue ${queueName}`);
      return job;
    } catch (error) {
      this.logger.error(`Error adding to queue ${queueName}: ${error.message}`, error.stack);
      throw new QueueError(`Failed to add to queue ${queueName}: ${error.message}`);
    }
  }
}
