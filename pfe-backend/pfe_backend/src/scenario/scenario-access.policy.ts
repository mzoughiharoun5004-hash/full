import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Scenario } from './scenario.entity';
import { ScenarioShare } from 'src/scenario-share/scenario-share.entity';
import { isApprovedScenarioStatut, StatutScenario } from 'src/common/enums';

/**
 * Canonical scope values for edit operations.
 *
 * - 'content'   – editing lesson/block content (default for most writes)
 * - 'structure' – adding / removing / reordering modules and sequences
 * - 'publish'   – submit, approve, export lifecycle transitions
 * - 'team'      – managing collaborator shares (owner-only; never shared)
 * - 'any'       – any write capability (content OR structure)
 */
export type ScenarioEditScope =
  | 'content'
  | 'structure'
  | 'publish'
  | 'team'
  | 'any';

@Injectable()
export class ScenarioAccessPolicy {
  constructor(
    @InjectRepository(Scenario)
    private readonly scenarioRepo: Repository<Scenario>,
    @InjectRepository(ScenarioShare)
    private readonly shareRepo: Repository<ScenarioShare>,
  ) {}

  /**
   * Asserts the user can view the scenario.
   * Returns the loaded Scenario entity so callers avoid a second DB round-trip.
   */
  async assertCanView(
    scenarioId: number,
    userId: number,
    userRole?: string,
  ): Promise<Scenario> {
    const scenario = await this.loadScenario(scenarioId);

    if (this.isOwner(scenario, userId)) return scenario;

    const share = await this.findShare(scenarioId, userId);
    if (share) return scenario;

    if (this.isAdmin(userRole)) {
      if (scenario.statut === StatutScenario.BROUILLON) {
        throw new ForbiddenException(
          'Draft scenarios are only visible to their owner.',
        );
      }
      return scenario;
    }

    throw new ForbiddenException("Vous n'avez pas acces a ce scenario.");
  }

  /**
   * Asserts the user can perform a write operation of the given scope.
   * Admin rule: scope==='publish' is allowed (lifecycle ops), all other scopes throw.
   */
  async assertCanEdit(
    scenarioId: number,
    userId: number,
    userRole?: string,
    scope: ScenarioEditScope = 'content',
  ): Promise<Scenario> {
    const scenario = await this.loadScenario(scenarioId);

    if (this.isOwner(scenario, userId)) return scenario;

    const share = await this.findShare(scenarioId, userId);

    if (share) {
      if (!this.shareAllowsScope(share, scope)) {
        throw new ForbiddenException(
          'Vous devez avoir le droit de modification pour cette action.',
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
      if (scope === 'publish') return scenario;
      throw new ForbiddenException(
        'Admins can review scenarios owned by other users, but cannot edit course/team settings.',
      );
    }

    throw new ForbiddenException(
      'Vous devez avoir le droit de modification pour cette action.',
    );
  }

  /**
   * Non-throwing version for WebSocket gateway (socket events must return, not throw).
   */
  async getAccess(
    scenarioId: number,
    userId: number,
    userRole?: string,
  ): Promise<{ canView: boolean; canEdit: boolean }> {
    const scenario = await this.scenarioRepo.findOne({
      where: { id: scenarioId },
      relations: ['user'],
    });

    if (!scenario) return { canView: false, canEdit: false };

    if (this.isOwner(scenario, userId)) return { canView: true, canEdit: true };

    const share = await this.shareRepo.findOne({
      where: {
        scenario: { id: scenarioId },
        sharedWith: { id: userId },
      },
    });

    if (share) {
      if (isApprovedScenarioStatut(scenario.statut)) {
        return { canView: true, canEdit: false };
      }
      const canEdit =
        share.permission === 'edit' ||
        share.canEditContent === true ||
        share.canEditStructure === true;
      return { canView: true, canEdit };
    }

    if (this.isAdmin(userRole)) {
      if (scenario.statut === StatutScenario.BROUILLON) {
        return { canView: false, canEdit: false };
      }
      return { canView: true, canEdit: false };
    }

    return { canView: false, canEdit: false };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async loadScenario(scenarioId: number): Promise<Scenario> {
    const scenario = await this.scenarioRepo.findOne({
      where: { id: scenarioId },
      relations: ['user'],
    });
    if (!scenario) {
      throw new NotFoundException(`Scenario #${scenarioId} introuvable`);
    }
    return scenario;
  }

  private async findShare(
    scenarioId: number,
    userId: number,
  ): Promise<ScenarioShare | null> {
    return this.shareRepo.findOne({
      where: {
        scenario: { id: scenarioId },
        sharedWith: { id: userId },
      },
    });
  }

  private isOwner(scenario: Scenario, userId: number): boolean {
    return Number(scenario.user?.id) === Number(userId);
  }

  private isAdmin(userRole?: string): boolean {
    return userRole?.toLowerCase() === 'admin';
  }

  private shareAllowsScope(
    share: ScenarioShare,
    scope: ScenarioEditScope,
  ): boolean {
    if (scope === 'team') return false;
    if (scope === 'any') {
      return (
        share.permission === 'edit' ||
        share.canEditContent === true ||
        share.canEditStructure === true
      );
    }
    if (scope === 'publish') return share.canPublish === true;
    if (scope === 'structure') {
      return share.permission === 'edit' || share.canEditStructure === true;
    }
    // 'content' default
    return share.permission === 'edit' || share.canEditContent === true;
  }
}
