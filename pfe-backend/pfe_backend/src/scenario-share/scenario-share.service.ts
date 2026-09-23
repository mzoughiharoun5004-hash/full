import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Scenario } from 'src/scenario/scenario.entity';
import { User } from 'src/users/user.entity';
import { ScenarioShare } from './scenario-share.entity';
import { ScenarioActivityLog } from './scenario-activity-log.entity';
import { ScenarioChangeProposal } from './scenario-change-proposal.entity';
import { ScenarioComment } from './scenario-comment.entity';
import {
  CreateScenarioCommentDto,
  CreateScenarioProposalDto,
  CreateScenarioShareDto,
  ReviewScenarioProposalDto,
  UpdateScenarioCommentDto,
  UpdateScenarioShareDto,
} from './dto/scenario-share.dto';
import {
  ScenarioAccessPolicy,
  ScenarioEditScope,
} from 'src/scenario/scenario-access.policy';

interface ActivityLogInput {
  scenarioId: number;
  actorId?: number;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class ScenarioShareService {
  constructor(
    @InjectRepository(ScenarioShare)
    private readonly shareRepo: Repository<ScenarioShare>,
    @InjectRepository(Scenario)
    private readonly scenarioRepo: Repository<Scenario>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ScenarioComment)
    private readonly commentRepo: Repository<ScenarioComment>,
    @InjectRepository(ScenarioActivityLog)
    private readonly activityRepo: Repository<ScenarioActivityLog>,
    @InjectRepository(ScenarioChangeProposal)
    private readonly proposalRepo: Repository<ScenarioChangeProposal>,
    private readonly eventEmitter: EventEmitter2,
    private readonly accessPolicy: ScenarioAccessPolicy,
  ) {}

  /** List all shares for a given scenario */
  async findByScenario(
    scenarioId: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<ScenarioShare[]> {
    if (requesterId) {
      await this.assertCanViewScenario(scenarioId, requesterId, requesterRole);
    }

    const shares = await this.shareRepo.find({
      where: { scenario: { id: scenarioId } },
      relations: ['sharedWith'],
      order: { sharedAt: 'ASC' },
    });
    return shares.map((share) => this.exposeShare(share));
  }

  /** List all scenarios shared with a user */
  async findByUser(userId: number): Promise<ScenarioShare[]> {
    const shares = await this.shareRepo.find({
      where: { sharedWith: { id: userId } },
      relations: ['scenario', 'scenario.user', 'sharedWith'],
      order: { sharedAt: 'DESC' },
    });
    return shares.map((share) => this.exposeShare(share));
  }

  async share(
    dto: CreateScenarioShareDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<ScenarioShare> {
    if (requesterId) {
      await this.assertCanEditScenario(
        dto.scenarioId,
        requesterId,
        requesterRole,
        'team',
      );
    }

    const sharedWith = await this.resolveCollaborator(dto);
    if (Number(sharedWith.id) === Number(requesterId)) {
      throw new ConflictException(
        'Vous etes deja proprietaire de ce scenario.',
      );
    }

    const existing = await this.shareRepo.findOne({
      where: {
        scenario: { id: dto.scenarioId },
        sharedWith: { id: sharedWith.id },
      },
      relations: ['sharedWith'],
    });
    if (existing) {
      throw new ConflictException(
        'Ce scenario est deja partage avec cet utilisateur.',
      );
    }

    const defaults = this.fullAccessDefaults();
    const share = this.shareRepo.create({
      ...defaults,
      scenario: { id: dto.scenarioId },
      sharedWith: { id: sharedWith.id },
    });
    const saved = await this.shareRepo.save(share);
    await this.logActivity({
      scenarioId: dto.scenarioId,
      actorId: requesterId,
      action: 'share.created',
      targetType: 'share',
      targetId: saved.id,
      after: this.shareSnapshot(saved),
    });
    return this.exposeShare(saved);
  }

  async updatePermission(
    id: number,
    dto: UpdateScenarioShareDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<ScenarioShare> {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['scenario', 'sharedWith'],
    });
    if (!share) throw new NotFoundException(`Partage #${id} introuvable`);
    if (requesterId) {
      await this.assertCanEditScenario(
        share.scenario.id,
        requesterId,
        requesterRole,
        'team',
      );
    }

    const before = this.shareSnapshot(share);
    Object.assign(share, this.fullAccessDefaults());

    const saved = await this.shareRepo.save(share);
    await this.logActivity({
      scenarioId: share.scenario.id,
      actorId: requesterId,
      action: 'share.updated',
      targetType: 'share',
      targetId: share.id,
      before,
      after: this.shareSnapshot(saved),
    });
    return this.exposeShare(saved);
  }

  async revoke(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['scenario', 'sharedWith'],
    });
    if (!share) throw new NotFoundException(`Partage #${id} introuvable`);
    if (requesterId) {
      await this.assertCanEditScenario(
        share.scenario.id,
        requesterId,
        requesterRole,
        'team',
      );
    }

    const before = this.shareSnapshot(share);
    const revokedUserId = share.sharedWith?.id;
    const revokedScenarioId = share.scenario?.id;
    await this.shareRepo.remove(share);
    await this.logActivity({
      scenarioId: revokedScenarioId,
      actorId: requesterId,
      action: 'share.revoked',
      targetType: 'share',
      targetId: id,
      before,
    });
    // Notify the collaboration gateway to kick the socket of the revoked user
    if (revokedUserId && revokedScenarioId) {
      this.eventEmitter.emit('share.revoked', {
        scenarioId: revokedScenarioId,
        userId: revokedUserId,
      });
    }
  }

  async listComments(
    scenarioId: number,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioComment[]> {
    await this.assertCanEditScenario(
      scenarioId,
      requesterId,
      requesterRole,
      'any',
    );
    const comments = await this.commentRepo.find({
      where: { scenario: { id: scenarioId } },
      relations: ['author'],
      order: { createdAt: 'DESC' },
    });
    return comments.map((comment) => this.exposeComment(comment));
  }

  async createComment(
    scenarioId: number,
    dto: CreateScenarioCommentDto,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioComment> {
    await this.assertCanEditScenario(
      scenarioId,
      requesterId,
      requesterRole,
      'any',
    );
    const comment = this.commentRepo.create({
      targetType: dto.targetType,
      targetId: dto.targetId ?? null,
      body: dto.body.trim(),
      mentions: dto.mentions ?? null,
      scenario: { id: scenarioId },
      author: { id: requesterId },
    });
    const saved = await this.commentRepo.save(comment);
    await this.logActivity({
      scenarioId,
      actorId: requesterId,
      action: 'comment.created',
      targetType: dto.targetType,
      targetId: dto.targetId ?? saved.id,
      after: {
        id: saved.id,
        body: saved.body,
        mentions: saved.mentions,
      },
    });
    return this.findCommentOrThrow(saved.id);
  }

  async updateComment(
    id: number,
    dto: UpdateScenarioCommentDto,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioComment> {
    const comment = await this.findCommentOrThrow(id);
    await this.assertCanMutateComment(comment, requesterId, requesterRole);
    const before = this.commentSnapshot(comment);
    if (dto.body !== undefined) comment.body = dto.body.trim();
    if (dto.mentions !== undefined) comment.mentions = dto.mentions;
    const saved = await this.commentRepo.save(comment);
    await this.logActivity({
      scenarioId: comment.scenario.id,
      actorId: requesterId,
      action: 'comment.updated',
      targetType: comment.targetType,
      targetId: comment.targetId ?? comment.id,
      before,
      after: this.commentSnapshot(saved),
    });
    return this.exposeComment(saved);
  }

  async resolveComment(
    id: number,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioComment> {
    const comment = await this.findCommentOrThrow(id);
    await this.assertCanMutateComment(comment, requesterId, requesterRole);
    const before = this.commentSnapshot(comment);
    comment.status = 'resolved';
    comment.resolvedAt = new Date();
    const saved = await this.commentRepo.save(comment);
    await this.logActivity({
      scenarioId: comment.scenario.id,
      actorId: requesterId,
      action: 'comment.resolved',
      targetType: comment.targetType,
      targetId: comment.targetId ?? comment.id,
      before,
      after: this.commentSnapshot(saved),
    });
    return this.exposeComment(saved);
  }

  async listActivity(
    scenarioId: number,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioActivityLog[]> {
    await this.assertCanViewScenario(scenarioId, requesterId, requesterRole);
    const activity = await this.activityRepo.find({
      where: { scenario: { id: scenarioId } },
      relations: ['actor'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return activity.map((item) => this.exposeActivity(item));
  }

  async logActivity(input: ActivityLogInput): Promise<void> {
    try {
      const activity = this.activityRepo.create({
        action: input.action,
        targetType: input.targetType ?? null,
        targetId:
          input.targetId === undefined || input.targetId === null
            ? null
            : String(input.targetId),
        before: input.before ?? null,
        after: input.after ?? null,
        metadata: input.metadata ?? null,
        scenario: { id: input.scenarioId },
        actor: input.actorId ? { id: input.actorId } : null,
      });
      await this.activityRepo.save(activity);
    } catch {
      // Activity logging must never block the primary course action.
    }
  }

  async listProposals(
    scenarioId: number,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioChangeProposal[]> {
    await this.assertCanViewScenario(scenarioId, requesterId, requesterRole);
    const proposals = await this.proposalRepo.find({
      where: { scenario: { id: scenarioId } },
      relations: ['proposer', 'reviewer'],
      order: { createdAt: 'DESC' },
    });
    return proposals.map((proposal) => this.exposeProposal(proposal));
  }

  async createProposal(
    scenarioId: number,
    dto: CreateScenarioProposalDto,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioChangeProposal> {
    await this.assertCanViewScenario(scenarioId, requesterId, requesterRole);
    const proposal = this.proposalRepo.create({
      targetType: dto.targetType,
      targetId: dto.targetId ?? null,
      summary: dto.summary.trim(),
      patch: dto.patch ?? null,
      scenario: { id: scenarioId },
      proposer: { id: requesterId },
    });
    const saved = await this.proposalRepo.save(proposal);
    await this.logActivity({
      scenarioId,
      actorId: requesterId,
      action: 'proposal.created',
      targetType: dto.targetType,
      targetId: dto.targetId ?? saved.id,
      after: this.proposalSnapshot(saved),
    });
    return this.findProposalOrThrow(saved.id);
  }

  async reviewProposal(
    id: number,
    dto: ReviewScenarioProposalDto,
    requesterId: number,
    requesterRole?: string,
  ): Promise<ScenarioChangeProposal> {
    const proposal = await this.findProposalOrThrow(id);
    await this.assertCanEditScenario(
      proposal.scenario.id,
      requesterId,
      requesterRole,
      'publish',
    );
    if (proposal.status !== 'pending') {
      throw new ConflictException('Cette proposition a deja ete traitee.');
    }

    const before = this.proposalSnapshot(proposal);
    proposal.status = dto.status;
    proposal.decisionNote = dto.decisionNote?.trim() || null;
    proposal.reviewedAt = new Date();
    proposal.reviewer = { id: requesterId } as User;
    const saved = await this.proposalRepo.save(proposal);
    await this.logActivity({
      scenarioId: proposal.scenario.id,
      actorId: requesterId,
      action:
        dto.status === 'approved' ? 'proposal.approved' : 'proposal.rejected',
      targetType: proposal.targetType,
      targetId: proposal.targetId ?? proposal.id,
      before,
      after: this.proposalSnapshot(saved),
    });
    return this.findProposalOrThrow(saved.id);
  }

  private async findCommentOrThrow(id: number): Promise<ScenarioComment> {
    const comment = await this.commentRepo.findOne({
      where: { id },
      relations: ['scenario', 'scenario.user', 'author'],
    });
    if (!comment) throw new NotFoundException(`Commentaire #${id} introuvable`);
    return this.exposeComment(comment);
  }

  private async findProposalOrThrow(
    id: number,
  ): Promise<ScenarioChangeProposal> {
    const proposal = await this.proposalRepo.findOne({
      where: { id },
      relations: ['scenario', 'scenario.user', 'proposer', 'reviewer'],
    });
    if (!proposal) {
      throw new NotFoundException(`Proposition #${id} introuvable`);
    }
    return this.exposeProposal(proposal);
  }

  private async assertCanMutateComment(
    comment: ScenarioComment,
    userId: number,
    userRole?: string,
  ): Promise<void> {
    if (Number(comment.author?.id) === Number(userId)) return;
    await this.assertCanEditScenario(
      comment.scenario.id,
      userId,
      userRole,
      'publish',
    );
  }

  async assertCanViewScenario(
    scenarioId: number,
    userId: number,
    userRole?: string,
  ): Promise<void> {
    await this.accessPolicy.assertCanView(scenarioId, userId, userRole);
  }

  async assertCanEditScenario(
    scenarioId: number,
    userId: number,
    userRole?: string,
    scope: ScenarioEditScope = 'content',
  ): Promise<void> {
    await this.accessPolicy.assertCanEdit(scenarioId, userId, userRole, scope);
  }

  private fullAccessDefaults(): Required<
    Pick<
      ScenarioShare,
      | 'permission'
      | 'role'
      | 'canEditStructure'
      | 'canEditContent'
      | 'canPublish'
    >
  > {
    return {
      permission: 'edit',
      role: 'co_author',
      canEditStructure: true,
      canEditContent: true,
      canPublish: true,
    };
  }

  private async resolveCollaborator(
    dto: CreateScenarioShareDto,
  ): Promise<User> {
    const email = dto.collaboratorEmail?.trim().toLowerCase();
    const user = email
      ? await this.userRepo.findOne({
          where: { email },
          relations: ['role'],
        })
      : dto.sharedWithId
        ? await this.userRepo.findOne({
            where: { id: dto.sharedWithId },
            relations: ['role'],
          })
        : null;

    if (!user) {
      throw new NotFoundException('Collaborateur introuvable.');
    }

    return user;
  }

  private shareSnapshot(share: ScenarioShare): Record<string, unknown> {
    return {
      id: share.id,
      sharedWithId: share.sharedWith?.id,
      permission: share.permission,
      role: share.role,
      canEditStructure: share.canEditStructure,
      canEditContent: share.canEditContent,
      canPublish: share.canPublish,
    };
  }

  private commentSnapshot(comment: ScenarioComment): Record<string, unknown> {
    return {
      id: comment.id,
      targetType: comment.targetType,
      targetId: comment.targetId,
      body: comment.body,
      mentions: comment.mentions,
      status: comment.status,
    };
  }

  private proposalSnapshot(
    proposal: ScenarioChangeProposal,
  ): Record<string, unknown> {
    return {
      id: proposal.id,
      targetType: proposal.targetType,
      targetId: proposal.targetId,
      summary: proposal.summary,
      patch: proposal.patch,
      status: proposal.status,
      decisionNote: proposal.decisionNote,
    };
  }

  private exposeShare(share: ScenarioShare): ScenarioShare {
    if (share.sharedWith) this.sanitizeUser(share.sharedWith);
    if (share.scenario?.user) this.sanitizeUser(share.scenario.user);
    return share;
  }

  private exposeComment(comment: ScenarioComment): ScenarioComment {
    if (comment.author) this.sanitizeUser(comment.author);
    if (comment.scenario?.user) this.sanitizeUser(comment.scenario.user);
    return comment;
  }

  private exposeActivity(activity: ScenarioActivityLog): ScenarioActivityLog {
    if (activity.actor) this.sanitizeUser(activity.actor);
    return activity;
  }

  private exposeProposal(
    proposal: ScenarioChangeProposal,
  ): ScenarioChangeProposal {
    if (proposal.proposer) this.sanitizeUser(proposal.proposer);
    if (proposal.reviewer) this.sanitizeUser(proposal.reviewer);
    if (proposal.scenario?.user) this.sanitizeUser(proposal.scenario.user);
    return proposal;
  }

  private sanitizeUser<T extends User | null | undefined>(user: T): T {
    if (!user) return user;
    const safeUser = user as Omit<User, 'password'> & { password?: string };
    delete safeUser.password;
    return safeUser as T;
  }
}
