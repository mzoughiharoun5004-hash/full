import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CourseModule } from './course-module.entity';
import {
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
} from './dto/course-module.dto';
import { ReorderItemDto } from 'src/common/dto/reorder.dto';
import { ScenarioService } from 'src/scenario/scenario.service';

@Injectable()
export class CourseModuleService {
  constructor(
    @InjectRepository(CourseModule)
    private readonly moduleRepo: Repository<CourseModule>,
    private readonly scenarioService: ScenarioService,
  ) {}

  async findAll(): Promise<CourseModule[]> {
    return this.moduleRepo.find({
      relations: ['scenario', 'sequences', 'ressources'],
    });
  }

  async findOne(id: number): Promise<CourseModule> {
    const module = await this.moduleRepo.findOne({
      where: { id },
      relations: ['scenario', 'sequences', 'sequences.activites', 'ressources'],
    });
    if (!module) throw new NotFoundException(`Module #${id} introuvable`);
    return module;
  }

  async findByScenario(scenarioId: number): Promise<CourseModule[]> {
    return this.moduleRepo.find({
      where: { scenario: { id: scenarioId } },
      order: { ordre: 'ASC' },
      relations: ['sequences'],
    });
  }

  async create(
    dto: CreateCourseModuleDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<CourseModule> {
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        dto.scenarioId,
        requesterId,
        requesterRole,
      );
    }
    const ordre =
      dto.ordre ??
      (await this.moduleRepo.count({
        where: { scenario: { id: dto.scenarioId } },
      }));
    const module = this.moduleRepo.create({
      ...dto,
      ordre,
      scenario: { id: dto.scenarioId },
    });
    return this.moduleRepo.save(module);
  }

  async update(
    id: number,
    dto: UpdateCourseModuleDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<CourseModule> {
    if (requesterId !== undefined) {
      const module = await this.findOne(id);
      await this.scenarioService.assertCanEditScenario(
        module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.moduleRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    const module = await this.findOne(id);
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.moduleRepo.remove(module);
  }

  async reorderByScenario(
    scenarioId: number,
    items: ReorderItemDto[],
    requesterId?: number,
    requesterRole?: string,
  ): Promise<CourseModule[]> {
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        scenarioId,
        requesterId,
        requesterRole,
      );
    }
    if (!items.length) return this.findByScenario(scenarioId);

    const ids = items.map((item) => item.id);
    const modules = await this.moduleRepo.find({
      where: { id: In(ids), scenario: { id: scenarioId } },
      relations: ['scenario'],
    });

    if (modules.length !== ids.length) {
      throw new NotFoundException(
        'Un ou plusieurs modules sont introuvables dans ce scénario',
      );
    }

    await this.moduleRepo.manager.transaction(async (manager) => {
      await Promise.all(
        items.map((item) =>
          manager.update(CourseModule, item.id, { ordre: item.ordre }),
        ),
      );
    });

    return this.findByScenario(scenarioId);
  }

  async getByScenarioWithDetails(scenarioId: number): Promise<{
    modules: CourseModule[];
    totalEstimatedMinutes: number;
    lessonCount: number;
    quizLessonCount: number;
  }> {
    const modules = await this.findByScenario(scenarioId);

    // Get all lessons from sequences and activities
    const allLessons: any[] = [];
    modules.forEach((module) => {
      module.sequences?.forEach((sequence) => {
        sequence.activites?.forEach((activity) => {
          if (activity.quiz) {
            allLessons.push({ quiz: activity.quiz });
          } else {
            allLessons.push({ estimatedMinutes: 5 });
          }
        });
      });
    });

    const quizLessons = allLessons.filter((lesson) => lesson.quiz);
    const contentLessons = allLessons.filter((lesson) => !lesson.quiz);

    const estimatedMinutes = contentLessons.reduce(
      (total, lesson) => total + (lesson.estimatedMinutes ?? 0),
      0,
    );

    return {
      modules,
      totalEstimatedMinutes: estimatedMinutes,
      lessonCount: allLessons.length,
      quizLessonCount: quizLessons.length,
    };
  }
}
