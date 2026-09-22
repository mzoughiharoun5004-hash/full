import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import type { AuthenticatedRequest } from '../authenticated-request';
import { AUTH_COOKIE_NAME, readCookie } from 'src/common/utils/cookies.util';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  private extractTokenFromRequest(request: Request): string | null {
    // Authorization header wins; the HttpOnly cookie is the fallback so both
    // the Bearer client and a cookie-only client authenticate the same way.
    const authorization = request.headers.authorization;
    if (authorization) {
      const [scheme, token] = authorization.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
        return token.trim();
      }
    }

    return readCookie(request.headers.cookie, AUTH_COOKIE_NAME);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context
        .switchToHttp()
        .getRequest<
          Partial<AuthenticatedRequest> & import('express').Request
        >();
      const token = this.extractTokenFromRequest(request);

      if (!token) {
        throw new UnauthorizedException(
          'Please provide token in Authorization header or auth_token cookie',
        );
      }

      request.decodedData = await this.authService.validateSessionToken(token);

      // *** NEW: Validate role is present (not just JWT valid) ***
      if (!request.decodedData?.role) {
        throw new UnauthorizedException('Token missing role information');
      }

      return true;
    } catch (error) {
      throw new UnauthorizedException(
        (error instanceof Error ? error.message : String(error)) ||
          'session expired! Please sign In',
      );
    }
  }
}
