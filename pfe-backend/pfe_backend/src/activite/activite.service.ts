import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activite } from './activite.entity';
import { Sequence } from 'src/sequence/sequence.entity';
import { CreateActiviteDto, UpdateActiviteDto } from './dto/activite.dto';
import { ReorderItemDto } from 'src/common/dto/reorder.dto';
import { ScenarioService } from 'src/scenario/scenario.service';
import { applyReorder } from 'src/common/utils/reorder.util';

@Injectable()
export class ActiviteService {
  constructor(
    @InjectRepository(Activite)
    private readonly activiteRepo: Repository<Activite>,
    @InjectRepository(Sequence)
    private readonly sequenceRepo: Repository<Sequence>,
    private readonly scenarioService: ScenarioService,
  ) {}

  async findAll(): Promise<Activite[]> {
    return this.activiteRepo.find({ relations: ['sequence', 'quiz'] });
  }

  async findOne(id: number): Promise<Activite> {
    const activite = await this.activiteRepo.findOne({
      where: { id },
      relations: [
        'sequence',
        'sequence.module',
        'sequence.module.scenario',
        'quiz',
        'quiz.questions',
        'quiz.questions.reponses',
      ],
    });
    if (!activite) throw new NotFoundException(`Activité #${id} introuvable`);
    return activite;
  }

  async findBySequence(sequenceId: number): Promise<Activite[]> {
    return this.activiteRepo.find({
      where: { sequence: { id: sequenceId } },
      order: { ordre: 'ASC' },
      relations: ['quiz'],
    });
  }

  async create(
    dto: CreateActiviteDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Activite> {
    if (requesterId !== undefined) {
      const sequence = await this.sequenceRepo.findOne({
        where: { id: dto.sequenceId },
        relations: ['module', 'module.scenario'],
      });
      if (!sequence)
        throw new NotFoundException(`Séquence #${dto.sequenceId} introuvable`);
      await this.scenarioService.assertCanEditScenario(
        sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    const ordre =
      dto.ordre ??
      (await this.activiteRepo.count({
        where: { sequence: { id: dto.sequenceId } },
      }));
    const activite = this.activiteRepo.create({
      ...dto,
      ordre,
      sequence: { id: dto.sequenceId },
    });
    return this.activiteRepo.save(activite);
  }

  async update(
    id: number,
    dto: UpdateActiviteDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Activite> {
    if (requesterId !== undefined) {
      const activite = await this.findOne(id);
      await this.scenarioService.assertCanEditScenario(
        activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.activiteRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    const activite = await this.findOne(id);
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.activiteRepo.remove(activite);
  }

  async reorderBySequence(
    sequenceId: number,
    items: ReorderItemDto[],
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Activite[]> {
    if (requesterId !== undefined) {
      const sequence = await this.sequenceRepo.findOne({
        where: { id: sequenceId },
        relations: ['module', 'module.scenario'],
      });
      if (!sequence)
        throw new NotFoundException(`Séquence #${sequenceId} introuvable`);
      await this.scenarioService.assertCanEditScenario(
        sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await applyReorder(
      this.activiteRepo,
      Activite,
      { sequence: { id: sequenceId } },
      items,
      'Une ou plusieurs activités sont introuvables dans cette séquence',
    );

    return this.findBySequence(sequenceId);
  }
}
