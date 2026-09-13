import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz } from './quiz.entity';
import { CreateQuizDto, UpdateQuizDto } from './dto/quiz.dto';
import { Activite } from 'src/activite/activite.entity';
import { ScenarioService } from 'src/scenario/scenario.service';

@Injectable()
export class QuizService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepo: Repository<Quiz>,
    @InjectRepository(Activite)
    private readonly activiteRepo: Repository<Activite>,
    private readonly scenarioService: ScenarioService,
  ) {}

  async findAll(): Promise<Quiz[]> {
    return this.quizRepo.find({ relations: ['questions', 'activite'] });
  }

  async findOne(id: number): Promise<Quiz> {
    const quiz = await this.quizRepo.findOne({
      where: { id },
      relations: [
        'questions',
        'questions.reponses',
        'activite',
        'activite.sequence',
        'activite.sequence.module',
        'activite.sequence.module.scenario',
      ],
    });
    if (!quiz) throw new NotFoundException(`Quiz #${id} introuvable`);
    return quiz;
  }

  async findByActivite(activiteId: number): Promise<Quiz | null> {
    return this.quizRepo.findOne({
      where: { activite: { id: activiteId } },
      relations: ['questions', 'questions.reponses', 'activite'],
    });
  }

  async create(
    dto: CreateQuizDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Quiz> {
    const activite = await this.activiteRepo.findOne({
      where: { id: dto.activiteId },
      relations: [
        'sequence',
        'sequence.module',
        'sequence.module.scenario',
        'quiz',
      ],
    });
    if (!activite)
      throw new NotFoundException(`Activité #${dto.activiteId} introuvable`);
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    if (activite.quiz) {
      // activite.quiz is the owning (FK) side, so reassigning it here would
      // silently detach the existing Quiz row - and its questions/answers -
      // without deleting it, leaving it orphaned in the DB. Require an
      // explicit update or delete of the existing quiz instead.
      throw new ConflictException(
        `L'activité #${dto.activiteId} possède déjà un quiz (#${activite.quiz.id}). Modifiez-le ou supprimez-le avant d'en créer un nouveau.`,
      );
    }

    const quiz = this.quizRepo.create({
      titre: dto.titre,
      description: dto.description,
      tentatives: dto.tentatives,
      scorePourReussir: dto.scorePourReussir,
    });
    const saved = await this.quizRepo.save(quiz);

    activite.quiz = saved;
    await this.activiteRepo.save(activite);
    return saved;
  }

  async update(
    id: number,
    dto: UpdateQuizDto,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<Quiz> {
    if (requesterId !== undefined) {
      const quiz = await this.findOne(id);
      await this.scenarioService.assertCanEditScenario(
        quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.quizRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(
    id: number,
    requesterId?: number,
    requesterRole?: string,
  ): Promise<void> {
    const quiz = await this.findOne(id);
    if (requesterId !== undefined) {
      await this.scenarioService.assertCanEditScenario(
        quiz.activite.sequence.module.scenario.id,
        requesterId,
        requesterRole,
      );
    }
    await this.quizRepo.remove(quiz);
  }
}
