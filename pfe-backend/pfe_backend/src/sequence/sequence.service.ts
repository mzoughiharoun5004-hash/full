import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sequence } from './sequence.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { CreateSequenceDto, UpdateSequenceDto } from './dto/sequence.dto';
import { ReorderItemDto } from 'src/common/dto/reorder.dto';
import { ScenarioService } from 'src/scenario/scenario.service';
import { applyReorder } from 'src/common/utils/reorder.util';

@Injectable()
export class SequenceService {
  constructor(
    @InjectRepository(Sequence)
    private readonly sequenceRepo: Repository<Sequence>,
    @InjectRepository(CourseModule)
    private readonly moduleRepo: Repository<CourseModule>,
    private readonly scenarioService: ScenarioService,
  ) {}

  async findAll(): Promise<Sequence[]> {
    return this.sequenceRepo.find({ relations: ['module', 'activites'] });
  }

  async findOne(id: number): Promise<Sequence> {
    const sequence = await this.sequenceRepo.findOne({
      where: { id },
      relations: ['module', 'module.scenario', 'activites', 'activites.quiz'],
    });
    if (!sequence) throw new NotFoundException(`Séquence #${id} introuvable`);
    return sequence;
  }

  async findByModule(moduleId: number): Promise<Sequence[]> {
    return this.sequenceRepo.find({
      where: { module: { id: moduleId } },
      order: { ordre: 'ASC' },
      relations: ['activites'],
    });
  }

  async create(
    dto: CreateSequenceDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Sequence> {
    if (requesterId !== undefined) {
      const module = await this.moduleRepo.findOne({
        where: { id: dto.moduleId },
        relations: ['scenario'],
      });
      if (!module)
        throw new NotFoundException(`Module #${dto.moduleId} introuvable`);
      await this.scenarioService.assertCanEditScenario(
        module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    const ordre =
      dto.ordre ??
      (await this.sequenceRepo.count({
        where: { module: { id: dto.moduleId } },
      }));
    const sequence = this.sequenceRepo.create({
      ...dto,
      ordre,
      module: { id: dto.moduleId },
    });
    return this.sequenceRepo.save(sequence);
  }

  async update(
    id: number,
    dto: UpdateSequenceDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Sequence> {
    if (requesterId !== undefined) {
      const sequence = await this.findOne(id);
      await this.scenarioService.assertCanEditScenario(
        sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.sequenceRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    const sequence = await this.findOne(id);
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.sequenceRepo.remove(sequence);
  }

  async reorderByModule(
    moduleId: number,
    items: ReorderItemDto[],
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Sequence[]> {
    if (requesterId !== undefined) {
      const module = await this.moduleRepo.findOne({
        where: { id: moduleId },
        relations: ['scenario'],
      });
      if (!module)
        throw new NotFoundException(`Module #${moduleId} introuvable`);
      await this.scenarioService.assertCanEditScenario(
        module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await applyReorder(
      this.sequenceRepo,
      Sequence,
      { module: { id: moduleId } },
      items,
      'Une ou plusieurs séquences sont introuvables dans ce module',
    );

    return this.findByModule(moduleId);
  }
}
