import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenarioService } from 'src/scenario/scenario.service';
import type { CourseDocument } from 'src/scenario/course-document.types';
import { AiChangeSet } from './ai-change-set.entity';
import type { AiCourseBrief, AiCourseOutline, AiCourseProposal, AiScope } from './ai-course.types';
import { GroqCourseProvider } from './groq-course.provider';

@Injectable()
export class AiCourseService {
  constructor(
    private readonly scenarioService: ScenarioService,
    private readonly provider: GroqCourseProvider,
    @InjectRepository(AiChangeSet)
    private readonly changeSetRepo: Repository<AiChangeSet>,
  ) {}

  createOutline(brief: AiCourseBrief): Promise<AiCourseOutline> {
    return this.provider.createOutline(brief);
  }

  async createCourse(brief: AiCourseBrief, userId: number, outline?: AiCourseOutline) {
    const courseDocument = await this.provider.createDraft(brief, outline);
    courseDocument.metadata = {
      ...courseDocument.metadata,
      version: 1,
    };
    const scenario = await this.scenarioService.create(
      {
        titre: courseDocument.title,
        description: courseDocument.description,
        objectif: courseDocument.objectives[0],
        dureeScenario: courseDocument.estimatedMinutes,
        niveau: brief.difficulty,
        courseDocument,
      },
      userId,
    );
    await this.changeSetRepo.save(this.changeSetRepo.create({
      status: 'applied', kind: 'creation', instruction: brief.topic,
      courseDocumentVersion: scenario.courseDocumentVersion,
      proposal: { courseDocument }, metadata: { provider: 'groq', model: 'openai/gpt-oss-20b' },
      failureReason: null, scenario: { id: scenario.id }, requestedBy: { id: userId },
    }));
    return scenario;
  }

  async proposeEdit(
    scenarioId: number,
    userId: number,
    userRole: string | undefined,
    instruction: string,
    scope: AiScope,
    document: CourseDocument,
    expectedVersion: number,
  ): Promise<AiChangeSet> {
    const scenario = await this.scenarioService.assertCanEditScenario(scenarioId, userId, userRole, 'content');
    const currentVersion = scenario.courseDocumentVersion ?? 1;
    if (currentVersion !== expectedVersion) throw new ConflictException('This course changed after you opened it. Reload before asking AI to edit it.');
    if (!document || document.id !== scenario.courseDocument?.id) {
      throw new BadRequestException('The supplied course document does not match the saved scenario.');
    }
    // The request document is only a client-side freshness signal. Always
    // build provider context from the server copy so a browser cannot steer a
    // later patch with content that was never saved to this scenario.
    const proposal = await this.provider.proposeEdit(
      instruction.trim(),
      scope,
      scenario.courseDocument as CourseDocument,
    );
    return this.changeSetRepo.save(this.changeSetRepo.create({
      status: 'proposed', kind: 'edit', instruction: instruction.trim(), courseDocumentVersion: currentVersion,
      proposal: proposal as unknown as Record<string, unknown>, metadata: { scope, provider: 'groq', model: 'openai/gpt-oss-20b' },
      failureReason: null, scenario: { id: scenarioId }, requestedBy: { id: userId },
    }));
  }

  async getChangeSet(id: string, userId: number, userRole?: string): Promise<AiChangeSet> {
    const changeSet = await this.changeSetRepo.findOne({ where: { id }, relations: ['scenario', 'requestedBy'] });
    if (!changeSet) throw new NotFoundException('AI change set not found.');
    await this.scenarioService.assertCanEditScenario(changeSet.scenario.id, userId, userRole, 'content');
    return changeSet;
  }

  async apply(id: string, userId: number, userRole?: string): Promise<CourseDocument> {
    const changeSet = await this.getChangeSet(id, userId, userRole);
    if (changeSet.status !== 'proposed') throw new BadRequestException('Only a proposed AI change can be applied.');
    const scenario = await this.scenarioService.assertCanEditScenario(changeSet.scenario.id, userId, userRole, 'content');
    if (scenario.courseDocumentVersion !== changeSet.courseDocumentVersion) throw new ConflictException('This course changed after the AI proposal was created. Generate a new proposal.');
    const proposal = changeSet.proposal as unknown as AiCourseProposal;
    const nextDocument = applyProposal(scenario.courseDocument as CourseDocument, proposal);
    const saved = await this.scenarioService.updateCourseDocument(scenario.id, nextDocument, userId, userRole, changeSet.courseDocumentVersion);
    changeSet.status = 'applied';
    await this.changeSetRepo.save(changeSet);
    return saved.courseDocument as CourseDocument;
  }

  async setStatus(id: string, userId: number, userRole: string | undefined, status: 'rejected' | 'cancelled'): Promise<AiChangeSet> {
    const changeSet = await this.getChangeSet(id, userId, userRole);
    if (changeSet.status !== 'proposed') throw new BadRequestException('Only a proposed AI change can be dismissed.');
    changeSet.status = status;
    return this.changeSetRepo.save(changeSet);
  }
}

function applyProposal(document: CourseDocument, proposal: AiCourseProposal): CourseDocument {
  let next: CourseDocument = structuredClone(document);
  for (const patch of proposal.patches) {
    if (patch.op === 'update_metadata') {
      next = { ...next, ...patch.changes };
      continue;
    }
    if (patch.op === 'insert_lesson') {
      const lessons = next.lessons ?? [];
      const afterIndex = patch.afterLessonId
        ? lessons.findIndex((lesson) => lesson.id === patch.afterLessonId)
        : lessons.length - 1;
      if (afterIndex < -1) {
        throw new BadRequestException(
          'The AI proposal lesson insertion point no longer exists.',
        );
      }
      lessons.splice(afterIndex + 1, 0, patch.lesson);
      next = { ...next, lessons };
      continue;
    }
    const lessons = next.lessons ?? [];
    const lessonIndex = lessons.findIndex((lesson) => lesson.id === patch.lessonId);
    if (lessonIndex < 0) throw new BadRequestException('The AI proposal references content that no longer exists.');
    if (patch.op === 'replace_lesson') {
      lessons[lessonIndex] = patch.lesson;
      next = { ...next, lessons };
      continue;
    }
    const lesson = lessons[lessonIndex];
    if (patch.op === 'replace_block') {
      const index = lesson.blocks.findIndex((block) => block.id === patch.blockId);
      if (index < 0) throw new BadRequestException('The AI proposal references a block that no longer exists.');
      lesson.blocks[index] = patch.block;
    } else if (patch.op === 'remove_block') {
      const index = lesson.blocks.findIndex((block) => block.id === patch.blockId);
      if (index >= 0) {
        lesson.blocks.splice(index, 1);
      }
    } else if (patch.op === 'insert_blocks') {
      const afterIndex = patch.afterBlockId ? lesson.blocks.findIndex((block) => block.id === patch.afterBlockId) : lesson.blocks.length - 1;
      if (afterIndex < -1) throw new BadRequestException('The AI proposal insertion point no longer exists.');
      lesson.blocks.splice(afterIndex + 1, 0, ...patch.blocks);
    }
    lessons[lessonIndex] = lesson;
    next = { ...next, lessons };
  }

  if (next.sections?.length && next.lessons?.length) {
    const allLessonIds = next.lessons.map((l) => l.id);
    const assignedIds = new Set(next.sections.flatMap((s) => s.lessonIds ?? []));
    const missing = allLessonIds.filter((id) => !assignedIds.has(id));
    if (missing.length) {
      next.sections[0].lessonIds = [...(next.sections[0].lessonIds ?? []), ...missing];
    }
  }

  if (next.lessons?.length) {
    next.pages = next.lessons.map((lesson) => ({
      id: lesson.id,
      type: lesson.type ?? 'lesson',
      title: lesson.title,
      summary: lesson.summary,
      blocks: lesson.blocks,
      quiz: lesson.quiz ? {
        passingScore: lesson.quiz.passingScore,
        timeLimitMinutes: lesson.quiz.timeLimitMinutes,
        questions: lesson.quiz.questions,
        attempts: lesson.quiz.attempts,
        randomizeQuestions: lesson.quiz.randomizeQuestions,
        randomizeAnswers: lesson.quiz.randomizeAnswers,
        showFeedback: lesson.quiz.showFeedback,
      } : undefined,
    }));
  }

  return next;
}
