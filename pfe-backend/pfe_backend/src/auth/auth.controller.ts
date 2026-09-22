import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthPayloadDTO } from './dto/login.dto';
import { AuthTokenUtils } from 'src/lib/auth';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authTokenUtils: AuthTokenUtils,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authenticate and receive a session. Sets an HttpOnly auth_token cookie.',
  })
  async login(
    @Body() authPayload: AuthPayloadDTO,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.validateUser(authPayload);

    this.authTokenUtils.setAuthCookie(response, result.access_token);

    // The web frontend no longer reads this token — it authenticates purely
    // through the HttpOnly cookie set above. The body still carries it for
    // non-browser API clients (and test/auth.e2e-spec.ts asserts on it), which
    // cannot rely on cookie storage.
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the HttpOnly auth_token cookie.' })
  logout(@Res({ passthrough: true }) response: Response) {
    this.authTokenUtils.clearAuthCookie(response);
    return { message: 'Logged out successfully' };
  }
}
