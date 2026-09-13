import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { Roles } from 'src/role/role.decorator';
import { RoleGuard } from 'src/role/role.guard';
import {
  AdminCreateUserDTO,
  AdminUpdateUserDTO,
  CreateUserDTO,
  UpdateUserDTO,
  UpdateUserRoleDTO,
} from './dto/createUser.dto';
import { SafeUser, UserService } from './user.services';
import * as bcrypt from 'bcrypt';

interface AuthenticatedRequest {
  decodedData?: {
    id?: number;
  };
}

@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async createUser(@Body() data: CreateUserDTO): Promise<SafeUser> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.userService.createUser({
      ...data,
      password: hashedPassword,
    });
    return this.userService.toSafeUser(user);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Post('managed')
  @Roles('admin')
  async createManagedUser(@Body() data: AdminCreateUserDTO): Promise<SafeUser> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.userService.createManagedUser({
      ...data,
      password: hashedPassword,
    });
    return this.userService.toSafeUser(user);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get()
  async getAllUsers(): Promise<SafeUser[]> {
    const users = await this.userService.getAllUsers();
    return this.userService.toSafeUsers(users);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Get('me')
  // The configured limiters are named `short` and `medium`, so both must be
  // skipped explicitly (bare @SkipThrottle() only skips a `default` limiter).
  @SkipThrottle({ short: true, medium: true })
  async getMe(@Request() req: AuthenticatedRequest): Promise<SafeUser> {
    const user = await this.userService.getUserById(
      String(req.decodedData?.id),
    );
    if (!user) throw new NotFoundException('Authenticated user not found');
    return this.userService.toSafeUser(user);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Put('me')
  async updateMe(
    @Request() req: AuthenticatedRequest,
    @Body() data: UpdateUserDTO,
  ): Promise<SafeUser> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const user = await this.userService.updateUser(
      Number(req.decodedData?.id),
      data,
    );
    return this.userService.toSafeUser(user);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Put(':id')
  @Roles('admin')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: AdminUpdateUserDTO,
  ): Promise<SafeUser> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const user = await this.userService.updateManagedUser(id, data);
    return this.userService.toSafeUser(user);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Put(':id/role')
  @Roles('admin')
  async updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateUserRoleDTO,
  ): Promise<SafeUser> {
    const user = await this.userService.updateUserRole(id, data.role);
    return this.userService.toSafeUser(user);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Delete(':id')
  @Roles('admin')
  async deleteUser(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.userService.deleteUser(id);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Get('search')
  async searchUsers(@Query('q') query = ''): Promise<SafeUser[]> {
    const users = await this.userService.searchUsers(query);
    return this.userService.toSafeUsers(users);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Get('email/:email')
  @Roles('admin')
  async getUserByEmail(
    @Param('email') email: string,
  ): Promise<SafeUser | null> {
    const user = await this.userService.getUserByEmail(email);
    return user ? this.userService.toSafeUser(user) : null;
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Get(':id')
  @Roles('admin')
  async getUserById(@Param('id') id: string): Promise<SafeUser | null> {
    const user = await this.userService.getUserById(id);
    return user ? this.userService.toSafeUser(user) : null;
  }
}
