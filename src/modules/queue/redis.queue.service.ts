import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { RedisService } from "../../redis/redis.service";
import { IQueueService } from "./queue.interface";
import { QueueError } from "./queue.error";

/**
 * Redis implementation of the queue service.
 * Uses BullMQ with Redis backend for queue management.
 */
@Injectable()
export class RedisQueueService implements IQueueService {
  private readonly logger = new Logger(RedisQueueService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Gets or creates a queue instance for the given queue name.
   * @param queueName - The name of the queue
   * @returns Queue instance
   * @private
   */
  private getQueue(queueName: string): Queue {
    try {
      return this.redisService.getQueue(queueName);
    } catch (error) {
      this.logger.error(`Failed to get queue ${queueName}`, error.stack);
      throw new QueueError(`Failed to get queue: ${error.message}`);
    }
  }

  /**
   * @inheritdoc
   */
  async addJob(queueName: string, jobName: string, data: any): Promise<any> {
    try {
      const job = await this.getQueue(queueName).add(jobName, data);
      this.logger.debug(`Job added to ${queueName}:`, { jobName, data });
      return job;
    } catch (error) {
      this.logger.error(
        `Failed to add job to ${queueName}: ${jobName}`,
        error.stack
      );
      throw new QueueError(`Failed to add job to queue: ${error.message}`);
    }
  }

  /**
   * @inheritdoc
   */
  async addBulk(
    queueName: string,
    jobs: { name: string; data: any }[]
  ): Promise<any[]> {
    try {
      const addedJobs = await this.getQueue(queueName).addBulk(jobs);
      this.logger.debug(`Bulk jobs added to ${queueName}: ${jobs.length}`);
      return addedJobs;
    } catch (error) {
      this.logger.error(
        `Failed to add bulk jobs to ${queueName}`,
        error.stack
      );
      throw new QueueError(`Failed to add bulk jobs to queue: ${error.message}`);
    }
  }
}
