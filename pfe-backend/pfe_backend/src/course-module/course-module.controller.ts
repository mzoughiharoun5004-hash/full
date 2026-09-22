import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  requesterFrom,
  type AuthenticatedRequest,
} from 'src/auth/authenticated-request';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { CourseModuleService } from './course-module.service';
import {
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
} from './dto/course-module.dto';
import { ReorderItemsDto } from 'src/common/dto/reorder.dto';

@ApiTags('modules')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('modules')
export class CourseModuleController {
  constructor(private readonly moduleService: CourseModuleService) {}

  @Get()
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'List all modules', deprecated: true })
  findAll() {
    return this.moduleService.findAll();
  }

  @Get('scenario/:scenarioId')
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'Find modules by scenario', deprecated: true })
  findByScenario(@Param('scenarioId', ParseIntPipe) scenarioId: number) {
    return this.moduleService.findByScenario(scenarioId);
  }

  @Patch('scenario/:scenarioId/reorder')
  reorderByScenario(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Body() dto: ReorderItemsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.moduleService.reorderByScenario(
      scenarioId,
      dto.items,
      requester.id,
      requester.role,
    );
  }

  @Get(':id')
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'Find one module by id', deprecated: true })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.moduleService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateCourseModuleDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.moduleService.create(dto, requester.id, requester.role);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseModuleDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.moduleService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.moduleService.remove(id, requester.id, requester.role);
  }
}
