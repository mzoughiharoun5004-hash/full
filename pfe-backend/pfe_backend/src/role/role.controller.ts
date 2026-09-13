import { Controller, Get } from '@nestjs/common';
import { RoleService } from './role.service';
import { Role } from './role.entity';

@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  // Public endpoint — no auth guard — so the register form can fetch role IDs
  @Get()
  findAll(): Promise<Role[]> {
    return this.roleService.findAll();
  }
}
