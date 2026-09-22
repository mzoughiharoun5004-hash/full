import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AUTH_COOKIE_NAME } from 'src/common/utils/cookies.util';

export { AUTH_COOKIE_NAME };

export interface AuthTokenPayload {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * JWT signing/verification plus the HttpOnly session cookie.
 *
 * Registered as a provider by AuthModule — do not construct it by hand, or
 * each call site gets its own instance with its own config lookups.
 */
@Injectable()
export class AuthTokenUtils {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateToken(payload: AuthTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secretCode'),
    });
  }

  verifyToken(token: string): AuthTokenPayload {
    return this.jwtService.verify<AuthTokenPayload>(token, {
      secret: this.configService.get<string>('jwt.secretCode'),
    });
  }

  /** Strip the `Bearer ` prefix off an Authorization header value. */
  extractTokenFromHeader(authorization: string | undefined): string | null {
    if (!authorization) return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? match[1].trim() : null;
  }

  setAuthCookie(response: Response, token: string): void {
    response.cookie(AUTH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: ONE_DAY_MS,
    });
  }

  clearAuthCookie(response: Response): void {
    // clearCookie only matches when the flags line up with the ones used to
    // set it, so both paths share cookieOptions().
    response.clearCookie(AUTH_COOKIE_NAME, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    // 'lax' keeps the cookie working for the common single-domain deployment
    // and for localhost:3000 -> localhost:3001 in dev (cookies ignore ports,
    // so those are same-site). Set AUTH_COOKIE_SAMESITE=none when the API and
    // the frontend live on genuinely different sites — browsers then require
    // Secure, which is forced below.
    const configured = (
      this.configService.get<string>('AUTH_COOKIE_SAMESITE') ?? 'lax'
    ).toLowerCase();
    const sameSite: CookieOptions['sameSite'] =
      configured === 'none' || configured === 'strict' ? configured : 'lax';

    return {
      httpOnly: true,
      secure: isProduction || sameSite === 'none',
      sameSite,
      path: '/',
    };
  }
}
