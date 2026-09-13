import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { RoleGuard } from './role.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Role])],
  providers: [RoleGuard],
  exports: [RoleGuard, TypeOrmModule],
})
export class RoleModule {}
