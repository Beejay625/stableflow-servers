import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Custom HTTP exception with additional error code
 * Extends the NestJS HttpException with an additional error code field
 */
export class HttpErrorException extends HttpException {
  /**
   * Error code for better client-side error handling
   */
  private readonly errorCode: string;

  /**
   * @param message - Error message
   * @param status - HTTP status code
   * @param code - Custom error code for client-side handling
   */
  constructor(
    message: string,
    status: HttpStatus | number = HttpStatus.INTERNAL_SERVER_ERROR,
    code: string = "UNKNOWN_ERROR",
  ) {
    super(
      {
        message,
        statusCode: status,
        code,
        timestamp: new Date().toISOString(),
      },
      status,
    );

    this.errorCode = code;
  }

  /**
   * Get the error code
   */
  getErrorCode(): string {
    return this.errorCode;
  }
}
