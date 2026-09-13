import { Injectable, UnauthorizedException } from '@nestjs/common';

import { UserService } from 'src/users/user.services';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthPayloadDTO } from './dto/login.dto';
@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(data: AuthPayloadDTO) {
    const { email, password } = data;
    const findUser = await this.userService.getUserByEmail(email);

    const invalidCredentials = new UnauthorizedException(
      'Invalid email or password',
    );

    if (!findUser || !findUser.password) {
      throw invalidCredentials;
    }
    if (!(await bcrypt.compare(password, findUser.password))) {
      throw invalidCredentials;
    }
    const loggedInUser = await this.userService.recordSuccessfulLogin(findUser);
    return {
      userInfo: this.userService.toSafeUser(loggedInUser),
      access_token: await this.jwtService.signAsync(
        {
          id: loggedInUser.id,
          firstName: loggedInUser.firstName,
          lastName: loggedInUser.lastName,
          email: loggedInUser.email,
          role: loggedInUser.role?.name,
        },
        { secret: this.configService.get('jwt.secretCode') },
      ),
    };
  }
  validateToken(token: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.jwtService.verify(token, {
      secret: this.configService.get('jwt.secretCode'),
    });
  }

  async validateSessionToken(token: string) {
    const decoded = this.validateToken(token) as { id?: number | string };
    const currentUser = decoded.id
      ? await this.userService.getUserById(String(decoded.id))
      : null;

    if (!currentUser) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return {
      id: currentUser.id,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      email: currentUser.email,
      role: currentUser.role?.name,
    };
  }
}
