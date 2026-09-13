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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  requesterFrom,
  type AuthenticatedRequest,
} from 'src/auth/authenticated-request';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { SequenceService } from './sequence.service';
import { CreateSequenceDto, UpdateSequenceDto } from './dto/sequence.dto';
import { ReorderItemsDto } from 'src/common/dto/reorder.dto';

@ApiTags('sequences')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('sequences')
export class SequenceController {
  constructor(private readonly sequenceService: SequenceService) {}

  @Get()
  findAll() {
    return this.sequenceService.findAll();
  }

  @Get('module/:moduleId')
  findByModule(@Param('moduleId', ParseIntPipe) moduleId: number) {
    return this.sequenceService.findByModule(moduleId);
  }

  @Patch('module/:moduleId/reorder')
  reorderByModule(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body() dto: ReorderItemsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.sequenceService.reorderByModule(
      moduleId,
      dto.items,
      requester.id,
      requester.role,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sequenceService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSequenceDto, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.sequenceService.create(dto, requester.id, requester.role);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSequenceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.sequenceService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.sequenceService.remove(id, requester.id, requester.role);
  }
}
