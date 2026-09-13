import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from './question.entity';
import { Quiz } from 'src/quiz/quiz.entity';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { ScenarioService } from 'src/scenario/scenario.service';

@Injectable()
export class QuestionService {
  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Quiz)
    private readonly quizRepo: Repository<Quiz>,
    private readonly scenarioService: ScenarioService,
  ) {}

  async findAll(): Promise<Question[]> {
    return this.questionRepo.find({ relations: ['quiz', 'reponses'] });
  }

  async findOne(id: number): Promise<Question> {
    const question = await this.questionRepo.findOne({
      where: { id },
      relations: [
        'quiz',
        'quiz.activite',
        'quiz.activite.sequence',
        'quiz.activite.sequence.module',
        'quiz.activite.sequence.module.scenario',
        'reponses',
      ],
    });
    if (!question) throw new NotFoundException(`Question #${id} introuvable`);
    return question;
  }

  async findByQuiz(quizId: number): Promise<Question[]> {
    return this.questionRepo.find({
      where: { quiz: { id: quizId } },
      order: { ordre: 'ASC' },
      relations: ['reponses'],
    });
  }

  async create(
    dto: CreateQuestionDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Question> {
    if (requesterId !== undefined) {
      const quiz = await this.quizRepo.findOne({
        where: { id: dto.quizId },
        relations: [
          'activite',
          'activite.sequence',
          'activite.sequence.module',
          'activite.sequence.module.scenario',
        ],
      });
      if (!quiz) throw new NotFoundException(`Quiz #${dto.quizId} introuvable`);
      await this.scenarioService.assertCanEditScenario(
        quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    const ordre =
      dto.ordre ??
      (await this.questionRepo.count({
        where: { quiz: { id: dto.quizId } },
      }));
    const question = this.questionRepo.create({
      ...dto,
      ordre,
      quiz: { id: dto.quizId },
    });
    return this.questionRepo.save(question);
  }

  async update(
    id: number,
    dto: UpdateQuestionDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Question> {
    if (requesterId !== undefined) {
      const question = await this.findOne(id);
      await this.scenarioService.assertCanEditScenario(
        question.quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.questionRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    const question = await this.findOne(id);
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        question.quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.questionRepo.remove(question);
  }
}
