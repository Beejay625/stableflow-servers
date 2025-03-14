import { ValidationPipe as NestValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ValidationException } from '../exceptions';

export class ValidationPipe extends NestValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        return new ValidationException(errors);
      },
    });
  }

  async transform(value: any, metadata: ArgumentMetadata) {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (error instanceof ValidationException) {
        throw error;
      }
      throw new ValidationException([error]);
    }
  }
}
