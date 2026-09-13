import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import type { AuthenticatedRequest } from '../authenticated-request';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context
        .switchToHttp()
        .getRequest<
          Partial<AuthenticatedRequest> & import('express').Request
        >();
      const { authorization } = request.headers;

      if (!authorization || authorization.trim() === '') {
        throw new UnauthorizedException('Please provide token');
      }
      const [scheme, token] = authorization.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) {
        throw new UnauthorizedException('Invalid authorization header');
      }
      const authToken = token.trim();
      request.decodedData =
        await this.authService.validateSessionToken(authToken);

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
