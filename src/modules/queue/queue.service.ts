import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { RedisService } from "../redis/redis.service";
import { QueueError } from "./queue.error";
import { Job } from "bullmq";

/**
 * Service for managing queue operations using Redis/BullMQ
 */
@Injectable()
export class QueueService {
  protected readonly logger = new Logger(QueueService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Gets or creates a queue instance for the given queue name.
   * @param queueName - The name of the queue
   * @returns Queue instance
   * @protected - Changed from private to protected for better extensibility
   */
  protected getQueue(queueName: string): Queue {
    try {
      return this.redisService.getQueue(queueName);
    } catch (error) {
      this.logger.error(`Failed to get queue ${queueName}`, error.stack);
      throw new QueueError(`Failed to get queue: ${error.message}`);
    }
  }

  /**
   * Add an item to a queue
   * @param queueName - The name of the queue
   * @param data - The data to add to the queue
   * @returns Promise<Job<any>> - The job that was added to the queue
   */
  async addToQueue(queueName: string, data: any): Promise<Job<any>> {
    try {
      // Get the queue
      const queue = this.getQueue(queueName);
      
      if (!queue) {
        throw new QueueError(`Queue ${queueName} not found`);
      }
      
      // Ensure data is in a format supported by Redis
      const jobData = typeof data === 'object' ? 
        { ...data } :  // Create a new object to avoid reference issues
        { value: data }; // Wrap primitives in an object
      
      // Add the job to the queue
      const job = await queue.add('process', jobData, {
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
