import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthPayloadDTO } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() authPayload: AuthPayloadDTO) {
    return this.authService.validateUser(authPayload);
  }
}
