import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { Scenario } from './scenario.entity';
import { ScenarioShare } from 'src/scenario-share/scenario-share.entity';
import { ScenarioActivityLog } from 'src/scenario-share/scenario-activity-log.entity';
import { ScenarioComment } from 'src/scenario-share/scenario-comment.entity';
import { User } from 'src/users/user.entity';
import { CreateScenarioDto, UpdateScenarioDto } from './dto/scenario.dto';
import { isApprovedScenarioStatut, StatutScenario } from 'src/common/enums';
import {
  CourseBlock,
  CourseDocument,
  CourseLesson,
  CoursePage,
  CourseSection,
} from './course-document.types';
import { ScenarioDocument } from './scenario-document.types';

export interface ScenarioNotificationItem {
  id: string;
  message: string;
  scenarioId: number;
  scenarioTitle: string;
  createdAt: Date;
}

export interface ScenarioListFilters {
  /** Free-text match against title/description. */
  search?: string;
  /** Restrict to one or more backend status values (e.g. StatutScenario.BROUILLON). */
  statuses?: StatutScenario[];
  /** Restrict to scenarios the requester owns or is shared on, regardless of status. */
  mine?: boolean;
}

@Injectable()
export class ScenarioService {
  constructor(
    @InjectRepository(Scenario)
    private readonly scenarioRepo: Repository<Scenario>,
    @InjectRepository(ScenarioShare)
    private readonly shareRepo: Repository<ScenarioShare>,
    @InjectRepository(ScenarioActivityLog)
    private readonly activityRepo: Repository<ScenarioActivityLog>,
    @InjectRepository(ScenarioComment)
    private readonly commentRepo: Repository<ScenarioComment>,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async findAll(
    requesterId: number,
    requesterRole?: string,
  ): Promise<Scenario[]> {
    const query = this.applyVisibilityFilters(
      this.scenarioRepo
        .createQueryBuilder('scenario')
        .leftJoinAndSelect('scenario.user', 'user')
        .leftJoinAndSelect('scenario.modules', 'modules')
        .leftJoinAndSelect('scenario.ressources', 'ressources')
        .leftJoinAndSelect('scenario.shares', 'shares')
        .leftJoinAndSelect('shares.sharedWith', 'sharedWith'),
      requesterId,
      requesterRole,
    );

    const scenarios = await query.getMany();
    return scenarios.map((scenario) => this.exposeOwner(scenario));
  }

  /**
   * Same visibility rules as findAll(), but paginated server-side.
   *
   * Pagination can't just add .skip()/.take() onto the findAll() query:
   * the leftJoinAndSelect joins to one-to-many relations (modules,
   * ressources, shares) multiply rows at the SQL level, so a SQL-level
   * LIMIT there would cut off a scenario's joined rows partway through
   * rather than limiting the number of distinct scenarios. Instead this
   * resolves the correct page of distinct scenario ids first (via a
   * join-plus-DISTINCT+LIMIT/OFFSET query with no one-to-many joins
   * selected), then fetches those specific ids with the full relations.
   */
  async findAllPaginated(
    requesterId: number,
    requesterRole: string | undefined,
    page: number,
    limit: number,
    filters: ScenarioListFilters = {},
  ): Promise<{
    items: Scenario[];
    total: number;
    page: number;
    limit: number;
  }> {
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit) || 20));

    // Rebuilt per query (rather than reused) because a TypeORM
    // SelectQueryBuilder accumulates .select()/.orderBy() calls, and the
    // count query and the id-page query below need different projections.
    const buildFilteredQuery = () => {
      let query = this.applyVisibilityFilters(
        this.scenarioRepo
          .createQueryBuilder('scenario')
          .leftJoin('scenario.user', 'user')
          .leftJoin('scenario.shares', 'shares')
          .leftJoin('shares.sharedWith', 'sharedWith'),
        requesterId,
        requesterRole,
      );

      if (filters.mine) {
        query = query.andWhere(
          new Brackets((qb) => {
            qb.where('user.id = :requesterId', { requesterId }).orWhere(
              'sharedWith.id = :requesterId',
              { requesterId },
            );
          }),
        );
      }

      if (filters.statuses?.length) {
        query = query.andWhere('scenario.statut IN (:...filterStatuses)', {
          filterStatuses: filters.statuses,
        });
      }

      const trimmedSearch = filters.search?.trim();
      if (trimmedSearch) {
        query = query.andWhere(
          new Brackets((qb) => {
            qb.where('scenario.titre ILIKE :search', {
              search: `%${trimmedSearch}%`,
            }).orWhere('scenario.description ILIKE :search', {
              search: `%${trimmedSearch}%`,
            });
          }),
        );
      }

      return query;
    };

    const total = await buildFilteredQuery()
      .select('COUNT(DISTINCT scenario.id)', 'count')
      .getRawOne<{ count: string }>()
      .then((row) => Number(row?.count ?? 0));

    if (total === 0) {
      return { items: [], total: 0, page: safePage, limit: safeLimit };
    }

    const idRows = await buildFilteredQuery()
      .select('scenario.id', 'id')
      // Postgres requires DISTINCT's ORDER BY expressions to appear in the
      // select list, so the sort column has to be projected here too.
      .addSelect('scenario.createdAt', 'createdAt')
      .distinct(true)
      .orderBy('scenario.createdAt', 'DESC')
      .addOrderBy('scenario.id', 'DESC')
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany<{ id: number }>();

    const ids = idRows.map((row) => Number(row.id));
    if (!ids.length) {
      return { items: [], total, page: safePage, limit: safeLimit };
    }

    const scenarios = await this.scenarioRepo
      .createQueryBuilder('scenario')
      .leftJoinAndSelect('scenario.user', 'user')
      .leftJoinAndSelect('scenario.modules', 'modules')
      .leftJoinAndSelect('scenario.ressources', 'ressources')
      .leftJoinAndSelect('scenario.shares', 'shares')
      .leftJoinAndSelect('shares.sharedWith', 'sharedWith')
      .where('scenario.id IN (:...ids)', { ids })
      .getMany();

    // Preserve the id order from the ranked page above — `IN (...)` does
    // not guarantee result ordering.
    const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((scenario): scenario is Scenario => Boolean(scenario));

    return {
      items: ordered.map((scenario) => this.exposeOwner(scenario)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  private applyVisibilityFilters(
    query: SelectQueryBuilder<Scenario>,
    requesterId: number,
    requesterRole?: string,
  ): SelectQueryBuilder<Scenario> {
    const visibleStatuses = [
      StatutScenario.EN_COURS_VALIDATION,
      StatutScenario.APPROUVE,
      StatutScenario.EXPORTE,
      StatutScenario.ARCHIVE,
    ];

    // Wrapped in Brackets so this stays a single `(A OR B OR C)` group —
    // without it, a later `.andWhere(...)` (e.g. from list filters) would
    // bind tighter than the last `orWhere` per normal SQL precedence and
    // silently change these visibility rules instead of narrowing them.
    if (this.isAdmin(requesterRole)) {
      query.where(
        new Brackets((qb) => {
          qb.where('user.id = :requesterId', { requesterId })
            .orWhere('scenario.statut IN (:...visibleStatuses)', {
              visibleStatuses,
            })
            .orWhere('sharedWith.id = :requesterId', { requesterId });
        }),
      );
    } else {
      query.where(
        new Brackets((qb) => {
          qb.where('user.id = :requesterId', { requesterId })
            .orWhere('scenario.statut IN (:...visibleStatuses)', {
              visibleStatuses: [
                StatutScenario.APPROUVE,
                StatutScenario.EXPORTE,
              ],
            })
            .orWhere('sharedWith.id = :requesterId', { requesterId });
        }),
      );
    }

    return query;
  }

  async findOne(id: number): Promise<Scenario> {
    const scenario = await this.scenarioRepo.findOne({
      where: { id },
      relations: [
        'user',
        'modules',
        'modules.sequences',
        'modules.sequences.activites',
        'modules.sequences.activites.quiz',
        'modules.sequences.activites.quiz.questions',
        'modules.sequences.activites.quiz.questions.reponses',
        'ressources',
        'rapports',
        'shares',
        'shares.sharedWith',
      ],
    });
    if (!scenario) throw new NotFoundException(`Scénario #${id} introuvable`);
    this.sortScenarioTree(scenario);
    scenario.courseDocument ??= this.buildCourseDocumentFromTree(scenario);
    scenario.scenarioDocument ??= this.buildScenarioDocumentFromTree(scenario);
    return this.exposeOwner(scenario);
  }

  /**
   * Resolves the course payload used for SCORM export.
   *
   * The editor now stores a structured course document, while older scenarios
   * may only have the relational module/sequence/activity tree. Keep this
   * fallback order stable so existing scenarios remain exportable.
   */
  resolveCourseDocumentForExport(scenario: Scenario): CourseDocument {
    this.sortScenarioTree(scenario);

    const synced = scenario.courseDocument
      ? this.withScenarioMetadataFallback(
          this.syncCoursePagesFromLessons(scenario.courseDocument),
          scenario,
        )
      : null;

    if (synced && this.courseDocumentHasExportablePages(synced)) {
      return synced;
    }

    const fromTree = this.buildCourseDocumentFromTree(scenario);
    if (this.courseDocumentHasExportablePages(fromTree)) {
      return fromTree;
    }

    return (
      synced ??
      fromTree ??
      this.createEmptyCourseDocument(
        scenario.titre,
        scenario.description ?? undefined,
      )
    );
  }

  private syncCoursePagesFromLessons(course: CourseDocument): CourseDocument {
    const lessons = course.lessons ?? [];
    if (!lessons.length) return course;
    return {
      ...course,
      pages: lessons.map((lesson) => this.lessonToPage(lesson)),
    };
  }

  private withScenarioMetadataFallback(
    course: CourseDocument,
    scenario: Scenario,
  ): CourseDocument {
    const description = course.description?.trim()
      ? course.description
      : (scenario.description ?? undefined);
    const title = course.title?.trim() ? course.title : scenario.titre;
    const scormMetadata: Record<string, unknown> =
      typeof course.metadata?.scorm === 'object' && course.metadata.scorm
        ? (course.metadata.scorm as Record<string, unknown>)
        : {};

    return {
      ...course,
      title,
      description,
      metadata: {
        ...course.metadata,
        scorm: {
          ...scormMetadata,
          lmsTitle:
            typeof scormMetadata.lmsTitle === 'string' &&
            scormMetadata.lmsTitle.trim()
              ? scormMetadata.lmsTitle
              : title,
          lmsDescription:
            typeof scormMetadata.lmsDescription === 'string' &&
            scormMetadata.lmsDescription.trim()
              ? scormMetadata.lmsDescription
              : description,
        },
      },
    };
  }

  private courseDocumentHasExportablePages(course: CourseDocument): boolean {
    return this.getExportPages(course).length > 0;
  }

  private getExportPages(course: CourseDocument): CoursePage[] {
    const lessons = course.lessons ?? [];
    if (lessons.length) {
      return lessons.map((lesson) => this.lessonToPage(lesson));
    }
    return course.pages ?? [];
  }

  async findOneForRequester(
    id: number,
    requesterId: number,
    requesterRole?: string,
  ): Promise<Scenario> {
    return this.assertCanViewScenario(id, requesterId, requesterRole);
  }

  async findByUser(userId: number): Promise<Scenario[]> {
    const scenarios = await this.scenarioRepo.find({
      where: { user: { id: userId } },
      relations: ['user', 'modules', 'shares', 'shares.sharedWith'],
    });
    return scenarios.map((scenario) => this.exposeOwner(scenario));
  }

  async getNotifications(userId: number): Promise<ScenarioNotificationItem[]> {
    const loginWindow = await this.getNotificationLoginWindow(userId);

    const approvedStatuses = [StatutScenario.APPROUVE, StatutScenario.EXPORTE];

    const [latestPlatformApproval] = await this.scenarioRepo
      .createQueryBuilder('scenario')
      .leftJoinAndSelect('scenario.user', 'user')
      .where('scenario.statut IN (:...approvedStatuses)', {
        approvedStatuses,
      })
      .andWhere('scenario.approvedAt IS NOT NULL')
      .andWhere('scenario.approvedAt > :since', { since: loginWindow.since })
      .orderBy('scenario.approvedAt', 'DESC')
      .take(1)
      .getMany();

    const [latestOwnApproval] = await this.scenarioRepo
      .createQueryBuilder('scenario')
      .leftJoinAndSelect('scenario.user', 'user')
      .where('scenario.statut IN (:...approvedStatuses)', {
        approvedStatuses,
      })
      .andWhere('scenario.approvedAt IS NOT NULL')
      .andWhere('scenario.approvedAt > :since', { since: loginWindow.since })
      .andWhere('user.id = :userId', { userId })
      .orderBy('scenario.approvedAt', 'DESC')
      .take(1)
      .getMany();

    const items: ScenarioNotificationItem[] = [];

    if (latestPlatformApproval) {
      items.push({
        id: 'platform-scenario-approved',
        message: 'a new scenario has been added',
        scenarioId: latestPlatformApproval.id,
        scenarioTitle: latestPlatformApproval.titre,
        createdAt:
          latestPlatformApproval.approvedAt ?? latestPlatformApproval.updatedAt,
      });
    }

    if (latestOwnApproval) {
      items.push({
        id: 'own-scenario-approved',
        message: 'admin approved your scenario',
        scenarioId: latestOwnApproval.id,
        scenarioTitle: latestOwnApproval.titre,
        createdAt: latestOwnApproval.approvedAt ?? latestOwnApproval.updatedAt,
      });
    }

    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(dto: CreateScenarioDto, userId: number): Promise<Scenario> {
    const courseDocument =
      dto.courseDocument ??
      this.createEmptyCourseDocument(dto.titre, dto.description);
    // Extract enhanced metadata from course document
    const metadata = {
      ...(courseDocument.metadata ?? {}),
      version: courseDocument.metadata?.version ?? 1,
    };
    courseDocument.metadata = metadata;
    const tone = typeof metadata.tone === 'string' ? metadata.tone : undefined;
    const audience =
      typeof metadata.audience === 'string' ? metadata.audience : undefined;

    const scenario = this.scenarioRepo.create({
      ...dto,
      objectif:
        dto.objectif ?? this.primaryCourseObjective(courseDocument) ?? null,
      dureeScenario:
        dto.dureeScenario ?? this.courseDurationMinutes(courseDocument) ?? null,
      courseDocument,
      scenarioDocument:
        dto.scenarioDocument ??
        this.createBlankScenarioDocument(
          `scenario-${Date.now()}`,
          dto.titre,
          dto.description,
        ),
      user: { id: userId },
      tone,
      audience,
    });
    const saved = await this.scenarioRepo.save(scenario);
    await this.logActivity(
      saved.id,
      userId,
      'scenario.created',
      'scenario',
      saved.id,
      null,
      {
        title: saved.titre,
        status: saved.statut,
      },
    );
    return this.findOne(saved.id);
  }

  async update(
    id: number,
    dto: UpdateScenarioDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Scenario> {
    const editableScenario =
      requesterId !== undefined
        ? await this.assertCanEditScenario(
            id,
            requesterId,
            requesterRole,
            dto.courseDocument || dto.scenarioDocument
              ? 'content'
              : 'structure',
          )
        : await this.findOne(id);
    // Editing an approved scenario, or one currently submitted for review,
    // must silently kick it back to draft. Otherwise an owner could keep
    // changing content after submission and an admin could end up approving
    // a version they never actually reviewed.
    const shouldReturnToDraft =
      editableScenario.statut === StatutScenario.APPROUVE ||
      editableScenario.statut === StatutScenario.EN_COURS_VALIDATION;
    const lockedStatuses = [StatutScenario.EXPORTE];

    if (lockedStatuses.includes(editableScenario.statut)) {
      throw new BadRequestException(
        `Impossible de modifier un scénario au statut "${editableScenario.statut}". Rejetez-le d'abord.`,
      );
    }
    const nextCourseVersion = (editableScenario.courseDocumentVersion ?? 1) + 1;
    const nextScenarioVersion =
      (editableScenario.scenarioDocumentVersion ?? 1) + 1;
    if (dto.courseDocument || dto.scenarioDocument) {
      const nextCourseDocument: CourseDocument | null = dto.courseDocument
        ? {
            ...dto.courseDocument,
            metadata: {
              ...dto.courseDocument.metadata,
              source: 'course_engine',
              version: nextCourseVersion,
            },
          }
        : editableScenario.courseDocument;
      const nextScenarioDocument: ScenarioDocument | null = dto.scenarioDocument
        ? this.versionScenarioDocument(
            dto.scenarioDocument,
            nextScenarioVersion,
          )
        : editableScenario.scenarioDocument;
      await this.scenarioRepo.save({
        ...editableScenario,
        ...dto,
        statut: shouldReturnToDraft
          ? StatutScenario.BROUILLON
          : editableScenario.statut,
        approvedAt: shouldReturnToDraft ? null : editableScenario.approvedAt,
        courseDocument: nextCourseDocument,
        courseDocumentVersion: dto.courseDocument
          ? nextCourseVersion
          : editableScenario.courseDocumentVersion,
        scenarioDocument: nextScenarioDocument,
        scenarioDocumentVersion: dto.scenarioDocument
          ? nextScenarioVersion
          : editableScenario.scenarioDocumentVersion,
      });
    } else {
      await this.scenarioRepo.update(id, {
        ...(dto as unknown as import('typeorm/query-builder/QueryPartialEntity').QueryDeepPartialEntity<Scenario>),
        ...(shouldReturnToDraft ? { statut: StatutScenario.BROUILLON } : {}),
        ...(shouldReturnToDraft ? { approvedAt: null } : {}),
      });
    }
    await this.logActivity(
      id,
      requesterId,
      dto.courseDocument
        ? 'course_document.updated'
        : dto.scenarioDocument
          ? 'scenario_document.updated'
          : 'scenario.updated',
      dto.courseDocument
        ? 'course'
        : dto.scenarioDocument
          ? 'branching_scenario'
          : 'scenario',
      id,
      this.scenarioSnapshot(editableScenario),
      this.updateDtoSnapshot(dto),
    );
    return this.findOne(id);
  }

  async updateCourseDocument(
    id: number,
    courseDocument: CourseDocument,
    requesterId?: number,
    requesterRole?: string,
    expectedVersion?: number,
  ): Promise<Scenario> {
    const editableScenario =
      requesterId !== undefined
        ? await this.assertCanEditScenario(
            id,
            requesterId,
            requesterRole,
            'content',
          )
        : await this.findOne(id);
    const currentVersion = editableScenario.courseDocumentVersion ?? 1;

    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new ConflictException(
        'This course changed after you opened it. Reload the latest version before saving again.',
      );
    }

    if (editableScenario.statut === StatutScenario.EXPORTE) {
      throw new BadRequestException(
        `Impossible de modifier un scénario au statut "${editableScenario.statut}". Rejetez-le d'abord.`,
      );
    }

    const nextVersion = currentVersion + 1;
    // Same rule as update(): approved AND in-review scenarios must bounce back
    // to draft when their content changes, so a reviewer never approves a
    // version different from what was submitted.
    const shouldReturnToDraft =
      editableScenario.statut === StatutScenario.APPROUVE ||
      editableScenario.statut === StatutScenario.EN_COURS_VALIDATION;
    const nextCourseDocument: CourseDocument = {
      ...courseDocument,
      metadata: {
        ...courseDocument.metadata,
        source:
          courseDocument.metadata?.source === 'ai_draft'
            ? 'ai_draft'
            : 'course_engine',
        version: nextVersion,
      },
    };
    // Preserve tone and audience across versions from the course settings/metadata
    const tone =
      typeof courseDocument.settings?.tone === 'string'
        ? courseDocument.settings.tone
        : typeof courseDocument.metadata?.tone === 'string'
          ? courseDocument.metadata.tone
          : undefined;
    const audience =
      typeof courseDocument.settings?.audience === 'string'
        ? courseDocument.settings.audience
        : typeof courseDocument.metadata?.audience === 'string'
          ? courseDocument.metadata.audience
          : undefined;

    const updatePayload = {
      titre: courseDocument.title,
      description: courseDocument.description,
      objectif: this.primaryCourseObjective(nextCourseDocument) ?? null,
      dureeScenario: this.courseDurationMinutes(nextCourseDocument) ?? null,
      courseDocument: nextCourseDocument as never,
      courseDocumentVersion: nextVersion,
      tone,
      audience,
      statut: shouldReturnToDraft
        ? StatutScenario.BROUILLON
        : editableScenario.statut,
      approvedAt: shouldReturnToDraft ? null : editableScenario.approvedAt,
    };

    if (expectedVersion !== undefined) {
      const result = await this.scenarioRepo.update(
        { id, courseDocumentVersion: expectedVersion },
        updatePayload,
      );
      if (!result.affected) {
        throw new ConflictException(
          'This course changed while your save was in progress. Reload the latest version before saving again.',
        );
      }
    } else {
      await this.scenarioRepo.save({
        ...editableScenario,
        ...updatePayload,
      });
    }

    await this.logActivity(
      id,
      requesterId,
      'course_document.updated',
      'course',
      id,
      this.scenarioSnapshot(editableScenario),
      {
        title: nextCourseDocument.title,
        version: nextVersion,
      },
    );
    return this.findOne(id);
  }

  private primaryCourseObjective(course: CourseDocument): string | undefined {
    const objectives = Array.isArray(course.objectives)
      ? course.objectives
      : [];
    return objectives.find(
      (objective): objective is string =>
        typeof objective === 'string' && Boolean(objective.trim()),
    );
  }

  private courseDurationMinutes(course: CourseDocument): number | undefined {
    const explicitDuration = this.positiveCourseMinutes(
      course.estimatedMinutes,
    );
    if (explicitDuration) return explicitDuration;

    const total = (course.lessons ?? []).reduce(
      (sum, lesson) =>
        sum + (this.positiveCourseMinutes(lesson.estimatedMinutes) ?? 0),
      0,
    );
    return total || undefined;
  }

  private positiveCourseMinutes(value: unknown): number | undefined {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
    return Math.round(minutes);
  }

  async updateScenarioDocument(
    id: number,
    scenarioDocument: ScenarioDocument,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Scenario> {
    return this.update(
      id,
      {
        scenarioDocument,
        titre: scenarioDocument.title,
        description: scenarioDocument.description,
      },
      requesterId,
      requesterRole,
    );
  }

  async remove(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    if (requesterId !== undefined) {
      await this.assertCanEditScenario(
        id,
        requesterId,
        requesterRole,
        'structure',
      );
    }
    const scenario = await this.findOne(id);
    await this.scenarioRepo.remove(scenario);
  }

  // ─── LIFECYCLE TRANSITIONS ───────────────────────────────────────────────

  /** BROUILLON → EN_COURS_VALIDATION */
  async submitForValidation(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Scenario> {
    if (requesterId !== undefined) {
      await this.assertCanEditScenario(
        id,
        requesterId,
        requesterRole,
        'publish',
      );
    }
    const scenario = await this.findOne(id);
    if (scenario.statut !== StatutScenario.BROUILLON) {
      throw new BadRequestException(
        `Seul un scénario en brouillon peut être soumis pour validation. Statut actuel : "${scenario.statut}"`,
      );
    }
    await this.scenarioRepo.update(id, {
      statut: StatutScenario.EN_COURS_VALIDATION,
      approvedAt: null,
    });
    await this.logActivity(
      id,
      requesterId,
      'scenario.submitted',
      'scenario',
      id,
      { status: scenario.statut },
      { status: StatutScenario.EN_COURS_VALIDATION },
    );
    return this.findOne(id);
  }

  /** EN_COURS_VALIDATION → APPROUVE */
  async approve(id: number): Promise<Scenario> {
    const scenario = await this.findOne(id);
    if (scenario.statut !== StatutScenario.EN_COURS_VALIDATION) {
      throw new BadRequestException(
        `Seul un scénario "en cours de validation" peut être approuvé. Statut actuel : "${scenario.statut}"`,
      );
    }
    const approvedAt = new Date();
    await this.scenarioRepo.update(id, {
      statut: StatutScenario.APPROUVE,
      approvedAt,
    });
    await this.logActivity(
      id,
      undefined,
      'scenario.approved',
      'scenario',
      id,
      { status: scenario.statut },
      { status: StatutScenario.APPROUVE },
    );
    return this.findOne(id);
  }

  /** EN_COURS_VALIDATION → BROUILLON (rejected) */
  async reject(
    id: number,
    requesterId?: number,
    comment?: string,
  ): Promise<Scenario> {
    const scenario = await this.findOne(id);
    if (scenario.statut !== StatutScenario.EN_COURS_VALIDATION) {
      throw new BadRequestException(
        `Seul un scénario "en cours de validation" peut être rejeté. Statut actuel : "${scenario.statut}"`,
      );
    }
    await this.scenarioRepo.update(id, {
      statut: StatutScenario.BROUILLON,
      approvedAt: null,
    });
    const trimmedComment = comment?.trim();
    if (trimmedComment && requesterId !== undefined) {
      await this.commentRepo.save(
        this.commentRepo.create({
          targetType: 'course',
          targetId: null,
          body: trimmedComment,
          mentions: null,
          scenario: { id },
          author: { id: requesterId },
        }),
      );
    }
    await this.logActivity(
      id,
      requesterId,
      'scenario.rejected',
      'scenario',
      id,
      { status: scenario.statut },
      {
        status: StatutScenario.BROUILLON,
        commentAdded: Boolean(trimmedComment && requesterId !== undefined),
      },
    );
    return this.findOne(id);
  }

  /** APPROUVE → EXPORTE */
  async exportScenario(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Scenario> {
    if (requesterId !== undefined) {
      await this.assertCanEditScenario(
        id,
        requesterId,
        requesterRole,
        'publish',
      );
    }
    const scenario = await this.findOne(id);
    if (scenario.statut !== StatutScenario.APPROUVE) {
      throw new BadRequestException(
        `Seul un scénario approuvé peut être exporté. Statut actuel : "${scenario.statut}"`,
      );
    }
    await this.scenarioRepo.update(id, { statut: StatutScenario.EXPORTE });
    await this.logActivity(
      id,
      requesterId,
      'scenario.exported',
      'scenario',
      id,
      { status: scenario.statut },
      { status: StatutScenario.EXPORTE },
    );
    return this.findOne(id);
  }

  /** Any state → ARCHIVE */
  async archive(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Scenario> {
    if (requesterId !== undefined) {
      await this.assertCanEditScenario(
        id,
        requesterId,
        requesterRole,
        'publish',
      );
    }
    const scenario = await this.findOne(id);
    await this.scenarioRepo.update(id, { statut: StatutScenario.ARCHIVE });
    await this.logActivity(
      id,
      requesterId,
      'scenario.archived',
      'scenario',
      id,
      { status: scenario.statut },
      { status: StatutScenario.ARCHIVE },
    );
    return this.findOne(id);
  }

  /** Duplicate a scenario (clone) for another user */
  async duplicate(
    id: number,
    newUserId: number,
    requesterRole?: string,
  ): Promise<Scenario> {
    // "Make your own copy" only needs read access to the source scenario.
    // Requiring edit rights here wrongly blocked admins reviewing someone
    // else's (non-draft) scenario, and collaborators with view-only shares,
    // from duplicating it - both of whom can already view it.
    const original = await this.assertCanViewScenario(
      id,
      newUserId,
      requesterRole,
    );
    const clone = this.scenarioRepo.create({
      titre: `${original.titre} (copie)`,
      description: original.description,
      objectif: original.objectif,
      niveau: original.niveau,
      dureeScenario: original.dureeScenario,
      statut: StatutScenario.BROUILLON,
      courseDocument: original.courseDocument
        ? {
            ...original.courseDocument,
            id: `scenario-${id}-copy-${Date.now()}`,
            title: `${original.courseDocument.title} (copie)`,
            metadata: {
              ...original.courseDocument.metadata,
              version: 1,
            },
          }
        : null,
      scenarioDocument: original.scenarioDocument
        ? {
            ...original.scenarioDocument,
            scenarioId: `scenario-${id}-copy-${Date.now()}`,
            title: `${original.scenarioDocument.title} (copie)`,
            metadata: {
              ...original.scenarioDocument.metadata,
              version: 1,
              updatedAt: new Date().toISOString(),
            },
          }
        : null,
      user: { id: newUserId },
    });
    const saved = await this.scenarioRepo.save(clone);
    await this.logActivity(
      saved.id,
      newUserId,
      'scenario.duplicated',
      'scenario',
      saved.id,
      null,
      { sourceScenarioId: id },
    );
    return this.findOne(saved.id);
  }

  async assertCanViewScenario(
    id: number,
    userId: number,
    userRole?: string,
  ): Promise<Scenario> {
    // This policy is mirrored by the collaboration gateway; keep draft/admin
    // and share-based access rules aligned when changing either path.
    const scenario = await this.findOne(id);
    if (this.isScenarioOwner(scenario, userId)) {
      return scenario;
    }

    const share = await this.shareRepo.findOne({
      where: { scenario: { id }, sharedWith: { id: userId } },
    });
    if (share) return scenario;

    if (this.isAdmin(userRole)) {
      if (scenario.statut === StatutScenario.BROUILLON) {
        throw new ForbiddenException(
          'Draft scenarios are only visible to their owner.',
        );
      }
      return scenario;
    }

    throw new ForbiddenException('You do not have access to this scenario.');
  }

  async assertCanEditScenario(
    id: number,
    userId: number,
    userRole?: string,
    scope: 'content' | 'structure' | 'publish' = 'content',
  ): Promise<Scenario> {
    // Admins can review but not co-author someone else's scenario. Shared edit
    // grants are the only non-owner write path.
    const scenario = await this.findOne(id);
    if (this.isScenarioOwner(scenario, userId)) return scenario;

    const editableShare = await this.shareRepo.findOne({
      where: {
        scenario: { id },
        sharedWith: { id: userId },
      },
    });
    if (editableShare) {
      if (!this.shareAllowsScope(editableShare, scope)) {
        throw new ForbiddenException(
          'You do not have edit access to this scenario.',
        );
      }
      if (isApprovedScenarioStatut(scenario.statut)) {
        throw new ForbiddenException(
          'Approved scenarios are view-only for collaborators.',
        );
      }
      return scenario;
    }

    if (this.isAdmin(userRole)) {
      throw new ForbiddenException(
        'Admins can review scenarios owned by other users, but cannot edit them.',
      );
    }

    throw new ForbiddenException(
      'You do not have edit access to this scenario.',
    );
  }

  private isAdmin(userRole?: string): boolean {
    return userRole?.toLowerCase() === 'admin';
  }

  private isScenarioOwner(scenario: Scenario, userId: number): boolean {
    return Number(scenario.user?.id) === Number(userId);
  }

  private async getNotificationLoginWindow(userId: number): Promise<{
    since: Date;
  }> {
    const user = await this.scenarioRepo.manager.getRepository(User).findOne({
      where: { id: userId },
      select: ['id', 'previousLoginAt', 'lastLoginAt'],
    });

    const since =
      this.dateFrom(user?.previousLoginAt) ??
      this.dateFrom(user?.lastLoginAt) ??
      new Date();

    return { since };
  }

  private dateFrom(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private shareAllowsScope(
    share: ScenarioShare,
    scope: 'content' | 'structure' | 'publish',
  ): boolean {
    if (scope === 'publish') return share.canPublish === true;
    if (scope === 'structure') {
      return share.permission === 'edit' || share.canEditStructure === true;
    }
    return share.permission === 'edit' || share.canEditContent === true;
  }

  private exposeOwner(scenario: Scenario): Scenario {
    if (!scenario.user) return scenario;

    const ownerName = this.displayNameForUser(scenario.user);
    const publicOwner = {
      id: scenario.user.id,
      firstName: scenario.user.firstName,
      lastName: scenario.user.lastName,
      email: scenario.user.email,
      name: ownerName,
      role: scenario.user.role,
    };

    scenario.user = publicOwner as unknown as Scenario['user'];
    const scenarioWithOwner = scenario as Scenario & {
      author?: typeof publicOwner;
      ownerId?: number;
      ownerName?: string;
    };
    scenarioWithOwner.author = publicOwner;
    scenarioWithOwner.ownerId = publicOwner.id;
    scenarioWithOwner.ownerName = ownerName;
    if (
      Array.isArray(
        (scenario as Scenario & { shares?: ScenarioShare[] }).shares,
      )
    ) {
      scenario.shares = scenario.shares.map((share) => {
        if (share.sharedWith) {
          share.sharedWith = {
            id: share.sharedWith.id,
            firstName: share.sharedWith.firstName,
            lastName: share.sharedWith.lastName,
            email: share.sharedWith.email,
            role: share.sharedWith.role,
          } as ScenarioShare['sharedWith'];
        }
        return share;
      });
    }
    return scenario;
  }

  private scenarioSnapshot(scenario: Scenario): Record<string, unknown> {
    return {
      title: scenario.titre,
      description: scenario.description,
      status: scenario.statut,
      courseDocumentVersion: scenario.courseDocumentVersion,
      scenarioDocumentVersion: scenario.scenarioDocumentVersion,
    };
  }

  private updateDtoSnapshot(dto: UpdateScenarioDto): Record<string, unknown> {
    return {
      title: dto.titre,
      description: dto.description,
      status: dto.statut,
      courseDocumentVersion: dto.courseDocument ? 'next' : undefined,
      scenarioDocumentVersion: dto.scenarioDocument ? 'next' : undefined,
    };
  }

  private async logActivity(
    scenarioId: number,
    actorId: number | undefined,
    action: string,
    targetType: string,
    targetId: string | number,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await this.activityRepo.save(
        this.activityRepo.create({
          scenario: { id: scenarioId },
          actor: actorId ? { id: actorId } : null,
          action,
          targetType,
          targetId: String(targetId),
          before,
          after,
        }),
      );
    } catch {
      // Audit logging is best effort and must not block the primary action.
    }
  }

  private displayNameForUser(user: Scenario['user']): string {
    const fullName = [user.firstName, user.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');

    if (fullName) return fullName;
    if (user.email?.trim()) return user.email.trim().split('@')[0];
    return `User #${user.id}`;
  }

  private createBlankScenarioDocument(
    scenarioId: string,
    title: string,
    description?: string,
  ): ScenarioDocument {
    const now = Date.now();
    const startNodeId = `start-${now}`;
    return {
      schemaVersion: 1,
      scenarioId,
      title: title || 'Untitled Scenario',
      description,
      settings: {
        autosave: true,
        allowBacktracking: true,
        showProgress: true,
        shuffleChoices: false,
        completionTracking: true,
        scoreTracking: true,
      },
      nodes: [
        {
          id: startNodeId,
          type: 'start',
          speaker: {
            name: 'Narrator',
            role: 'Guide',
          },
          content: {
            title: 'Start',
            body: 'This is where the scenario begins.',
            tone: 'friendly',
          },
          choices: [
            {
              id: `choice-${now}`,
              text: 'Add next step',
              scoreDelta: 0,
            },
          ],
          feedback: {},
          media: [],
          conditions: [],
          effects: [],
          position: { x: 120, y: 160 },
        },
      ],
      connections: [],
      variables: [],
      scoring: {
        enabled: true,
        maxScore: 100,
        passingScore: 80,
        completionMode: 'visited_end',
      },
      metadata: {
        source: 'blank',
        version: 1,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiReady: true,
        scormReady: true,
      },
    };
  }

  private versionScenarioDocument(
    document: ScenarioDocument,
    version: number,
  ): ScenarioDocument {
    return {
      ...document,
      metadata: {
        ...document.metadata,
        version,
        updatedAt: new Date().toISOString(),
        aiReady: true,
        scormReady: true,
      },
    };
  }

  private createEmptyCourseDocument(
    title: string,
    description?: string,
  ): CourseDocument {
    const now = Date.now();
    const lessonId = `lesson-${now}`;
    const blockId = `block-${now}`;
    return {
      schemaVersion: 1,
      id: `course-${now}`,
      title,
      description,
      objectives: [],
      sections: [
        {
          id: `section-${now}`,
          title: 'Course content',
          lessonIds: [lessonId],
        },
      ],
      lessons: [
        {
          id: lessonId,
          type: 'lesson',
          title: 'Introduction',
          summary: description,
          estimatedMinutes: 5,
          blocks: [
            {
              id: `heading-${now}`,
              type: 'heading',
              category: 'text',
              title: 'Introduction',
              content: title,
            },
            {
              id: blockId,
              type: 'paragraph',
              category: 'text',
              content:
                description || 'Start building your learning experience here.',
            },
          ],
        },
      ],
      pages: [
        {
          id: lessonId,
          type: 'lesson',
          title: 'Introduction',
          summary: description,
          blocks: [
            {
              id: `heading-${now}`,
              type: 'heading',
              category: 'text',
              title: 'Introduction',
              content: title,
            },
            {
              id: blockId,
              type: 'paragraph',
              category: 'text',
              content:
                description || 'Start building your learning experience here.',
            },
          ],
        },
      ],
      settings: {
        completionMode: 'pages',
        passingScore: 80,
        scormVersion: '1.2',
        completionPercentage: 100,
        requireQuizPass: false,
      },
      theme: {
        accentColor: '#0F6B4A',
        fontPairing: 'modern',
        coverLayout: 'centered',
        navigationMode: 'sidebar',
        lessonNumbers: true,
        sidebarEnabled: true,
      },
      publish: {
        target: 'lms',
        lmsStandard: 'scorm_1_2',
        tracking: 'completion_and_score',
        completionPercentage: 100,
        passingScore: 80,
        reportingStatus: 'completed_passed',
      },
      metadata: {
        source: 'course_engine',
        generatedAt: new Date().toISOString(),
        version: 1,
      },
    };
  }

  private buildCourseDocumentFromTree(scenario: Scenario): CourseDocument {
    const pages: CoursePage[] = [];
    const lessons: CourseLesson[] = [];
    const sections: CourseSection[] = [];

    scenario.modules?.forEach((module) => {
      const section: CourseSection = {
        id: `section-module-${module.id}`,
        title: module.titre,
        lessonIds: [],
      };

      module.sequences?.forEach((sequence) => {
        const blocks: CourseBlock[] = [];

        if (sequence.texte || sequence.description) {
          blocks.push({
            id: `sequence-${sequence.id}-text`,
            type: 'paragraph',
            category: 'text',
            content: sequence.texte || sequence.description,
          });
        }

        sequence.activites?.forEach((activity) => {
          if (activity.quiz) {
            const quizLesson: CourseLesson = {
              id: `quiz-${activity.id}`,
              type: 'quiz',
              title: activity.titre,
              summary: activity.consigne,
              blocks: [],
              quiz: {
                passingScore: activity.quiz.scorePourReussir ?? 70,
                showFeedback: true,
                questions: (activity.quiz.questions ?? []).map((question) => ({
                  id: `question-${question.id}`,
                  type: 'multiple_choice',
                  text: question.titre,
                  points: question.points ?? 1,
                  options: (question.reponses ?? []).map((answer) => ({
                    id: `answer-${answer.id}`,
                    text: answer.texte,
                    isCorrect: answer.estCorrect,
                    feedback: answer.feedback,
                  })),
                })),
              },
              metadata: {
                legacyActivityId: activity.id,
                legacySequenceId: sequence.id,
                legacyModuleId: module.id,
              },
            };
            lessons.push(quizLesson);
            pages.push(this.lessonToPage(quizLesson));
            section.lessonIds.push(quizLesson.id);
            return;
          }

          blocks.push({
            id: `activity-${activity.id}`,
            type: String(activity.type) === 'video' ? 'video' : 'paragraph',
            category: String(activity.type) === 'video' ? 'media' : 'text',
            title: activity.titre,
            content: activity.consigne,
            assetUrl:
              String(activity.type) === 'video' ? activity.consigne : undefined,
            metadata: {
              legacyActivityId: activity.id,
              activityType: activity.type,
            },
          });
        });

        const lesson: CourseLesson = {
          id: `sequence-${sequence.id}`,
          type: 'lesson',
          title: sequence.titre,
          summary: sequence.description,
          blocks,
          estimatedMinutes: 5,
          metadata: {
            legacySequenceId: sequence.id,
            legacyModuleId: module.id,
            moduleTitle: module.titre,
          },
        };
        lessons.push(lesson);
        pages.push(this.lessonToPage(lesson));
        section.lessonIds.push(lesson.id);
      });

      if (section.lessonIds.length) sections.push(section);
    });

    if (!lessons.length) {
      return this.createEmptyCourseDocument(
        scenario.titre,
        scenario.description ?? undefined,
      );
    }

    return {
      schemaVersion: 1,
      id: `scenario-${scenario.id}`,
      title: scenario.titre,
      description: scenario.description ?? undefined,
      objectives: scenario.objectif ? [scenario.objectif] : [],
      estimatedMinutes: scenario.dureeScenario ?? undefined,
      sections,
      lessons,
      pages,
      settings: {
        completionMode: 'pages',
        passingScore: 80,
        scormVersion: '1.2',
        completionPercentage: 100,
        requireQuizPass: false,
      },
      theme: {
        accentColor: '#0F6B4A',
        fontPairing: 'modern',
        coverLayout: 'centered',
        navigationMode: 'sidebar',
        lessonNumbers: true,
        sidebarEnabled: true,
      },
      publish: {
        target: 'lms',
        lmsStandard: 'scorm_1_2',
        tracking: 'completion_and_score',
        completionPercentage: 100,
        passingScore: 80,
        reportingStatus: 'completed_passed',
      },
      metadata: {
        source: 'legacy_tree',
        generatedAt: new Date().toISOString(),
        version: scenario.courseDocumentVersion ?? 1,
      },
    };
  }

  private buildScenarioDocumentFromTree(scenario: Scenario): ScenarioDocument {
    const document = this.createBlankScenarioDocument(
      `scenario-${scenario.id}`,
      scenario.titre,
      scenario.description ?? undefined,
    );
    const nodes = [...document.nodes];
    const connections = [...document.connections];
    let previousNodeId = nodes[0]?.id;
    let offset = 0;

    scenario.modules?.forEach((module) => {
      module.sequences?.forEach((sequence) => {
        const infoNodeId = `sequence-${sequence.id}`;
        nodes.push({
          id: infoNodeId,
          type: 'information',
          speaker: {
            name: module.titre,
            role: 'Module',
          },
          content: {
            title: sequence.titre,
            body: sequence.description ?? sequence.texte ?? '',
            tone: 'neutral',
          },
          choices: [],
          feedback: {},
          media: [],
          conditions: [],
          effects: [],
          position: { x: 420 + offset * 280, y: 160 },
        });

        if (previousNodeId) {
          connections.push({
            id: `connection-${previousNodeId}-${infoNodeId}`,
            sourceNodeId: previousNodeId,
            targetNodeId: infoNodeId,
            label: 'Continue',
          });
        }

        previousNodeId = infoNodeId;
        offset += 1;

        sequence.activites?.forEach((activity) => {
          const nodeId = `activity-${activity.id}`;
          nodes.push({
            id: nodeId,
            type: activity.quiz ? 'choice' : 'dialogue',
            speaker: {
              name: module.titre,
              role: 'Instructor',
            },
            content: {
              title: activity.titre,
              body: activity.consigne ?? '',
              tone: 'friendly',
            },
            choices: activity.quiz
              ? (activity.quiz.questions?.[0]?.reponses ?? []).map(
                  (answer) => ({
                    id: `answer-${answer.id}`,
                    text: answer.texte,
                    scoreDelta: answer.estCorrect ? 10 : 0,
                    feedback: answer.feedback,
                  }),
                )
              : [],
            feedback: {},
            media: [],
            conditions: [],
            effects: [],
            position: { x: 420 + offset * 280, y: 160 },
          });
          if (previousNodeId) {
            connections.push({
              id: `connection-${previousNodeId}-${nodeId}`,
              sourceNodeId: previousNodeId,
              targetNodeId: nodeId,
              label: 'Continue',
            });
          }
          previousNodeId = nodeId;
          offset += 1;
        });
      });
    });

    if (previousNodeId && previousNodeId !== nodes[0]?.id) {
      const endingNodeId = `ending-${scenario.id}`;
      nodes.push({
        id: endingNodeId,
        type: 'ending',
        speaker: {
          name: 'Narrator',
          role: 'Guide',
        },
        content: {
          title: 'Ending',
          body: 'Scenario complete.',
          tone: 'friendly',
        },
        choices: [],
        feedback: {},
        media: [],
        conditions: [],
        effects: [
          { id: `complete-${scenario.id}`, type: 'complete', value: true },
        ],
        position: { x: 420 + offset * 280, y: 160 },
      });
      connections.push({
        id: `connection-${previousNodeId}-${endingNodeId}`,
        sourceNodeId: previousNodeId,
        targetNodeId: endingNodeId,
        label: 'Finish',
      });
    }

    return {
      ...document,
      nodes,
      connections,
      metadata: {
        ...document.metadata,
        source: 'legacy_tree',
        version: scenario.scenarioDocumentVersion ?? 1,
      },
    };
  }

  private lessonToPage(lesson: CourseLesson): CoursePage {
    return {
      id: lesson.id,
      type: lesson.type === 'quiz' ? 'quiz' : 'lesson',
      title: lesson.title,
      summary: lesson.summary,
      coverImageUrl: lesson.coverImageUrl,
      blocks: lesson.blocks,
      quiz: lesson.quiz
        ? {
            passingScore: lesson.quiz.passingScore,
            timeLimitMinutes: lesson.quiz.timeLimitMinutes,
            attempts: lesson.quiz.attempts,
            randomizeQuestions: lesson.quiz.randomizeQuestions,
            randomizeAnswers: lesson.quiz.randomizeAnswers,
            showFeedback: lesson.quiz.showFeedback,
            questions: lesson.quiz.questions,
          }
        : undefined,
      metadata: lesson.metadata,
    };
  }

  private sortScenarioTree(scenario: Scenario): void {
    scenario.modules?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
    scenario.modules?.forEach((module) => {
      module.sequences?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
      module.sequences?.forEach((sequence) => {
        sequence.activites?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
        sequence.activites?.forEach((activite) => {
          // The quiz/question/answer tree isn't touched by the sorts above,
          // so without this, question and answer order silently depends on
          // DB return order instead of the authored sequence.
          activite.quiz?.questions?.sort(
            (a, b) => a.ordre - b.ordre || a.id - b.id,
          );
          activite.quiz?.questions?.forEach((question) => {
            question.reponses?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
          });
        });
      });
    });
  }
}
