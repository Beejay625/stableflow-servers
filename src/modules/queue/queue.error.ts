/**
 * Custom error class for queue-related errors.
 * Extends the base Error class to provide queue-specific error handling.
 */
export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueError';
    Object.setPrototypeOf(this, QueueError.prototype);
  }
} 