import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class HttpErrorException extends BaseException {
  constructor(
    message: string = 'HTTP Error occurred',
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    code: string = 'HTTP_ERROR',
    details?: Record<string, any>
  ) {
    super(message, status, code, details);
  }
} 