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
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.ressourceService.findAll({
      type,
      search,
      uploaderId: this.requesterId(req),
    });
  }

  @Get('scenario/:scenarioId')
  findByScenario(@Param('scenarioId', ParseIntPipe) scenarioId: number) {
    return this.ressourceService.findByScenario(scenarioId);
  }

  @Get('module/:moduleId')
  findByModule(@Param('moduleId', ParseIntPipe) moduleId: number) {
    return this.ressourceService.findByModule(moduleId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ressourceService.findOne(id, this.requesterId(req));
  }

  @Post()
  create(
    @Body() dto: CreateRessourceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ressourceService.create(dto, this.requesterId(req));
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRessourceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ressourceService.update(id, dto, this.requesterId(req));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ressourceService.remove(id, this.requesterId(req));
  }

  private requesterId(req: AuthenticatedRequest): number {
    const id = Number(req.decodedData.id);
    if (!Number.isFinite(id)) {
      throw new UnauthorizedException('Authenticated user id is required.');
    }
    return id;
  }
}
