import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Role } from 'src/role/role.entity';
import { User } from './user.entity';
import {
  AdminCreateUserDTO,
  AdminUpdateUserDTO,
  CreateUserDTO,
  UpdateUserDTO,
} from './dto/createUser.dto';

export type SafeUser = Omit<User, 'password'>;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  toSafeUser(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = user;
    return safeUser;
  }

  toSafeUsers(users: User[]): SafeUser[] {
    return users.map((user) => this.toSafeUser(user));
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.find({ relations: ['role'] });
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: Number(id) },
      relations: ['role'],
    });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['role'],
    });
  }

  async recordSuccessfulLogin(user: User): Promise<User> {
    user.previousLoginAt = user.lastLoginAt ?? null;
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const updated = await this.getUserById(String(user.id));
    if (!updated) throw new NotFoundException(`User #${user.id} not found`);
    return updated;
  }

  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    return this.userRepository.find({
      where: [
        { email: ILike(`%${q}%`) },
        { firstName: ILike(`%${q}%`) },
        { lastName: ILike(`%${q}%`) },
      ],
      relations: ['role'],
      take: 8,
      order: { firstName: 'ASC', lastName: 'ASC', email: 'ASC' },
    });
  }

  async createUser(data: CreateUserDTO): Promise<User> {
    const exist = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (exist) throw new BadRequestException('Email already exists');

    const educatorRole = await this.roleRepository.findOne({
      where: { name: 'teacher' },
    });
    if (!educatorRole) {
      throw new BadRequestException('Default educator role is not configured');
    }

    const newUser = this.userRepository.create({
      ...data,
      dateInscription: data.dateInscription
        ? new Date(data.dateInscription)
        : new Date(),
      role: educatorRole,
    });
    return this.userRepository.save(newUser);
  }

  async createManagedUser(data: AdminCreateUserDTO): Promise<User> {
    const exist = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (exist) throw new BadRequestException('Email already exists');

    const role = await this.findRole(data.role ?? 'educator');
    const newUser = this.userRepository.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
      dateInscription: data.dateInscription
        ? new Date(data.dateInscription)
        : new Date(),
      role,
    });

    return this.userRepository.save(newUser);
  }

  async updateUser(id: number, data: UpdateUserDTO): Promise<User> {
    const user = await this.findUserOrThrow(id);
    await this.assertEmailIsAvailable(data.email, user);

    Object.assign(user, data);
    await this.userRepository.save(user);

    const updated = await this.getUserById(String(id));
    if (!updated) throw new NotFoundException(`User #${id} not found`);
    return updated;
  }

  async updateUserRole(id: number, roleName: string): Promise<User> {
    const role = await this.findRole(roleName);
    const user = await this.findUserOrThrow(id);
    await this.assertCanChangeRole(user, role);

    user.role = role;
    await this.userRepository.save(user);

    const updated = await this.getUserById(String(id));
    if (!updated) throw new NotFoundException(`User #${id} not found`);
    return updated;
  }

  async updateManagedUser(id: number, data: AdminUpdateUserDTO): Promise<User> {
    const { role, ...profile } = data;
    const user = await this.findUserOrThrow(id);
    await this.assertEmailIsAvailable(profile.email, user);

    if (role) {
      const nextRole = await this.findRole(role);
      await this.assertCanChangeRole(user, nextRole);
      user.role = nextRole;
    }

    Object.assign(user, profile);
    await this.userRepository.save(user);

    const updated = await this.getUserById(String(id));
    if (!updated) throw new NotFoundException(`User #${id} not found`);
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    const user = await this.findUserOrThrow(id);
    await this.assertCanRemoveUser(user);
    await this.userRepository.remove(user);
  }

  private async findRole(roleName: string): Promise<Role> {
    const normalizedRole =
      roleName.toLowerCase() === 'educator'
        ? 'teacher'
        : roleName.toLowerCase();
    const role = await this.roleRepository.findOne({
      where: { name: normalizedRole },
    });
    if (!role) throw new NotFoundException(`Role "${roleName}" not found`);
    return role;
  }

  private async findUserOrThrow(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  private async assertEmailIsAvailable(
    nextEmail: string | undefined,
    currentUser: User,
  ): Promise<void> {
    if (!nextEmail || nextEmail === currentUser.email) return;

    const existing = await this.userRepository.findOne({
      where: { email: nextEmail },
    });
    if (existing) throw new BadRequestException('Email already exists');
  }

  private async assertCanChangeRole(user: User, nextRole: Role): Promise<void> {
    const currentRole = user.role?.name?.toLowerCase();
    const nextRoleName = nextRole.name.toLowerCase();
    if (currentRole === 'admin' && nextRoleName !== 'admin') {
      await this.assertAnotherAdminExists();
    }
  }

  private async assertCanRemoveUser(user: User): Promise<void> {
    if (user.role?.name?.toLowerCase() === 'admin') {
      await this.assertAnotherAdminExists();
    }
  }

  private async assertAnotherAdminExists(): Promise<void> {
    const adminCount = await this.userRepository.count({
      where: { role: { name: 'admin' } },
    });

    if (adminCount <= 1) {
      throw new BadRequestException(
        'At least one admin account must remain. Create another admin first.',
      );
    }
  }
}
