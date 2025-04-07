import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "./redis.service";
import Redlock from "redlock";

@Injectable()
export class RedlockService {
  private readonly logger = new Logger(RedlockService.name);
  private redlock: Redlock;

  constructor(private readonly redisService: RedisService) {
    this.initRedlock();
  }

  private initRedlock() {
    try {
      this.redlock = new Redlock(
        // Use the single Redis client for locking
        [this.redisService.getClient()],
        {
          // The expected clock drift; for more details see:
          // http://redis.io/topics/distlock
          driftFactor: 0.01, // multiplied by lock ttl to determine drift time

          // The max number of times Redlock will attempt to lock a resource
          // before erroring
          retryCount: 3,

          // The time in ms between attempts
          retryDelay: 200, // time in ms

          // The max time in ms randomly added to retries
          // to improve performance under high contention
          retryJitter: 200, // time in ms

          // The minimum remaining time on a lock before an extension is automatically
          // attempted with the `using` API.
          automaticExtensionThreshold: 500, // time in ms
        },
      );

      // Log messages on error
      this.redlock.on("error", (error) => {
        this.logger.error(`Redlock error: ${error.message}`, error.stack);
      });

      this.logger.log("Redlock initialized successfully");
    } catch (error) {
      this.logger.error(
        `Failed to initialize Redlock: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Acquire a lock on a resource
   * @param resource The resource to lock
   * @param ttl The time-to-live for the lock in milliseconds
   * @returns A lock instance
   */
  async lock(resource: string, ttl: number) {
    try {
      const lock = await this.redlock.acquire([resource], ttl);
      this.logger.debug(`Acquired lock on ${resource} with TTL ${ttl}ms`);
      return lock;
    } catch (error) {
      this.logger.error(
        `Failed to acquire lock on ${resource}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Safely release a lock, handling any errors that occur
   * @param lock The lock to release
   * @param resource The resource name for logging purposes
   */
  async safeRelease(lock: any, resource: string): Promise<void> {
    try {
      if (lock) {
        await lock.release();
        this.logger.debug(`Released lock on ${resource}`);
      }
    } catch (error) {
      // Just log the error but don't throw, as this is meant to be a safe operation
      this.logger.warn(`Error releasing lock on ${resource}: ${error.message}`);
    }
  }

  /**
   * Execute a function while holding a lock
   * @param resource The resource to lock
   * @param ttl The time-to-live for the lock in milliseconds
   * @param callback The function to execute with the lock
   * @returns The result of the callback
   */
  async using<T>(
    resource: string,
    ttl: number,
    callback: () => Promise<T>,
  ): Promise<T> {
    let lock = null;
    try {
      // We use the lower-level API instead of redlock.using for more control
      lock = await this.lock(resource, ttl);

      // Execute the callback
      const result = await callback();

      // Release the lock
      await this.safeRelease(lock, resource);

      return result;
    } catch (error) {
      // Make sure we release the lock even if the callback fails
      if (lock) {
        await this.safeRelease(lock, resource);
      }

      this.logger.error(
        `Error in using lock for ${resource}: ${error.message}`,
      );
      throw error;
    }
  }
}
