import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/role/role.entity';
import { User } from 'src/users/user.entity';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtService = {
    signAsync: jest.fn(() => Promise.resolve('signed-token')),
    verify: jest.fn(),
  };
  const authTokenUtils = {
    generateToken: jest.fn(() => Promise.resolve('signed-token')),
  };
  const configService = {
    get: jest.fn(() => 'test-secret'),
  };
  const userService = {
    getUserByEmail: jest.fn(),
    recordSuccessfulLogin: jest.fn((user: User) => Promise.resolve(user)),
    toSafeUser: jest.fn((user: User) => {
      const safeUser = { ...user } as Partial<User>;
      delete safeUser.password;
      return safeUser;
    }),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(userService as never, authTokenUtils as never);
  });

  it('returns a token and safe user data on valid credentials', async () => {
    const passwordHash = await bcrypt.hash('Teacher@123', 10);
    userService.getUserByEmail.mockResolvedValueOnce({
      id: 2,
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'teacher@example.com',
      password: passwordHash,
      role: { id: 2, name: 'teacher' } as Role,
    });

    const response = await service.validateUser({
      email: 'teacher@example.com',
      password: 'Teacher@123',
    });

    expect(response.access_token).toBe('signed-token');
    expect(response.userInfo).not.toHaveProperty('password');
    expect(userService.recordSuccessfulLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
        email: 'teacher@example.com',
      }),
    );
    expect(authTokenUtils.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
        email: 'teacher@example.com',
        role: 'teacher',
      }),
    );
  });

  it('rejects invalid passwords', async () => {
    const passwordHash = await bcrypt.hash('Teacher@123', 10);
    userService.getUserByEmail.mockResolvedValueOnce({
      id: 2,
      email: 'teacher@example.com',
      password: passwordHash,
    });

    await expect(
      service.validateUser({
        email: 'teacher@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
