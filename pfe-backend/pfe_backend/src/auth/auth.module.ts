import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/users/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import jwtConfig from 'src/config/jwt.config';
import { AuthGuard } from './guard/auth.guard';
import { AuthTokenUtils } from 'src/lib/auth';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule, UserModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => jwtConfig(configService),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, JwtService, AuthTokenUtils],
  exports: [AuthService, AuthGuard, AuthTokenUtils],
})
export class AuthModule {}
