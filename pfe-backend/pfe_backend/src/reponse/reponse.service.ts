import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reponse } from './reponse.entity';
import { Question } from 'src/question/question.entity';
import { CreateReponseDto, UpdateReponseDto } from './dto/reponse.dto';
import { ScenarioService } from 'src/scenario/scenario.service';

@Injectable()
export class ReponseService {
  constructor(
    @InjectRepository(Reponse)
    private readonly reponseRepo: Repository<Reponse>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    private readonly scenarioService: ScenarioService,
  ) {}

  async findAll(): Promise<Reponse[]> {
    return this.reponseRepo.find({ relations: ['question'] });
  }

  async findOne(id: number): Promise<Reponse> {
    const reponse = await this.reponseRepo.findOne({
      where: { id },
      relations: [
        'question',
        'question.quiz',
        'question.quiz.activite',
        'question.quiz.activite.sequence',
        'question.quiz.activite.sequence.module',
        'question.quiz.activite.sequence.module.scenario',
      ],
    });
    if (!reponse) throw new NotFoundException(`Réponse #${id} introuvable`);
    return reponse;
  }

  async findByQuestion(questionId: number): Promise<Reponse[]> {
    return this.reponseRepo.find({
      where: { question: { id: questionId } },
      order: { ordre: 'ASC' },
    });
  }

  async create(
    dto: CreateReponseDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Reponse> {
    if (requesterId !== undefined) {
      const question = await this.questionRepo.findOne({
        where: { id: dto.questionId },
        relations: [
          'quiz',
          'quiz.activite',
          'quiz.activite.sequence',
          'quiz.activite.sequence.module',
          'quiz.activite.sequence.module.scenario',
        ],
      });
      if (!question)
        throw new NotFoundException(`Question #${dto.questionId} introuvable`);
      await this.scenarioService.assertCanEditScenario(
        question.quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    const ordre =
      dto.ordre ??
      (await this.reponseRepo.count({
        where: { question: { id: dto.questionId } },
      }));
    const reponse = this.reponseRepo.create({
      ...dto,
      ordre,
      question: { id: dto.questionId },
    });
    return this.reponseRepo.save(reponse);
  }

  async update(
    id: number,
    dto: UpdateReponseDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Reponse> {
    if (requesterId !== undefined) {
      const reponse = await this.findOne(id);
      await this.scenarioService.assertCanEditScenario(
        reponse.question.quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.reponseRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    const reponse = await this.findOne(id);
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        reponse.question.quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.reponseRepo.remove(reponse);
  }
}
