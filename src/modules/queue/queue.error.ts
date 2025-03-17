/**
 * Custom error class for queue-related errors.
 */
export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueError';
    Object.setPrototypeOf(this, QueueError.prototype);
  }
} 