import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class BusinessException extends BaseException {
  constructor(
    message: string,
    code: string = 'BUSINESS_ERROR',
    details?: Record<string, any>
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, code, details);
  }
} 