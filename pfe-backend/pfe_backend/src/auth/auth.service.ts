import { Injectable, UnauthorizedException } from '@nestjs/common';

import { UserService } from 'src/users/user.services';
import * as bcrypt from 'bcrypt';
import { AuthPayloadDTO } from './dto/login.dto';
import { AuthTokenUtils } from 'src/lib/auth';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly authTokenUtils: AuthTokenUtils,
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
      access_token: await this.authTokenUtils.generateToken({
        id: loggedInUser.id,
        firstName: loggedInUser.firstName,
        lastName: loggedInUser.lastName,
        email: loggedInUser.email,
        role: loggedInUser.role?.name,
      }),
    };
  }
  validateToken(token: string) {
    return this.authTokenUtils.verifyToken(token);
  }

  async validateSessionToken(token: string) {
    const decoded = this.validateToken(token);
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
