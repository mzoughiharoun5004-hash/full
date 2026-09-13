import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
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
import { Roles } from 'src/role/role.decorator';
import { StatutScenario } from 'src/common/enums';
import { ScenarioListFilters, ScenarioService } from './scenario.service';
import {
  CreateScenarioDto,
  RejectScenarioDto,
  UpdateScenarioDto,
} from './dto/scenario.dto';
import { UpdateCourseDocumentDto } from './dto/course-document.dto';
import { UpdateScenarioDocumentDto } from './dto/scenario-document.dto';

@ApiTags('scenarios')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('scenarios')
export class ScenarioController {
  constructor(private readonly scenarioService: ScenarioService) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  @Get()
  @Roles('admin')
  // The configured limiters are named `short` and `medium`, so both must be
  // skipped explicitly (bare @SkipThrottle() only skips a `default` limiter).
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'Lister tous les scénarios (admin uniquement)' })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.findAllPaginated(
      requester.id,
      requester.role,
      page,
      limit,
      this.parseListFilters(search, status, mine),
    );
  }

  @Get('my')
  @ApiOperation({ summary: 'Mes scénarios (enseignant connecté)' })
  findMine(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.findAllPaginated(
      requester.id,
      requester.role,
      page,
      limit,
      this.parseListFilters(search, status, mine),
    );
  }

  /**
   * Turns raw `?search=&status=&mine=` query strings into typed service
   * filters. `status` accepts one or more comma-separated backend enum
   * values (e.g. `approuve,exporte` for the "Approved" filter, which spans
   * both APPROUVE and EXPORTE); unrecognized values are silently dropped
   * rather than rejected, so a stale frontend filter can't 500 the list.
   */
  private parseListFilters(
    search?: string,
    status?: string,
    mine?: string,
  ): ScenarioListFilters {
    const validStatuses = new Set<string>(Object.values(StatutScenario));
    const statuses = status
      ?.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => validStatuses.has(value)) as
      | StatutScenario[]
      | undefined;

    return {
      search: search?.trim() || undefined,
      statuses: statuses?.length ? statuses : undefined,
      mine: mine === 'true',
    };
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Notifications de scénarios du tableau de bord' })
  getNotifications(@Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.scenarioService.getNotifications(requester.id);
  }

  @Get(':id/course-document')
  @ApiOperation({ summary: "Document de cours structure d'un scenario" })
  async getCourseDocument(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    const scenario = await this.scenarioService.findOneForRequester(
      id,
      requester.id,
      requester.role,
    );
    return scenario.courseDocument;
  }

  @Put(':id/course-document')
  @ApiOperation({ summary: 'Mettre a jour le document de cours structure' })
  async updateCourseDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDocumentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    const scenario = await this.scenarioService.updateCourseDocument(
      id,
      dto.courseDocument,
      requester.id,
      requester.role,
      dto.expectedVersion,
    );
    return scenario.courseDocument;
  }

  @Get(':id/scenario-document')
  @ApiOperation({ summary: "Document graph de creation d'un scenario" })
  async getScenarioDocument(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    const scenario = await this.scenarioService.findOneForRequester(
      id,
      requester.id,
      requester.role,
    );
    return scenario.scenarioDocument;
  }

  @Put(':id/scenario-document')
  @ApiOperation({ summary: 'Mettre a jour le document graph du scenario' })
  async updateScenarioDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScenarioDocumentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    const scenario = await this.scenarioService.updateScenarioDocument(
      id,
      dto.scenarioDocument,
      requester.id,
      requester.role,
    );
    return scenario.scenarioDocument;
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un scénario" })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.findOneForRequester(
      id,
      requester.id,
      requester.role,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau scénario' })
  create(@Body() dto: CreateScenarioDto, @Request() req: AuthenticatedRequest) {
    return this.scenarioService.create(dto, Number(req.decodedData.id));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un scénario (bloqué si soumis)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScenarioDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un scénario' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.remove(id, requester.id, requester.role);
  }

  // ─── LIFECYCLE ───────────────────────────────────────────────────────────

  @Patch(':id/submit')
  @ApiOperation({ summary: 'Soumettre pour validation → EN_COURS_VALIDATION' })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.submitForValidation(
      id,
      requester.id,
      requester.role,
    );
  }

  @Patch(':id/approve')
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Approuver → APPROUVE' })
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.scenarioService.approve(id);
  }

  @Patch(':id/reject')
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Rejeter → retour BROUILLON' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectScenarioDto | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.reject(id, requester.id, dto?.comment);
  }

  @Patch(':id/export')
  @ApiOperation({ summary: 'Exporter → EXPORTE' })
  export(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.exportScenario(
      id,
      requester.id,
      requester.role,
    );
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archiver → ARCHIVE' })
  archive(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.archive(id, requester.id, requester.role);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Dupliquer un scénario pour soi-même' })
  duplicate(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.scenarioService.duplicate(id, requester.id, requester.role);
  }
}
