import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
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
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map(data => {
        // If data already has a specific structure, maintain it
        if (data && typeof data === 'object' && 'data' in data && 'message' in data) {
          return {
            statusCode,
            ...data,
          };
        }

        // Standard transformation
        return {
          statusCode,
          message: 'Success',
          data,
        };
      }),
    );
  }
} 