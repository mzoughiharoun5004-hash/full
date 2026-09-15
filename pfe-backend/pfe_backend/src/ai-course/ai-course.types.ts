import type {
  CourseBlock,
  CourseDocument,
  CourseLesson,
} from 'src/scenario/course-document.types';

export type AiScope =
  | { type: 'course' }
  | { type: 'lesson'; lessonId: string }
  | { type: 'block'; lessonId: string; blockId: string };

export type AiCoursePatch =
  | {
      op: 'replace_block';
      lessonId: string;
      blockId: string;
      block: CourseBlock;
    }
  | {
      op: 'insert_blocks';
      lessonId: string;
      afterBlockId?: string;
      blocks: CourseBlock[];
    }
  | {
      op: 'remove_block';
      lessonId: string;
      blockId: string;
    }
  | { op: 'replace_lesson'; lessonId: string; lesson: CourseLesson }
  | { op: 'insert_lesson'; afterLessonId?: string; lesson: CourseLesson }
  | {
      op: 'update_metadata';
      changes: Pick<
        CourseDocument,
        'title' | 'description' | 'objectives' | 'estimatedMinutes'
      >;
    };

export interface AiCourseProposal {
  summary: string;
  patches: AiCoursePatch[];
}

export interface AiCourseOutline {
  title: string;
  description: string;
  objectives: string[];
  estimatedMinutes: number;
  lessons: Array<{
    title: string;
    summary: string;
    estimatedMinutes: number;
  }>;
}

export interface AiCourseBrief {
  topic: string;
  audience: string;
  language: string;
  difficulty: string;
  objectives: string[];
  estimatedMinutes: number;
  tone?: string;
  sourceMaterial?: string;
}

export interface AiCourseProvider {
  createOutline(brief: AiCourseBrief): Promise<AiCourseOutline>;
  createDraft(brief: AiCourseBrief, outline?: AiCourseOutline): Promise<CourseDocument>;
  proposeEdit(
    instruction: string,
    scope: AiScope,
    document: CourseDocument,
  ): Promise<AiCourseProposal>;
}
