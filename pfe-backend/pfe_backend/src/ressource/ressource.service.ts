import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { TypeRessource } from 'src/common/enums';
import { Ressource } from './ressource.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { ScenarioAccessPolicy } from 'src/scenario/scenario-access.policy';
import { CreateRessourceDto, UpdateRessourceDto } from './dto/ressource.dto';

interface RessourceFilters {
  type?: string;
  search?: string;
  uploaderId?: number;
}

@Injectable()
export class RessourceService {
  constructor(
    @InjectRepository(Ressource)
    private readonly ressourceRepo: Repository<Ressource>,
    @Optional()
    @InjectRepository(CourseModule)
    private readonly moduleRepo?: Repository<CourseModule>,
    @Optional()
    private readonly accessPolicy?: ScenarioAccessPolicy,
  ) {}

  async findAll(filters: RessourceFilters = {}): Promise<Ressource[]> {
    const type = this.normalizeTypeFilter(filters.type);
    const search = filters.search?.trim();
    const baseWhere: FindOptionsWhere<Ressource> = {
      ...(type ? { type } : {}),
      ...(filters.uploaderId ? { uploadedBy: { id: filters.uploaderId } } : {}),
    };
    const where: FindOptionsWhere<Ressource>[] | FindOptionsWhere<Ressource> =
      search
        ? [
            { ...baseWhere, titre: ILike(`%${search}%`) },
            { ...baseWhere, description: ILike(`%${search}%`) },
          ]
        : baseWhere;

    return this.ressourceRepo.find({
      where,
      relations: ['scenario', 'module', 'uploadedBy'],
      order: { id: 'DESC' },
    });
  }

  async findOne(
    id: number,
    requesterId?: number,
    userRole?: string,
  ): Promise<Ressource> {
    const ressource = await this.ressourceRepo.findOne({
      where: { id },
      relations: ['scenario', 'module', 'uploadedBy'],
    });
    if (!ressource) throw new NotFoundException(`Ressource #${id} introuvable`);
    await this.assertResourceAccess(ressource, requesterId, userRole, 'view');
    return ressource;
  }

  async findByScenario(
    scenarioId: number,
    requesterId?: number,
    userRole?: string,
    filters: { type?: string; search?: string } = {},
  ): Promise<Ressource[]> {
    if (this.accessPolicy && requesterId) {
      await this.accessPolicy.assertCanView(scenarioId, requesterId, userRole);
    }
    const type = this.normalizeTypeFilter(filters.type);
    const search = filters.search?.trim();
    const baseWhere: FindOptionsWhere<Ressource> = {
      scenario: { id: scenarioId },
      ...(type ? { type } : {}),
    };
    const where: FindOptionsWhere<Ressource>[] | FindOptionsWhere<Ressource> =
      search
        ? [
            { ...baseWhere, titre: ILike(`%${search}%`) },
            { ...baseWhere, description: ILike(`%${search}%`) },
          ]
        : baseWhere;

    return this.ressourceRepo.find({
      where,
      relations: ['scenario', 'module', 'uploadedBy'],
      order: { id: 'DESC' },
    });
  }

  async findByModule(
    moduleId: number,
    requesterId?: number,
    userRole?: string,
  ): Promise<Ressource[]> {
    if (this.accessPolicy && requesterId && this.moduleRepo) {
      const module = await this.moduleRepo.findOne({
        where: { id: moduleId },
        relations: ['scenario'],
      });
      if (!module) {
        throw new NotFoundException(`Module #${moduleId} introuvable`);
      }
      if (module.scenario) {
        await this.accessPolicy.assertCanView(
          module.scenario.id,
          requesterId,
          userRole,
        );
      }
    }
    return this.ressourceRepo.find({
      where: { module: { id: moduleId } },
      relations: ['scenario', 'module', 'uploadedBy'],
      order: { id: 'DESC' },
    });
  }

  async create(
    dto: CreateRessourceDto,
    uploaderId?: number,
    userRole?: string,
  ): Promise<Ressource> {
    if (this.accessPolicy && uploaderId && dto.scenarioId) {
      await this.accessPolicy.assertCanEdit(
        dto.scenarioId,
        uploaderId,
        userRole,
        'content',
      );
    }
    const ressource = this.ressourceRepo.create({
      ...dto,
      scenario: dto.scenarioId ? { id: dto.scenarioId } : undefined,
      module: dto.moduleId ? { id: dto.moduleId } : undefined,
      uploadedBy: uploaderId ? { id: uploaderId } : null,
    });
    return this.ressourceRepo.save(ressource);
  }

  async update(
    id: number,
    dto: UpdateRessourceDto,
    requesterId?: number,
    userRole?: string,
  ): Promise<Ressource> {
    const ressource = await this.findOne(id, requesterId, userRole);
    await this.assertResourceAccess(ressource, requesterId, userRole, 'edit');
    await this.ressourceRepo.update(id, dto);
    return this.findOne(id, requesterId, userRole);
  }

  async remove(
    id: number,
    requesterId?: number,
    userRole?: string,
  ): Promise<void> {
    const ressource = await this.findOne(id, requesterId, userRole);
    await this.assertResourceAccess(ressource, requesterId, userRole, 'edit');
    await this.ressourceRepo.remove(ressource);
  }

  private normalizeTypeFilter(type?: string): TypeRessource | undefined {
    if (!type || type === 'ALL') return undefined;

    const normalized = type.toLowerCase();
    const typeMap: Record<string, TypeRessource> = {
      image: TypeRessource.MASS,
      mass: TypeRessource.MASS,
      video: TypeRessource.VIDEO,
      audio: TypeRessource.AUDIO,
      document: TypeRessource.DOCUMENT,
      discussion: TypeRessource.DISCUSSION,
    };

    return typeMap[normalized];
  }

  private async assertResourceAccess(
    ressource: Ressource,
    requesterId?: number,
    userRole?: string,
    scope: 'view' | 'edit' = 'view',
  ): Promise<void> {
    if (!requesterId) return;
    if (
      ressource.uploadedBy &&
      Number(ressource.uploadedBy.id) === Number(requesterId)
    ) {
      return;
    }
    if (ressource.scenario && this.accessPolicy) {
      if (scope === 'view') {
        await this.accessPolicy.assertCanView(
          ressource.scenario.id,
          requesterId,
          userRole,
        );
        return;
      } else {
        await this.accessPolicy.assertCanEdit(
          ressource.scenario.id,
          requesterId,
          userRole,
          'content',
        );
        return;
      }
    }
    if (!ressource.uploadedBy && scope === 'view') {
      return;
    }
    throw new ForbiddenException('You do not have access to this media asset.');
  }
}
