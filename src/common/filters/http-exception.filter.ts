import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseException } from '../exceptions';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    // Get the error response
    let errorResponse: any = exception.getResponse();
    
    // Convert string error responses to objects
    if (typeof errorResponse === 'string') {
      errorResponse = {
        message: errorResponse,
        error: HttpStatus[status],
      };
    }

    // For our custom BaseException, we already have a structured response
    if (exception instanceof BaseException) {
      errorResponse = {
        ...errorResponse,
        timestamp: new Date().toISOString(),
        path: request.url,
      };
    } else {
      // For standard HttpExceptions or other errors
      errorResponse = {
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...errorResponse,
      };
    }

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - ${status} ${JSON.stringify(errorResponse)}`,
    );

    // Send the response
    response.status(status).json(errorResponse);
  }
} 