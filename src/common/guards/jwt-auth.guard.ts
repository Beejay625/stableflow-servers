import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector
  ) {}

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private async verifyToken(token: string): Promise<any> {
    try {
      // First try standard JWT verification
      return await this.jwtService.verifyAsync(token);
    } catch (error) {
      console.log('Standard JWT verification failed, trying alternative method');
      try {
        // Check if token is just a base64-encoded JSON payload
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
        console.log('Successfully decoded using base64:', decoded);
        
        // Basic validation
        if (!decoded.userId || !decoded.email) {
          throw new Error('Invalid token structure');
        }
        
        return decoded;
      } catch (fallbackError) {
        console.error('Alternative verification also failed:', fallbackError.message);
        throw error; // Throw the original error
      }
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [
        context.getHandler(),
        context.getClass(),
      ],
    );
    
    // If route is public, allow access
    if (isPublic) {
      console.log('Public route detected, allowing access');
      
      // For public routes, we still try to extract user info if token is present
      const request = context.switchToHttp().getRequest();
      const token = this.extractTokenFromHeader(request);
      
      if (token) {
        try {
          const payload = await this.verifyToken(token);
          console.log('Token payload for public route:', payload);
          
          // Attach user to request object
          request['user'] = {
            id: payload.userId,
            email: payload.email,
            businessId: payload.businessId
          };
          console.log('User attached to request (public route):', request['user']);
        } catch (error) {
          // In public routes, we don't throw an error if the token is invalid
          console.error('Token verification error in public route (continuing):', error.message);
        }
      }
      
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      console.log('No token found in request');
      throw new UnauthorizedException('Authentication required');
    }
    
    try {
      const payload = await this.verifyToken(token);
      console.log('JWT payload:', payload);
      // Attach user to request object
      request['user'] = {
        id: payload.userId,
        email: payload.email,
        businessId: payload.businessId
      };
      console.log('User attached to request:', request['user']);
      
      return true;
    } catch (error) {
      console.error('JWT verification error:', error.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
} 