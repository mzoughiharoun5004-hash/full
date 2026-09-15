import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requesterFrom, type AuthenticatedRequest } from 'src/auth/authenticated-request';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { AiCourseService } from './ai-course.service';
import { AiCourseBriefDto, CreateAiCourseDto, ProposeAiEditDto } from './dto/ai-course.dto';

@ApiTags('ai-courses')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('ai/courses')
export class AiCourseController {
  constructor(private readonly service: AiCourseService) {}

  @Post('outline')
  @ApiOperation({ summary: 'Generate a reviewable AI course outline' })
  outline(@Body() dto: AiCourseBriefDto) { return this.service.createOutline(dto); }

  @Post()
  @ApiOperation({ summary: 'Create an AI-generated draft course' })
  create(@Body() dto: CreateAiCourseDto, @Request() req: AuthenticatedRequest) {
    return this.service.createCourse(dto, requesterFrom(req).id, dto.outline);
  }

  @Post(':scenarioId/changes')
  @ApiOperation({ summary: 'Propose an AI edit without changing the course' })
  propose(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Body() dto: ProposeAiEditDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.service.proposeEdit(scenarioId, requester.id, requester.role, dto.instruction, dto.scope as never, dto.courseDocument, dto.expectedVersion);
  }

  @Get('changes/:id')
  get(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.service.getChangeSet(id, requester.id, requester.role);
  }

  @Post('changes/:id/apply')
  apply(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.service.apply(id, requester.id, requester.role);
  }

  @Post('changes/:id/reject')
  reject(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.service.setStatus(id, requester.id, requester.role, 'rejected');
  }

  @Post('changes/:id/cancel')
  cancel(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.service.setStatus(id, requester.id, requester.role, 'cancelled');
  }
}
