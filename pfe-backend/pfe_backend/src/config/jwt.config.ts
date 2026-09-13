import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';
export default (configService: ConfigService): JwtModuleOptions => ({
  secret: configService.get('jwt.secretCode'),
  signOptions: { expiresIn: configService.get('jwt.jwtTime') },
});
