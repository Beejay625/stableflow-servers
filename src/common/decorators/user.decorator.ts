import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator that extracts the user from the request object
 * @example
 * ```
 * @Post('example')
 * exampleMethod(@User() user: any) {
 *   console.log(user);
 * }
 * ```
 */
export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
); 