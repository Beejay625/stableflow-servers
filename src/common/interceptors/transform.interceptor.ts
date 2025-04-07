import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { Response as ExpressResponse } from "express";
import { Readable } from "stream";

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  private readonly logger = new Logger(TransformInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const statusCode = response.statusCode;
    const path = ctx.getRequest().path;

    // Skip transformation for responses that use @Res()
    const handler = context.getHandler();
    const isCustomResponse = Reflect.getMetadata("custom_response", handler);
    if (isCustomResponse) {
      this.logger.log(
        `Skipping transformation for custom response path: ${path}`,
      );
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        this.logger.log(`Transforming response for path: ${path}`);

        // Skip stringification for debugging if data is complex
        if (this.isComplexObject(data)) {
          this.logger.log("Complex object detected, skipping detailed logging");
        } else {
          try {
            if (process.env.NODE_ENV === "development") {
              this.logger.log(`Original data: ${JSON.stringify(data)}`);
            }
          } catch (e) {
            this.logger.warn("Could not stringify original data");
          }
        }

        // If data already has a specific structure, maintain it
        if (
          data &&
          typeof data === "object" &&
          "data" in data &&
          "message" in data
        ) {
          return {
            statusCode,
            ...data,
          };
        }

        // Standard transformation
        return {
          statusCode,
          message: "Success",
          data,
        };
      }),
    );
  }

  private isComplexObject(obj: any): boolean {
    if (!obj || typeof obj !== "object") return false;

    // Check for Express Response
    if ("status" in obj && "send" in obj && typeof obj.send === "function") {
      return true;
    }

    // Check for Buffer
    if (Buffer.isBuffer(obj)) {
      return true;
    }

    // Check for Stream
    if (obj instanceof Readable) {
      return true;
    }

    return false;
  }
}
