export { HttpErrorException } from "./http-error.exception";
export { QueueError } from "./queue.exception";

// Base exception class for common functionality
export class BaseException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseException";
    Object.setPrototypeOf(this, BaseException.prototype);
  }
}
