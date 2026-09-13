import { BadRequestException } from '@nestjs/common';
import { Role } from 'src/role/role.entity';
import { User } from './user.entity';
import { UserService } from './user.services';

type RepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
  count: jest.Mock;
};

function repoMock(): RepoMock {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
    remove: jest.fn(() => Promise.resolve()),
    count: jest.fn(),
  };
}

describe('UserService', () => {
  let userRepo: RepoMock;
  let roleRepo: RepoMock;
  let service: UserService;

  beforeEach(() => {
    userRepo = repoMock();
    roleRepo = repoMock();
    service = new UserService(userRepo as never, roleRepo as never);
  });

  it('removes password hashes from safe user responses', () => {
    const safeUser = service.toSafeUser({
      id: 1,
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'teacher@example.com',
      password: 'hashed-secret',
      role: { id: 2, name: 'teacher' } as Role,
      dateInscription: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      previousLoginAt: null,
      scenarios: [],
      rapports: [],
      uploadedResources: [],
    });

    expect(safeUser).not.toHaveProperty('password');
    expect(safeUser.email).toBe('teacher@example.com');
  });

  it('assigns the default teacher role during public registration', async () => {
    const teacherRole = { id: 2, name: 'teacher' } as Role;
    const requestedAdminRole = { id: 1, name: 'admin' } as Role;

    userRepo.findOne.mockResolvedValueOnce(null);
    roleRepo.findOne.mockResolvedValueOnce(teacherRole);

    await service.createUser({
      firstName: 'New',
      lastName: 'Teacher',
      email: 'new@example.com',
      password: 'hashed',
      role: requestedAdminRole,
    } as any);

    expect(roleRepo.findOne).toHaveBeenCalledWith({
      where: { name: 'teacher' },
    });
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        role: teacherRole,
      }),
    );
  });

  it('rejects duplicate registration emails', async () => {
    userRepo.findOne.mockResolvedValueOnce({ id: 1 });

    await expect(
      service.createUser({
        firstName: 'Taken',
        lastName: 'Email',
        email: 'taken@example.com',
        password: 'hashed',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves the current login timestamp to previous login on successful login', async () => {
    const lastLoginAt = new Date('2026-05-27T10:00:00.000Z');
    const user = {
      id: 5,
      firstName: 'Login',
      lastName: 'User',
      email: 'login@example.com',
      password: 'hashed',
      role: { id: 2, name: 'teacher' } as Role,
      lastLoginAt,
      previousLoginAt: null,
    } as User;
    userRepo.findOne.mockResolvedValueOnce({
      ...user,
      previousLoginAt: lastLoginAt,
    });

    const updated = await service.recordSuccessfulLogin(user);

    expect(user.previousLoginAt).toBe(lastLoginAt);
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    expect(userRepo.save).toHaveBeenCalledWith(user);
    expect(updated.previousLoginAt).toBe(lastLoginAt);
  });

  it('normalizes role names when updating user roles', async () => {
    const adminRole = { id: 1, name: 'admin' } as Role;
    const user = {
      id: 4,
      firstName: 'Role',
      lastName: 'Target',
      email: 'role@example.com',
      password: 'hashed',
      role: { id: 2, name: 'teacher' } as Role,
    } as User;

    roleRepo.findOne.mockResolvedValueOnce(adminRole);
    userRepo.findOne.mockResolvedValueOnce(user);
    userRepo.findOne.mockResolvedValueOnce({ ...user, role: adminRole });

    const updated = await service.updateUserRole(4, 'ADMIN');

    expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { name: 'admin' } });
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: adminRole }),
    );
    expect(updated.role.name).toBe('admin');
  });

  it('rejects demoting the only admin account', async () => {
    const teacherRole = { id: 2, name: 'teacher' } as Role;
    const adminUser = {
      id: 1,
      firstName: 'Only',
      lastName: 'Admin',
      email: 'admin@example.com',
      password: 'hashed',
      role: { id: 1, name: 'admin' } as Role,
    } as User;

    roleRepo.findOne.mockResolvedValueOnce(teacherRole);
    userRepo.findOne.mockResolvedValueOnce(adminUser);
    userRepo.count.mockResolvedValueOnce(1);

    await expect(service.updateUserRole(1, 'TEACHER')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another admin exists', async () => {
    const teacherRole = { id: 2, name: 'teacher' } as Role;
    const adminUser = {
      id: 1,
      firstName: 'One',
      lastName: 'Admin',
      email: 'admin@example.com',
      password: 'hashed',
      role: { id: 1, name: 'admin' } as Role,
    } as User;

    roleRepo.findOne.mockResolvedValueOnce(teacherRole);
    userRepo.findOne.mockResolvedValueOnce(adminUser);
    userRepo.count.mockResolvedValueOnce(2);
    userRepo.findOne.mockResolvedValueOnce({ ...adminUser, role: teacherRole });

    await service.updateUserRole(1, 'teacher');

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: teacherRole }),
    );
  });

  it('rejects deleting the only admin account', async () => {
    const adminUser = {
      id: 1,
      firstName: 'Only',
      lastName: 'Admin',
      email: 'admin@example.com',
      password: 'hashed',
      role: { id: 1, name: 'admin' } as Role,
    } as User;

    userRepo.findOne.mockResolvedValueOnce(adminUser);
    userRepo.count.mockResolvedValueOnce(1);

    await expect(service.deleteUser(1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userRepo.remove).not.toHaveBeenCalled();
  });
});
