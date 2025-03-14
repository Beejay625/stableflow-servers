/**
 * Interface for queue service implementations.
 * Provides methods for managing jobs in a queue system.
 */
export interface IQueueService {
    /**
     * Adds a single job to the specified queue.
     * @param queueName - The name of the queue to add the job to
     * @param jobName - The name/type of the job
     * @param data - The data payload for the job
     * @returns The created job object
     * @throws {Error} If the job cannot be added to the queue
     */
    addJob(queueName: string, jobName: string, data: any): Promise<any>;

    /**
     * Adds multiple jobs to the specified queue in a single operation.
     * @param queueName - The name of the queue to add the jobs to
     * @param jobs - Array of jobs, each containing a name and data payload
     * @returns Array of created job objects
     * @throws {Error} If the jobs cannot be added to the queue
     */
    addBulk(queueName: string, jobs: { name: string; data: any }[]): Promise<any[]>;
  }
  