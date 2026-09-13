import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.services';
import { User } from './user.entity';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from 'src/auth/auth.module';
import { Role } from 'src/role/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UserController],
  providers: [UserService, JwtService],
  exports: [UserService, TypeOrmModule],
})
export class UserModule {}
