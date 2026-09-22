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
import { ActiviteService } from './activite.service';
import { CreateActiviteDto, UpdateActiviteDto } from './dto/activite.dto';
import { ReorderItemsDto } from 'src/common/dto/reorder.dto';

@ApiTags('activites')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('activites')
export class ActiviteController {
  constructor(private readonly activiteService: ActiviteService) {}

  @Get()
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'List all activites', deprecated: true })
  findAll() {
    return this.activiteService.findAll();
  }

  @Get('sequence/:sequenceId')
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'Find activites by sequence', deprecated: true })
  findBySequence(@Param('sequenceId', ParseIntPipe) sequenceId: number) {
    return this.activiteService.findBySequence(sequenceId);
  }

  @Patch('sequence/:sequenceId/reorder')
  reorderBySequence(
    @Param('sequenceId', ParseIntPipe) sequenceId: number,
    @Body() dto: ReorderItemsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.activiteService.reorderBySequence(
      sequenceId,
      dto.items,
      requester.id,
      requester.role,
    );
  }

  @Get(':id')
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'Find one activite by id', deprecated: true })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.activiteService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateActiviteDto, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.activiteService.create(dto, requester.id, requester.role);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActiviteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.activiteService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.activiteService.remove(id, requester.id, requester.role);
  }
}
