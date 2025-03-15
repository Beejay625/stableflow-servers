import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { RedisService } from "../redis/redis.service";
import { QueueError } from "./queue.error";

/**
 * Service for managing queue operations using Redis/BullMQ
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private queues: Map<string, Queue> = new Map();

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
   * Adds a job to the specified queue.
   * @param queueName - The name of the queue to add the job to
   * @param jobName - The name/type of the job
   * @param data - The data payload for the job
   * @throws {QueueError} If the job cannot be added to the queue
   */
  async addJob(queueName: string, jobName: string, data: any): Promise<any> {
    try {
      const job = await this.getQueue(queueName).add(jobName, data);
      this.logger.debug(`Job added to ${queueName}: ${jobName}`, JSON.stringify(data));
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
   * Adds multiple jobs to the specified queue in a single operation.
   * @param queueName - The name of the queue to add the jobs to
   * @param jobs - Array of jobs, each containing a name and data payload
   * @throws {QueueError} If the jobs cannot be added to the queue
   */
  async addBulk(
    queueName: string,
    jobs: { name: string; data: any }[]
  ): Promise<any[]> {
    try {
      const addedJobs = await this.getQueue(queueName).addBulk(jobs);
      this.logger.debug(`Bulk jobs added to ${queueName}: ${jobs.length} jobs`);
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
