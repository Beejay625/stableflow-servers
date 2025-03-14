import { Injectable, Inject, Logger } from "@nestjs/common";
import { IQueueService } from "./queue.interface";
import { QueueError } from "./queue.error";

/**
 * Service for managing queue operations.
 * Uses dependency injection to allow for different queue implementations.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject("QueueService")
    private readonly queueProvider: IQueueService
  ) {}

  /**
   * Adds a job to the specified queue.
   * @param queueName - The name of the queue to add the job to
   * @param jobName - The name/type of the job
   * @param data - The data payload for the job
   * @throws {QueueError} If the job cannot be added to the queue
   */
  async addJob(queueName: string, jobName: string, data: any): Promise<void> {
    try {
      await this.queueProvider.addJob(queueName, jobName, data);
      this.logger.debug(
        `Job added to ${queueName}: ${jobName}`,
        JSON.stringify(data)
      );
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
  ): Promise<void> {
    try {
      await this.queueProvider.addBulk(queueName, jobs);
      this.logger.debug(
        `Bulk jobs added to ${queueName}: ${jobs.length} jobs`
      );
    } catch (error) {
      this.logger.error(
        `Failed to add bulk jobs to ${queueName}`,
        error.stack
      );
      throw new QueueError(`Failed to add bulk jobs to queue: ${error.message}`);
    }
  }
}
