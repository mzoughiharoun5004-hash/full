import type { CourseBlock, CourseLesson, CoursePage } from '@/types'

export function PreviewEmptyMedia({ label }: { label: string }) {
  return <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface)] text-sm text-[var(--lux-muted)]">{label}</div>
}

export function previewLessonToPage(lesson: CourseLesson): CoursePage {
  return {
    id: lesson.id,
    type: lesson.type === 'quiz' ? 'quiz' : 'lesson',
    title: lesson.title,
    summary: lesson.summary,
    coverImageUrl: lesson.coverImageUrl,
    blocks: lesson.blocks,
    quiz: lesson.quiz
        ? {
          passingScore: lesson.quiz.passingScore,
          timeLimitMinutes: lesson.quiz.timeLimitMinutes,
          attempts: lesson.quiz.attempts,
          randomizeQuestions: lesson.quiz.randomizeQuestions,
          randomizeAnswers: lesson.quiz.randomizeAnswers,
          showFeedback: lesson.quiz.showFeedback,
          questions: lesson.quiz.questions,
        }
      : undefined,
    metadata: lesson.metadata,
  }
}

export function isPreviewAutoCompleteBlock(block: CourseBlock) {
  return !['accordion', 'tabs', 'flashcards', 'sorting_activity', 'sorting', 'process_steps', 'continue_button'].includes(block.type)
}

export function previewMetaString(block: CourseBlock, key: string, fallback = '') {
  const value = block.metadata?.[key]
  return typeof value === 'string' ? value : fallback
}

export function previewMetaNumber(block: CourseBlock, key: string, fallback = 0) {
  const value = block.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function previewMetaBoolean(block: CourseBlock, key: string, fallback = false) {
  const value = block.metadata?.[key]
  return typeof value === 'boolean' ? value : fallback
}

export function parsePreviewTable(value: string) {
  return value
    .split('\n')
    .map((row) => row.split(/\t|,/).map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 0)
}

export function parsePreviewNumbers(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}
