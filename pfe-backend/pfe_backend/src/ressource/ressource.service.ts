import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { TypeRessource } from 'src/common/enums';
import { Ressource } from './ressource.entity';
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

  async findOne(id: number, requesterId?: number): Promise<Ressource> {
    const ressource = await this.ressourceRepo.findOne({
      where: { id },
      relations: ['scenario', 'module', 'uploadedBy'],
    });
    if (!ressource) throw new NotFoundException(`Ressource #${id} introuvable`);
    this.assertOwnerAccess(ressource, requesterId);
    return ressource;
  }

  async findByScenario(scenarioId: number): Promise<Ressource[]> {
    return this.ressourceRepo.find({
      where: { scenario: { id: scenarioId } },
    });
  }

  async findByModule(moduleId: number): Promise<Ressource[]> {
    return this.ressourceRepo.find({
      where: { module: { id: moduleId } },
    });
  }

  async create(
    dto: CreateRessourceDto,
    uploaderId?: number,
  ): Promise<Ressource> {
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
  ): Promise<Ressource> {
    await this.findOne(id, requesterId);
    await this.ressourceRepo.update(id, dto);
    return this.findOne(id, requesterId);
  }

  async remove(id: number, requesterId?: number): Promise<void> {
    const ressource = await this.findOne(id, requesterId);
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

  private assertOwnerAccess(ressource: Ressource, requesterId?: number): void {
    if (!requesterId || !ressource.uploadedBy) return;
    if (Number(ressource.uploadedBy.id) === Number(requesterId)) return;
    throw new ForbiddenException('You do not have access to this media asset.');
  }
}
