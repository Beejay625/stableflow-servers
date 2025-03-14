import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';
import { ValidationError } from 'class-validator';

export class ValidationException extends BaseException {
  constructor(
    validationErrors: ValidationError[],
    message: string = 'Validation failed'
  ) {
    const details = validationErrors.reduce((acc, error) => {
      acc[error.property] = Object.values(error.constraints || {});
      return acc;
    }, {} as Record<string, string[]>);

    super(message, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', details);
  }
} 