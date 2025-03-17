import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>> {
  
  private readonly logger = new Logger(TransformInterceptor.name);
  
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode;
    const path = ctx.getRequest().path;

    return next.handle().pipe(
      map(data => {
        this.logger.debug(`Transforming response for path: ${path}`);
        this.logger.debug(`Original data: ${JSON.stringify(data)}`);
        
        // If data already has a specific structure, maintain it
        if (data && typeof data === 'object' && 'data' in data && 'message' in data) {
          this.logger.debug('Data already has a specific structure, maintaining it');
          return {
            statusCode,
            ...data,
          };
        }

        // Standard transformation
        const transformedData = {
          statusCode,
          message: 'Success',
          data,
        };
        
        this.logger.debug(`Transformed data: ${JSON.stringify(transformedData)}`);
        return transformedData;
      }),
    );
  }
} 