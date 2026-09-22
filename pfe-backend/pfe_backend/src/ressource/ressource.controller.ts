import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { requesterFrom } from 'src/auth/authenticated-request';
import type { AuthenticatedRequest } from 'src/auth/authenticated-request';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { RessourceService } from './ressource.service';
import { CreateRessourceDto, UpdateRessourceDto } from './dto/ressource.dto';

@ApiTags('ressources')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('ressources')
export class RessourceController {
  constructor(private readonly ressourceService: RessourceService) {}

  @Get()
  @SkipThrottle({ short: true, medium: true })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('scenarioId') scenarioId?: string,
  ) {
    const parsedScenarioId = scenarioId ? parseInt(scenarioId, 10) : undefined;
    if (parsedScenarioId && !isNaN(parsedScenarioId)) {
      const requester = requesterFrom(req);
      return this.ressourceService.findByScenario(
        parsedScenarioId,
        requester.id,
        requester.role,
        { type, search },
      );
    }
    return this.ressourceService.findAll({
      type,
      search,
      uploaderId: this.requesterId(req),
    });
  }

  @Get('scenario/:scenarioId')
  @SkipThrottle({ short: true, medium: true })
  findByScenario(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Request() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    const requester = requesterFrom(req);
    return this.ressourceService.findByScenario(
      scenarioId,
      requester.id,
      requester.role,
      { type, search },
    );
  }

  @Get('module/:moduleId')
  @SkipThrottle({ short: true, medium: true })
  findByModule(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.ressourceService.findByModule(
      moduleId,
      requester.id,
      requester.role,
    );
  }

  @Get(':id')
  @SkipThrottle({ short: true, medium: true })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.ressourceService.findOne(id, requester.id, requester.role);
  }

  @Post()
  create(
    @Body() dto: CreateRessourceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.ressourceService.create(dto, requester.id, requester.role);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRessourceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.ressourceService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.ressourceService.remove(id, requester.id, requester.role);
  }

  private requesterId(req: AuthenticatedRequest): number {
    const id = Number(req.decodedData.id);
    if (!Number.isFinite(id)) {
      throw new UnauthorizedException('Authenticated user id is required.');
    }
    return id;
  }
}
