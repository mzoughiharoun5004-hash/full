import {
  AlignLeft,
  AudioLines,
  BadgeHelp,
  BarChart3,
  BookOpen,
  Bot,
  CheckSquare,
  ChevronRight,
  CircleDot,
  Columns3,
  Download,
  FileText,
  Flag,
  GitBranch,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Link2,
  ListChecks,
  MessageCircle,
  MessageSquare,
  MousePointer2,
  PanelTop,
  Quote,
  RefreshCcw,
  Rows3,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Star,
  Table2,
  Target,
  TextCursorInput,
  Timer,
  Trophy,
  Type,
  Video,
} from 'lucide-react'
import type { ElementType } from 'react'
import type {
  CourseBlock,
  CourseBlockCategory,
  CourseBlockType,
  CourseDocument,
  CourseInteractionItem,
  CourseLesson,
  CoursePage,
  CoursePublishSettings,
  CourseQuizQuestion,
  CourseQuizQuestionOption,
  CourseSection,
  CourseQuizQuestionType,
  CourseTheme,
} from '@/types'

export type CourseFormat = 'Linear' | 'Branching' | 'Hybrid' | 'Assessment-Only'
export type EditorView = 'structure' | 'lesson'
export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict'

export interface CourseFormatDefinition {
  label: CourseFormat
  description: string
  guidance: string
  requiresBranching: boolean
  assessmentOnly: boolean
}

export interface BlockDefinition {
  type: CourseBlockType
  category: CourseBlockCategory
  categoryLabel: string
  label: string
  description: string
  icon: ElementType
  questionOnly?: boolean
}

export interface ScormSettings {
  version: 'scorm_1_2' | 'scorm_2004_3rd' | 'xapi'
  completionTrigger: 'viewed_all' | 'passed_assessment' | 'completion_page' | 'custom'
  customCondition: string
  passingScore: number
  maxScore: number
  courseIdentifier: string
  lmsTitle: string
  lmsDescription: string
  language: string
  launchBehavior: 'new_window' | 'same_window'
  masteryScore: number
}

export interface CourseReadinessIssue {
  id: string
  severity: 'error' | 'warning'
  message: string
  lessonId?: string
}

export interface CourseReadiness {
  issues: CourseReadinessIssue[]
  errors: CourseReadinessIssue[]
  warnings: CourseReadinessIssue[]
  completedChecks: number
  totalChecks: number
  percent: number
  ready: boolean
}

export const quizQuestionTypes = [
  'multiple_choice',
  'multiple_response',
  'fill_blank',
  'matching',
] as const

export type CanonicalQuizQuestionType = (typeof quizQuestionTypes)[number]

export const quizQuestionLabels: Record<CanonicalQuizQuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  multiple_response: 'Multiple Response',
  fill_blank: 'Fill in the Blank',
  matching: 'Matching',
}

export const quizQuestionDescriptions: Record<CanonicalQuizQuestionType, string> = {
  multiple_choice: 'One correct answer from a list of options.',
  multiple_response: 'More than one option can be marked correct.',
  fill_blank: 'Typed answer checked against accepted responses.',
  matching: 'Match prompts with their correct pair.',
}

const categoryLabels: Record<CourseBlockCategory, string> = {
  text: 'Text & Narrative',
  text_narrative: 'Text & Narrative',
  statement: 'Text & Narrative',
  list: 'Text & Narrative',
  media: 'Media',
  dialogue_characters: 'Dialogue & Characters',
  questions: 'Questions & Assessments',
  knowledge_check: 'Questions & Assessments',
  branching_decision: 'Branching & Decision',
  interactive: 'Interactive & Engagement',
  interactive_engagement: 'Interactive & Engagement',
  data_reference: 'Data & Reference',
  navigation_completion: 'Navigation & Completion',
  chart: 'Data & Reference',
  divider: 'Text & Narrative',
  rating_slider: 'Interactive & Engagement',
  likert: 'Interactive & Engagement',
  hotspot: 'Interactive & Engagement',
  short_answer: 'Questions & Assessments',
  ordering: 'Interactive & Engagement',
  matching_pairs: 'Questions & Assessments',
}

export const blockCatalog: BlockDefinition[] = [
  { type: 'text', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Text', description: 'Rich-text paragraph with lists and links.', icon: AlignLeft },
  { type: 'heading', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Heading', description: 'Display heading with optional subtitle.', icon: Type },
  { type: 'callout', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Callout', description: 'Highlighted info, warning, tip, or note.', icon: BadgeHelp },
  { type: 'statement', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Statement', description: 'High-impact takeaway text without headings.', icon: MessageCircle },
  { type: 'quote', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Quote', description: 'Pull-quote with attribution.', icon: Quote },
  { type: 'list', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Bullet List', description: 'Simple vertical bullet list.', icon: ListChecks },
  { type: 'numbered_list', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Numbered List', description: 'Ordered list with large styled numbers.', icon: ListChecks },
  { type: 'divider', category: 'text_narrative', categoryLabel: 'Text & Narrative', label: 'Divider', description: 'Horizontal separator with optional label.', icon: GripVertical },

  { type: 'image', category: 'media', categoryLabel: 'Media', label: 'Image', description: 'Single image with caption and alt text.', icon: ImageIcon },
  { type: 'image_gallery', category: 'media', categoryLabel: 'Media', label: 'Image Gallery', description: 'Grid or carousel of images.', icon: Columns3 },
  { type: 'video', category: 'media', categoryLabel: 'Media', label: 'Video', description: 'Upload MP4 media.', icon: Video },
  { type: 'audio', category: 'media', categoryLabel: 'Media', label: 'Audio', description: 'Audio player with optional transcript.', icon: AudioLines },

  { type: 'dialogue', category: 'dialogue_characters', categoryLabel: 'Dialogue & Characters', label: 'Dialogue', description: 'Multi-turn conversation with characters.', icon: MessageSquare },
  { type: 'character_monologue', category: 'dialogue_characters', categoryLabel: 'Dialogue & Characters', label: 'Character Monologue', description: 'Single character speaking to the learner.', icon: MessageCircle },
  { type: 'branching_dialogue', category: 'dialogue_characters', categoryLabel: 'Dialogue & Characters', label: 'Branching Dialogue', description: 'Conversation with learner choices.', icon: GitBranch },

  { type: 'multiple_choice', category: 'questions', categoryLabel: 'Questions & Assessments', label: quizQuestionLabels.multiple_choice, description: quizQuestionDescriptions.multiple_choice, icon: CircleDot, questionOnly: true },
  { type: 'multiple_select', category: 'questions', categoryLabel: 'Questions & Assessments', label: quizQuestionLabels.multiple_response, description: quizQuestionDescriptions.multiple_response, icon: CheckSquare, questionOnly: true },
  { type: 'fill_blank', category: 'questions', categoryLabel: 'Questions & Assessments', label: 'Fill in the Blank', description: 'Typed blank inside a sentence.', icon: TextCursorInput, questionOnly: true },
  { type: 'matching', category: 'questions', categoryLabel: 'Questions & Assessments', label: quizQuestionLabels.matching, description: quizQuestionDescriptions.matching, icon: Columns3, questionOnly: true },

  { type: 'choice_point', category: 'branching_decision', categoryLabel: 'Branching & Decision', label: 'Choice Point', description: 'Options that lead to different lessons.', icon: GitBranch },
  { type: 'consequence', category: 'branching_decision', categoryLabel: 'Branching & Decision', label: 'Consequence', description: 'Result shown after a choice.', icon: ChevronRight },
  { type: 'decision_recap', category: 'branching_decision', categoryLabel: 'Branching & Decision', label: 'Decision Recap', description: 'Summary of choices made.', icon: FileText },
  { type: 'branch_merge', category: 'branching_decision', categoryLabel: 'Branching & Decision', label: 'Branch Merge', description: 'Internal marker for converging paths.', icon: GitBranch },
  { type: 'conditional_gate', category: 'branching_decision', categoryLabel: 'Branching & Decision', label: 'Conditional Gate', description: 'Content locked until a condition is met.', icon: Flag },

  { type: 'accordion', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Accordion', description: 'Expandable stacked panels.', icon: Layers },
  { type: 'tabs', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Tabs', description: 'Horizontal tabbed panels.', icon: PanelTop },
  { type: 'flashcards', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Flashcards', description: 'Flip-card pairs.', icon: BookOpen },
  { type: 'timeline', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Timeline', description: 'Chronological event display.', icon: Timer },
  { type: 'checklist', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Checklist', description: 'Interactive checkbox list.', icon: CheckSquare },
  { type: 'reveal', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Reveal', description: 'Hidden content behind a trigger.', icon: MousePointer2 },
  { type: 'sorting_activity', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Sorting Activity', description: 'Drag items into categories.', icon: Rows3 },
  { type: 'before_after', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Before/After Slider', description: 'Two images with draggable divider.', icon: SplitSquareHorizontal },
  { type: 'process_steps', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Process Steps', description: 'Sequential expandable steps.', icon: ListChecks },

  { type: 'table', category: 'data_reference', categoryLabel: 'Data & Reference', label: 'Table', description: 'Editable data table with headers.', icon: Table2 },
  { type: 'chart', category: 'data_reference', categoryLabel: 'Data & Reference', label: 'Chart', description: 'Bar, line, or pie chart from data.', icon: BarChart3 },
  { type: 'resource_link', category: 'data_reference', categoryLabel: 'Data & Reference', label: 'Resource Link', description: 'Styled card with title, description, URL.', icon: Link2 },
  { type: 'file_download', category: 'data_reference', categoryLabel: 'Data & Reference', label: 'File Download', description: 'Downloadable file attachment.', icon: Download },
  { type: 'glossary', category: 'data_reference', categoryLabel: 'Data & Reference', label: 'Glossary Term', description: 'Highlighted word with definition pop-up.', icon: Bot },

  { type: 'continue_button', category: 'navigation_completion', categoryLabel: 'Navigation & Completion', label: 'Continue Button', description: 'Explicit proceed button.', icon: ChevronRight },
  { type: 'lesson_summary', category: 'navigation_completion', categoryLabel: 'Navigation & Completion', label: 'Lesson Summary', description: 'Key points recap.', icon: FileText },
  { type: 'score_summary', category: 'navigation_completion', categoryLabel: 'Navigation & Completion', label: 'Score Summary', description: 'Score and pass/fail status.', icon: Trophy },
  { type: 'certificate', category: 'navigation_completion', categoryLabel: 'Navigation & Completion', label: 'Certificate', description: 'Completion certificate.', icon: Star },
  { type: 'completion_message', category: 'navigation_completion', categoryLabel: 'Navigation & Completion', label: 'Completion Message', description: 'Custom end-of-course message.', icon: Flag },
  { type: 'restart_button', category: 'navigation_completion', categoryLabel: 'Navigation & Completion', label: 'Restart Button', description: 'Restart current lesson or whole course.', icon: RefreshCcw },

  // Enhanced block types
  { type: 'rating_slider', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Rating Slider', description: 'Interactive rating slider component.', icon: SlidersHorizontal },
  { type: 'likert', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Likert Scale', description: 'Agreement scale from disagree to agree.', icon: Star },
  { type: 'hotspot', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Hotspot', description: 'Clickable area on an image.', icon: Target },
  { type: 'short_answer', category: 'questions', categoryLabel: 'Questions & Assessments', label: 'Short Answer', description: 'Open-ended short answer question.', icon: TextCursorInput },
  { type: 'ordering', category: 'interactive_engagement', categoryLabel: 'Interactive & Engagement', label: 'Ordering', description: 'Drag and drop to reorder items.', icon: Rows3 },
  { type: 'matching_pairs', category: 'questions', categoryLabel: 'Questions & Assessments', label: 'Matching Pairs', description: 'Match items from two lists.', icon: Columns3 },
  { type: 'branching_scenario', category: 'branching_decision', categoryLabel: 'Branching & Decision', label: 'Branching Scenario', description: 'Full branching scenario with nodes and choices.', icon: GitBranch },
]

export const blockCategories = Array.from(new Set(blockCatalog.map((block) => block.categoryLabel)))

export const courseFormatDefinitions: Record<CourseFormat, CourseFormatDefinition> = {
  Linear: {
    label: 'Linear',
    description: 'A guided sequence of lessons that learners complete in order.',
    guidance: 'Build content lessons, optionally followed by a knowledge check or final quiz.',
    requiresBranching: false,
    assessmentOnly: false,
  },
  Branching: {
    label: 'Branching',
    description: 'A decision-led experience where learner choices route to different course items.',
    guidance: 'Add at least one choice point with two or more linked destinations.',
    requiresBranching: true,
    assessmentOnly: false,
  },
  Hybrid: {
    label: 'Hybrid',
    description: 'A linear learning path with one or more decision-based moments.',
    guidance: 'Include completed content lessons and at least one choice point with linked destinations.',
    requiresBranching: true,
    assessmentOnly: false,
  },
  'Assessment-Only': {
    label: 'Assessment-Only',
    description: 'A scored assessment without instructional content lessons.',
    guidance: 'Use quiz items only and require a passing score before completion.',
    requiresBranching: false,
    assessmentOnly: true,
  },
}

export const formatOptions: CourseFormat[] = Object.keys(courseFormatDefinitions) as CourseFormat[]

export const branchingDecisionBlockTypes: CourseBlockType[] = ['choice_point', 'branching_dialogue']

export function normalizeCourseFormat(value: unknown): CourseFormat {
  return typeof value === 'string' && value in courseFormatDefinitions
    ? value as CourseFormat
    : 'Linear'
}

export function getCourseFormat(document: Pick<CourseDocument, 'metadata'>): CourseFormat {
  return normalizeCourseFormat(document.metadata?.format)
}

/**
 * Applies a format's safe defaults without deleting or converting existing
 * lessons. Readiness then identifies any remaining authoring work.
 */
const defaultTheme: CourseTheme = {
  accentColor: '#0F6B4A',
  fontPairing: 'modern',
  coverLayout: 'centered',
  navigationMode: 'continuous',
  lessonNumbers: true,
  sidebarEnabled: true,
}

/**
 * Applies a format's safe defaults without deleting or converting existing
 * lessons. Readiness then identifies any remaining authoring work.
 */
export function applyCourseFormat(document: CourseDocument, format: CourseFormat): CourseDocument {
  const normalizedFormat = normalizeCourseFormat(format)
  const formatDefaults = normalizedFormat === 'Assessment-Only'
    ? {
        settings: { completionMode: 'score' as const, requireQuizPass: true },
        theme: { navigationMode: 'compact' as const, sidebarEnabled: true },
      }
    : normalizedFormat === 'Branching'
      ? {
          settings: { completionMode: 'pages' as const, requireQuizPass: false },
          theme: { navigationMode: 'compact' as const, sidebarEnabled: true },
        }
      : normalizedFormat === 'Hybrid'
        ? {
            settings: { completionMode: 'pages' as const, requireQuizPass: false },
            theme: { navigationMode: 'sidebar' as const, sidebarEnabled: true },
          }
        : {
            settings: { completionMode: 'pages' as const, requireQuizPass: false },
            theme: { navigationMode: 'continuous' as const, sidebarEnabled: true },
          }

  return syncCourseDocument({
    ...document,
    settings: { ...document.settings, ...formatDefaults.settings },
    theme: { ...defaultTheme, ...document.theme, ...formatDefaults.theme },
    metadata: { ...document.metadata, format: normalizedFormat },
  })
}

const defaultPublish: CoursePublishSettings = {
  target: 'lms',
  lmsStandard: 'scorm_1_2',
  tracking: 'completion_and_score',
  completionPercentage: 100,
  passingScore: 80,
  reportingStatus: 'completed_passed',
}

let uidFallbackCounter = 0

export function uid(prefix: string) {
  // `randomUUID` is available in supported browsers and current Node runtimes.
  // Keep a deterministic fallback for unusual non-WebCrypto test environments
  // without falling back to a collision-prone Math.random identifier.
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}-${uuid ?? `${Date.now()}-${++uidFallbackCounter}`}`
}

export function authorNameFrom(user?: { firstName?: string; lastName?: string; email?: string } | null) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return name || user?.email || 'Author'
}

export function getBlockDefinition(type: CourseBlockType) {
  return blockCatalog.find((block) => block.type === type) ?? blockCatalog[0]
}

export function isQuestionBlock(type: CourseBlockType) {
  return blockCatalog.some((block) => block.type === type && block.questionOnly)
}

export function normalizeQuizQuestionType(type: unknown): CanonicalQuizQuestionType {
  if (type === 'multiple_response' || type === 'multiple_select') return 'multiple_response'
  if (type === 'fill_blank' || type === 'matching') return type
  return 'multiple_choice'
}

export function createQuizQuestion(type: CanonicalQuizQuestionType = 'multiple_choice'): CourseQuizQuestion {
  const base = {
    id: uid('question'),
    type: type as CourseQuizQuestionType,
    text: '',
    imageUrl: '',
    points: 1,
    options: [] as CourseQuizQuestion['options'],
    feedbackMode: 'any_response' as const,
    feedback: '',
    correctFeedback: '',
    incorrectFeedback: '',
    caseSensitive: false,
  }

  if (type === 'fill_blank') {
    return {
      ...base,
      options: [{ id: uid('answer'), text: '', isCorrect: true }],
    }
  }

  if (type === 'matching') {
    return {
      ...base,
      options: [
        { id: uid('match'), text: '', match: '', isCorrect: true },
        { id: uid('match'), text: '', match: '', isCorrect: true },
      ],
    }
  }

  return {
    ...base,
    options: [
      { id: uid('option'), text: '', isCorrect: true },
      { id: uid('option'), text: '', isCorrect: false },
    ],
  }
}

export function normalizeQuizQuestion(question: CourseQuizQuestion): CourseQuizQuestion {
  const type = normalizeQuizQuestionType(question.type)
  const options = (question.options ?? []).map((option) => {
    const legacyOption = option as CourseQuizQuestionOption & { placeholder?: string }

    return {
      ...option,
      id: option.id || uid(type === 'matching' ? 'match' : type === 'fill_blank' ? 'answer' : 'option'),
      text: option.text ?? legacyOption.placeholder ?? '',
      isCorrect: type === 'fill_blank' || type === 'matching' ? true : Boolean(option.isCorrect),
    }
  })
  const fallback = createQuizQuestion(type)
  const normalizedOptions = options.length ? options : fallback.options

  return {
    ...question,
    id: question.id || uid('question'),
    type,
    text: question.text === 'Enter a question title here...' ? '' : question.text ?? '',
    imageUrl: typeof question.imageUrl === 'string' ? question.imageUrl : '',
    points: Number.isFinite(Number(question.points)) ? Number(question.points) : 1,
    options: normalizedOptions,
    feedbackMode: question.feedbackMode === 'correct_incorrect' ? 'correct_incorrect' : 'any_response',
    feedback: question.feedback ?? '',
    correctFeedback: question.correctFeedback ?? '',
    incorrectFeedback: question.incorrectFeedback ?? '',
    caseSensitive: Boolean(question.caseSensitive),
  }
}

export function quizQuestionsFromBlocks(blocks: CourseBlock[] = []): CourseQuizQuestion[] {
  return blocks
    .filter((block) => ['multiple_choice', 'multiple_select', 'multiple_response', 'fill_blank', 'matching'].includes(block.type))
    .map((block) => {
      const type = normalizeQuizQuestionType(block.type === 'multiple_select' ? 'multiple_response' : block.type)
      const metadata = block.metadata ?? {}
      const items = block.items ?? []
      const question = createQuizQuestion(type)

      if (type === 'fill_blank') {
        const acceptedAnswers = typeof metadata.acceptedAnswers === 'string'
          ? metadata.acceptedAnswers
              .split(/\n|,/)
              .map((answer) => answer.trim())
              .filter(Boolean)
          : []
        return normalizeQuizQuestion({
          ...question,
          id: block.id,
          text: block.title || block.content || question.text,
          points: Number(metadata.points ?? 1),
          options: (acceptedAnswers.length ? acceptedAnswers : items.map((item) => item.title || item.content || '').filter(Boolean)).map((answer) => ({
            id: uid('answer'),
            text: answer,
            isCorrect: true,
          })),
          feedback: typeof metadata.feedback === 'string' ? metadata.feedback : '',
          correctFeedback: typeof metadata.correctFeedback === 'string' ? metadata.correctFeedback : '',
          incorrectFeedback: typeof metadata.incorrectFeedback === 'string' ? metadata.incorrectFeedback : '',
          feedbackMode: metadata.correctFeedback || metadata.incorrectFeedback ? 'correct_incorrect' : 'any_response',
          caseSensitive: Boolean(metadata.caseSensitive),
        })
      }

      return normalizeQuizQuestion({
        ...question,
        id: block.id,
        text: block.title || block.content || question.text,
        points: Number(metadata.points ?? 1),
        options: items.map((item) => ({
          id: item.id || uid(type === 'matching' ? 'match' : 'option'),
          text: item.title || '',
          match: item.match || item.content || '',
          isCorrect: type === 'matching' ? true : item.content === 'true',
        })),
        feedback: typeof metadata.feedback === 'string' ? metadata.feedback : '',
        correctFeedback: typeof metadata.correctFeedback === 'string' ? metadata.correctFeedback : '',
        incorrectFeedback: typeof metadata.incorrectFeedback === 'string' ? metadata.incorrectFeedback : '',
        feedbackMode: metadata.correctFeedback || metadata.incorrectFeedback ? 'correct_incorrect' : 'any_response',
      })
    })
}

export function normalizeQuizLesson(lesson: CourseLesson): CourseLesson {
  if (lesson.type !== 'quiz') return lesson
  const legacyQuestions = quizQuestionsFromBlocks(lesson.blocks)
  const questions = ((lesson.quiz?.questions?.length ? lesson.quiz.questions : legacyQuestions).length
    ? (lesson.quiz?.questions?.length ? lesson.quiz.questions : legacyQuestions)
    : [createQuizQuestion()]
  ).map(normalizeQuizQuestion)

  return {
    ...lesson,
    blocks: [],
    quiz: {
      passingScore: lesson.quiz?.passingScore ?? 80,
      timeLimitMinutes: lesson.quiz?.timeLimitMinutes,
      attempts: lesson.quiz?.attempts ?? 1,
      randomizeQuestions: lesson.quiz?.randomizeQuestions ?? false,
      randomizeAnswers: lesson.quiz?.randomizeAnswers ?? false,
      showFeedback: lesson.quiz?.showFeedback ?? true,
      questions,
    },
  }
}

export function createEmptyCourseDocument(title: string, authorName: string): CourseDocument {
  return syncCourseDocument({
    schemaVersion: 1,
    id: uid('course'),
    title,
    description: '',
    objectives: [],
    sections: [{ id: uid('section'), title: 'Course content', lessonIds: [] }],
    lessons: [],
    pages: [],
    settings: {
      completionMode: 'pages',
      passingScore: 80,
      scormVersion: '1.2',
      completionPercentage: 100,
      requireQuizPass: false,
    },
    theme: defaultTheme,
    publish: defaultPublish,
    metadata: {
      source: 'course_engine',
      generatedAt: new Date().toISOString(),
      version: 1,
      authorName,
      audience: '',
      duration: '',
      format: 'Linear',
      tone: '',
      scorm: { ...createDefaultScormSettings(title, '') },
    },
  })
}

export function normalizeCourseDocument(document: CourseDocument, authorName: string): CourseDocument {
  const lessons = (document.lessons?.length ? document.lessons : document.pages.map(pageToLesson)).map((lesson) =>
    normalizeQuizLesson({
      ...lesson,
      type: lesson.type ?? 'lesson',
      blocks: lesson.blocks ?? [],
      metadata: {
        ...lesson.metadata,
        authorName: typeof lesson.metadata?.authorName === 'string' ? lesson.metadata.authorName : authorName,
      },
    }),
  )

  return syncCourseDocument({
    ...document,
    title: document.title ?? '',
    description: document.description ?? '',
    objectives: document.objectives ?? [],
    lessons,
    theme: { ...defaultTheme, ...document.theme },
    publish: { ...defaultPublish, ...document.publish },
    metadata: {
      ...document.metadata,
      source: 'course_engine',
      authorName: typeof document.metadata?.authorName === 'string' ? document.metadata.authorName : authorName,
      audience: typeof document.metadata?.audience === 'string' ? document.metadata.audience : '',
      duration: typeof document.metadata?.duration === 'string' ? document.metadata.duration : '',
      format: normalizeCourseFormat(document.metadata?.format),
      tone: typeof document.metadata?.tone === 'string' ? document.metadata.tone : '',
      scorm: {
        ...createDefaultScormSettings(document.title ?? '', document.description ?? ''),
        ...(typeof document.metadata?.scorm === 'object' && document.metadata.scorm ? document.metadata.scorm : {}),
      },
    },
  })
}

export function syncCourseDocument(document: CourseDocument): CourseDocument {
  const lessons: CourseLesson[] = (document.lessons ?? []).map((lesson) => ({
    ...normalizeQuizLesson(lesson),
    estimatedMinutes: positiveIntegerOrUndefined(lesson.estimatedMinutes),
  }))
  const objectives = Array.isArray(document.objectives)
    ? document.objectives.filter((objective): objective is string => typeof objective === 'string')
    : []
  const sections = normalizeSections(document.sections, lessons)
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
  const orderedLessonIds = sections.flatMap((section) => section.lessonIds)
  const orderedLessons: CourseLesson[] = orderedLessonIds
    .map((lessonId) => lessonsById.get(lessonId))
    .filter((lesson): lesson is CourseLesson => Boolean(lesson))
  const settings = document.settings ?? {}
  const publish: Partial<CoursePublishSettings> = document.publish ?? {}

  return {
    ...document,
    objectives,
    estimatedMinutes: positiveIntegerOrUndefined(document.estimatedMinutes),
    lessons: orderedLessons,
    sections,
    pages: orderedLessons.map(lessonToPage),
    settings: {
      completionMode: settings.completionMode === 'score' ? 'score' : 'pages',
      passingScore: percentageOrDefault(settings.passingScore, 80),
      scormVersion: settings.scormVersion === '2004' ? '2004' : '1.2',
      completionPercentage: percentageOrDefault(settings.completionPercentage, 100, 1),
      requireQuizPass: Boolean(settings.requireQuizPass),
    },
    theme: { ...defaultTheme, ...document.theme },
    publish: {
      ...defaultPublish,
      ...publish,
      completionPercentage: percentageOrDefault(publish.completionPercentage, 100, 1),
      passingScore: percentageOrDefault(publish.passingScore, 80),
    },
    metadata: {
      ...document.metadata,
      source: 'course_engine',
      updatedAt: new Date().toISOString(),
    },
  }
}

function positiveIntegerOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.round(parsed)
}

function percentageOrDefault(value: unknown, fallback: number, minimum = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(minimum, Math.round(parsed)))
}

/**
 * Returns the explicitly configured course duration when present, otherwise
 * adds the lesson estimates. Keeping this in the model makes readiness,
 * authoring, preview, and export use the same duration rule.
 */
export function getCourseEstimatedMinutes(document: CourseDocument): number {
  const configuredDuration = positiveIntegerOrUndefined(document.estimatedMinutes)
  if (configuredDuration) return configuredDuration

  return (document.lessons ?? []).reduce(
    (total, lesson) => total + (positiveIntegerOrUndefined(lesson.estimatedMinutes) ?? 0),
    0,
  )
}

export function formatCourseDuration(minutes: number): string {
  const normalized = positiveIntegerOrUndefined(minutes)
  if (!normalized) return 'Duration unset'
  if (normalized < 60) return `${normalized} min`

  const hours = Math.floor(normalized / 60)
  const remainingMinutes = normalized % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function normalizeSections(sections: CourseSection[] | undefined, lessons: CourseLesson[]): CourseSection[] {
  const lessonIds = new Set(lessons.map((lesson) => lesson.id))
  const nextSections = (sections?.length
    ? sections
    : [{ id: uid('section'), title: 'Course content', lessonIds: lessons.map((lesson) => lesson.id) }]
  ).map((section) => ({
    ...section,
    title: section.title?.trim() || 'Untitled section',
    lessonIds: Array.from(new Set((section.lessonIds ?? []).filter((lessonId) => lessonIds.has(lessonId)))),
  }))

  const assigned = new Set(nextSections.flatMap((section) => section.lessonIds))
  const missing = lessons.map((lesson) => lesson.id).filter((lessonId) => !assigned.has(lessonId))

  if (!nextSections.length) {
    return [{ id: uid('section'), title: 'Course content', lessonIds: missing }]
  }

  if (missing.length) {
    nextSections[0] = {
      ...nextSections[0],
      lessonIds: [...nextSections[0].lessonIds, ...missing],
    }
  }

  return nextSections
}

export function createLesson(title: string): CourseLesson {
  return {
    id: uid('lesson'),
    type: 'lesson',
    title,
    summary: '',
    estimatedMinutes: undefined,
    blocks: [],
    metadata: {
      contentKind: 'unset',
    },
  }
}

export function setLessonKind(lesson: CourseLesson, type: 'lesson' | 'quiz'): CourseLesson {
  return {
    ...lesson,
    type,
    metadata: {
      ...lesson.metadata,
      contentKind: type,
    },
    blocks: type === 'quiz' ? [] : lesson.blocks,
    quiz:
      type === 'quiz'
        ? normalizeQuizLesson({ ...lesson, type: 'quiz' }).quiz
        : undefined,
  }
}

export function createBlock(type: CourseBlockType): CourseBlock {
  const definition = getBlockDefinition(type)
  return {
    id: uid('block'),
    type,
    category: definition.category,
    title: '',
    content: '',
    assetUrl: '',
    items: defaultItemsFor(type),
    metadata: defaultMetadataFor(type),
  }
}

export function duplicateBlock(block: CourseBlock): CourseBlock {
  return {
    ...block,
    id: uid('block'),
    items: block.items?.map((item) => ({ ...item, id: uid('item') })),
    metadata: { ...block.metadata },
  }
}

export function duplicateLesson(lesson: CourseLesson): CourseLesson {
  return {
    ...lesson,
    id: uid('lesson'),
    title: `${lesson.title} copy`,
    blocks: lesson.blocks.map(duplicateBlock),
    quiz: lesson.quiz
      ? {
          ...lesson.quiz,
          questions: lesson.quiz.questions.map((question) => ({
            ...question,
            id: uid('question'),
            options: question.options.map((option) => ({
              ...option,
              id: uid('option'),
            })),
          })),
        }
      : undefined,
    metadata: { ...lesson.metadata },
  }
}

export function blockHasContent(block: CourseBlock) {
  if (block.type === 'continue_button') return true
  if (block.type === 'divider' || block.type === 'spacer') return true
  const hasText = Boolean(block.title?.trim() || block.content?.trim() || block.assetUrl?.trim())
  
  const defaultItems = defaultItemsFor(block.type)
  const hasItems = (block.items ?? []).some((item, index) => {
    const def = defaultItems[index] ?? {}
    return (
      (item.title?.trim() || '') !== (def.title?.trim() || '') ||
      (item.content?.trim() || '') !== (def.content?.trim() || '') ||
      (item.mediaUrl?.trim() || '') !== (def.mediaUrl?.trim() || '') ||
      (item.match?.trim() || '') !== (def.match?.trim() || '')
    )
  })

  const defaultMeta = defaultMetadataFor(block.type)
  const metadata = block.metadata ?? {}
  const hasMetadata = Object.entries(metadata).some(([key, value]) => {
    if (['style', 'level', 'width', 'layout', 'required', 'shuffle', 'allowRetry', 'points', 'showQuoteMark', 'showAvatar', 'overlayOpacity', 'alignment', 'spacing', 'behavior', 'overflowArrows'].includes(key)) return false
    if (value === defaultMeta[key]) return false
    return value !== undefined && value !== null && value !== ''
  })
  
  return hasText || hasItems || hasMetadata
}

export function getCourseReadiness(document: CourseDocument): CourseReadiness {
  const lessons = document.lessons ?? []
  const quizLessons = lessons.filter((lesson) => lesson.type === 'quiz')
  const contentLessons = lessons.filter((lesson) => lesson.type === 'lesson' && lesson.blocks.some(blockHasContent))
  const courseFormat = getCourseFormat(document)
  const branchingDecisions = lessons.flatMap((lesson) =>
    lesson.blocks
      .filter((block) => branchingDecisionBlockTypes.includes(block.type))
      .map((block) => ({ lesson, block })),
  )
  const lessonIds = new Set(lessons.map((lesson) => lesson.id))
  const objectives = Array.isArray(document.objectives)
    ? document.objectives.filter((objective): objective is string => typeof objective === 'string')
    : []
  const issues: CourseReadinessIssue[] = []
  const checks: boolean[] = []
  const addCheck = (
    passed: boolean,
    issue: Omit<CourseReadinessIssue, 'id'> & { id: string },
  ) => {
    checks.push(passed)
    if (!passed) issues.push(issue)
  }

  addCheck(Boolean(document.title.trim()), {
    id: 'course-title',
    severity: 'error',
    message: 'Add a course title.',
  })
  addCheck(Boolean(document.description?.trim()), {
    id: 'course-description',
    severity: 'warning',
    message: 'Add a concise course description.',
  })
  addCheck(objectives.some((objective) => objective.trim()), {
    id: 'course-objectives',
    severity: 'warning',
    message: 'Add at least one measurable learning objective.',
  })
  addCheck(lessons.length > 0, {
    id: 'course-lessons',
    severity: 'error',
    message: 'Add at least one lesson or quiz.',
  })
  addCheck(getCourseEstimatedMinutes(document) > 0, {
    id: 'course-duration',
    severity: 'warning',
    message: 'Estimate the course or lesson duration.',
  })
  addCheck(document.settings.completionMode !== 'score' || quizLessons.length > 0, {
    id: 'score-completion-quiz',
    severity: 'error',
    message: 'Add a quiz before using score-based completion.',
  })
  addCheck(
    Number.isFinite(Number(document.settings.completionPercentage)) &&
      Number(document.settings.completionPercentage) >= 1 &&
      Number(document.settings.completionPercentage) <= 100,
    {
      id: 'completion-percentage',
      severity: 'error',
      message: 'Set a completion threshold between 1 and 100.',
    },
  )
  addCheck(
    Number.isFinite(Number(document.settings.passingScore)) &&
      Number(document.settings.passingScore) >= 0 &&
      Number(document.settings.passingScore) <= 100,
    {
      id: 'passing-score',
      severity: 'error',
      message: 'Set a passing score between 0 and 100.',
    },
  )
  addCheck(!document.settings.requireQuizPass || quizLessons.length > 0, {
    id: 'required-quiz',
    severity: 'error',
    message: 'Add a quiz before requiring learners to pass one.',
  })
  if (courseFormat === 'Assessment-Only') {
    addCheck(quizLessons.length > 0, {
      id: 'assessment-only-quiz',
      severity: 'error',
      message: 'An assessment-only course needs at least one quiz.',
    })
    addCheck(lessons.every((lesson) => lesson.type === 'quiz'), {
      id: 'assessment-only-content',
      severity: 'error',
      message: 'Assessment-only courses can contain quiz items only.',
    })
    addCheck(document.settings.completionMode === 'score', {
      id: 'assessment-only-score-completion',
      severity: 'error',
      message: 'Assessment-only courses must use score-based completion.',
    })
    addCheck(Boolean(document.settings.requireQuizPass), {
      id: 'assessment-only-require-pass',
      severity: 'error',
      message: 'Assessment-only courses must require a quiz pass.',
    })
  }

  if (courseFormat === 'Linear') {
    addCheck(branchingDecisions.length === 0, {
      id: 'linear-branching-content',
      severity: 'warning',
      message: 'This linear course contains choice points. Use the branching or hybrid format if learners should follow those routes.',
    })
  }

  if (courseFormat === 'Branching' || courseFormat === 'Hybrid') {
    addCheck(branchingDecisions.length > 0, {
      id: 'branching-decision',
      severity: 'error',
      message: `${courseFormat} courses need at least one choice point or branching dialogue.`,
    })
    if (courseFormat === 'Hybrid') {
      addCheck(contentLessons.length > 0, {
        id: 'hybrid-content',
        severity: 'error',
        message: 'Hybrid courses need at least one completed instructional lesson in addition to their branching content.',
      })
    }

    for (const { lesson, block } of branchingDecisions) {
      const choices = (block.items ?? []).filter((item) => item.title?.trim())
      const validDestinations = choices.filter(
        (choice) => choice.match && choice.match !== lesson.id && lessonIds.has(choice.match),
      )
      addCheck(choices.length >= 2, {
        id: `branching-choices-${block.id}`,
        severity: 'error',
        message: `${lesson.title.trim() || 'Untitled lesson'} needs at least two titled choices in its ${getBlockDefinition(block.type).label.toLowerCase()}.`,
        lessonId: lesson.id,
      })
      addCheck(validDestinations.length >= 2, {
        id: `branching-destinations-${block.id}`,
        severity: 'error',
        message: `${lesson.title.trim() || 'Untitled lesson'} needs two choices linked to different course items.`,
        lessonId: lesson.id,
      })
    }
  }

  const seenIds = new Set<string>()
  for (const lesson of lessons) {
    const lessonLabel = lesson.title.trim() || 'Untitled lesson'
    addCheck(Boolean(lesson.title.trim()), {
      id: `lesson-title-${lesson.id}`,
      severity: 'error',
      message: 'Give every lesson a title.',
      lessonId: lesson.id,
    })
    addCheck(!seenIds.has(lesson.id), {
      id: `lesson-id-${lesson.id}`,
      severity: 'error',
      message: `${lessonLabel} has a duplicate identifier.`,
      lessonId: lesson.id,
    })
    seenIds.add(lesson.id)

    if (lesson.type === 'quiz') {
      const questions = lesson.quiz?.questions ?? []
      addCheck(questions.length > 0, {
        id: `quiz-questions-${lesson.id}`,
        severity: 'error',
        message: `${lessonLabel} needs at least one question.`,
        lessonId: lesson.id,
      })
      addCheck(
        questions.length > 0 && questions.every(quizQuestionIsComplete),
        {
          id: `quiz-complete-${lesson.id}`,
          severity: 'error',
          message: `${lessonLabel} has incomplete questions or answers.`,
          lessonId: lesson.id,
        },
      )
      continue
    }

    addCheck(lesson.blocks.some(blockHasContent), {
      id: `lesson-content-${lesson.id}`,
      severity: 'error',
      message: `${lessonLabel} needs at least one completed content block.`,
      lessonId: lesson.id,
    })
  }

  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  const completedChecks = checks.filter(Boolean).length
  const totalChecks = checks.length

  return {
    issues,
    errors,
    warnings,
    completedChecks,
    totalChecks,
    percent: totalChecks ? Math.round((completedChecks / totalChecks) * 100) : 0,
    ready: errors.length === 0,
  }
}

function quizQuestionIsComplete(question: CourseQuizQuestion): boolean {
  const normalized = normalizeQuizQuestion(question)
  const type = normalizeQuizQuestionType(normalized.type)
  const options = normalized.options ?? []

  if (!normalized.text.trim() || Number(normalized.points) <= 0) return false
  if (type === 'fill_blank') {
    return options.some((option) => option.text.trim())
  }
  if (type === 'matching') {
    return options.length >= 2 && options.every((option) => option.text.trim() && option.match?.trim())
  }

  const completedOptions = options.filter((option) => option.text.trim())
  if (completedOptions.length < 2) return false
  if (type === 'multiple_choice') {
    return completedOptions.filter((option) => option.isCorrect).length === 1
  }
  return completedOptions.some((option) => option.isCorrect)
}

export function getScormSettings(document: CourseDocument): ScormSettings {
  return {
    ...createDefaultScormSettings(document.title, document.description ?? ''),
    ...(typeof document.metadata?.scorm === 'object' && document.metadata.scorm ? document.metadata.scorm : {}),
  } as ScormSettings
}

export function createManifestPreview(document: CourseDocument) {
  const scorm = getScormSettings(document)
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(scorm.courseIdentifier)}" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata>
    <schema>${scorm.version === 'xapi' ? 'xAPI Tin Can' : 'ADL SCORM'}</schema>
    <schemaversion>${scorm.version === 'scorm_2004_3rd' ? '2004 3rd Edition' : '1.2'}</schemaversion>
  </metadata>
  <organizations default="org-${escapeXml(document.id)}">
    <organization identifier="org-${escapeXml(document.id)}">
      <title>${escapeXml(scorm.lmsTitle || document.title)}</title>
      ${document.pages.map((page) => `      <item identifier="item-${escapeXml(page.id)}" identifierref="res-${escapeXml(page.id)}"><title>${escapeXml(page.title)}</title></item>`).join('\n')}
    </organization>
  </organizations>
  <resources>
    ${document.pages.map((page) => `<resource identifier="res-${escapeXml(page.id)}" type="webcontent" adlcp:scormType="sco" href="index.html#${escapeXml(page.id)}">
      <file href="index.html" />
      <file href="scorm-api-bridge.js" />
    </resource>`).join('\n    ')}
  </resources>
</manifest>`
}

function createDefaultScormSettings(title: string, description: string): ScormSettings {
  return {
    version: 'scorm_1_2',
    completionTrigger: 'viewed_all',
    customCondition: '',
    passingScore: 80,
    maxScore: 100,
    courseIdentifier: uid('course-id'),
    lmsTitle: title,
    lmsDescription: description,
    language: 'en-US',
    launchBehavior: 'new_window',
    masteryScore: 80,
  }
}

function lessonToPage(lesson: CourseLesson): CoursePage {
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

function pageToLesson(page: CoursePage): CourseLesson {
  return {
    id: page.id,
    type: page.type === 'quiz' ? 'quiz' : 'lesson',
    title: page.title,
    summary: page.summary,
    coverImageUrl: page.coverImageUrl,
    blocks: page.blocks ?? [],
    quiz: page.quiz
      ? {
          passingScore: page.quiz.passingScore,
          timeLimitMinutes: page.quiz.timeLimitMinutes,
          attempts: page.quiz.attempts,
          randomizeQuestions: page.quiz.randomizeQuestions,
          randomizeAnswers: page.quiz.randomizeAnswers,
          showFeedback: page.quiz.showFeedback,
          questions: page.quiz.questions as CourseQuizQuestion[],
        }
      : undefined,
    metadata: page.metadata,
  }
}

function defaultItemsFor(type: CourseBlockType): CourseInteractionItem[] {
  if (['list', 'numbered_list', 'checklist', 'lesson_summary', 'ordering', 'process_steps'].includes(type)) {
    return [
      { id: uid('item'), title: '', content: '' },
      { id: uid('item'), title: '', content: '' },
    ]
  }
  if (['accordion', 'tabs', 'flashcards'].includes(type)) {
    return [
      { id: uid('item'), title: '', content: '', match: '', mediaUrl: '' },
      { id: uid('item'), title: '', content: '', match: '', mediaUrl: '' },
    ]
  }
  if (['timeline', 'sorting_activity', 'matching'].includes(type)) {
    return [
      { id: uid('item'), title: '', content: '', match: '' },
      { id: uid('item'), title: '', content: '', match: '' },
    ]
  }
  if (branchingDecisionBlockTypes.includes(type)) {
    return [
      { id: uid('choice'), title: '', content: '', match: '' },
      { id: uid('choice'), title: '', content: '', match: '' },
    ]
  }
  if (['multiple_choice', 'multiple_select'].includes(type)) {
    return [
      { id: uid('option'), title: '', content: 'false' },
      { id: uid('option'), title: '', content: 'false' },
    ]
  }
  if (type === 'true_false') {
    return [
      { id: uid('option'), title: 'True', content: 'false' },
      { id: uid('option'), title: 'False', content: 'false' },
    ]
  }
  if (type === 'image_gallery') {
    return [
      { id: uid('image'), title: '', mediaUrl: '', content: '' },
      { id: uid('image'), title: '', mediaUrl: '', content: '' },
    ]
  }
  if (type === 'rating_slider') {
    return [
      { id: uid('option'), title: '1', content: '' },
      { id: uid('option'), title: '5', content: '' },
      { id: uid('option'), title: '10', content: '' },
    ]
  }
  if (type === 'likert') {
    return [
      { id: uid('option'), title: 'Strongly disagree', content: '' },
      { id: uid('option'), title: 'Disagree', content: '' },
      { id: uid('option'), title: 'Neutral', content: '' },
      { id: uid('option'), title: 'Agree', content: '' },
      { id: uid('option'), title: 'Strongly agree', content: '' },
    ]
  }
  if (type === 'short_answer') {
    return []
  }
  if (type === 'ordering') {
    return [
      { id: uid('item'), title: '1st', content: '' },
      { id: uid('item'), title: '2nd', content: '' },
      { id: uid('item'), title: '3rd', content: '' },
    ]
  }
  if (type === 'matching_pairs') {
    return [
      { id: uid('item'), title: '', content: '', match: '' },
      { id: uid('item'), title: '', content: '', match: '' },
      { id: uid('item'), title: '', content: '', match: '' },
      { id: uid('item'), title: '', content: '', match: '' },
    ]
  }
  return []
}

function defaultMetadataFor(type: CourseBlockType): Record<string, unknown> {
  const questionDefaults = isQuestionBlock(type)
    ? {
        points: 1,
        hint: '',
        required: true,
        shuffle: false,
        allowRetry: true,
        maxAttempts: 1,
        correctFeedback: '',
        incorrectFeedback: '',
        partialFeedback: '',
      }
    : {}

  const defaults: Partial<Record<CourseBlockType, Record<string, unknown>>> = {
    heading: { level: 'H2', subtitle: '' },
    callout: { style: 'Info' },
    statement: { style: 'Info' },
    quote: {
      attributionName: '',
      attributionRole: '',
      avatarUrl: '',
      showQuoteMark: true,
      showAvatar: true,
      layout: 'standard',
      overlayOpacity: 55,
      alignment: 'left',
      spacing: 'normal',
    },
    divider: { style: 'solid', label: '' },
    image: { caption: '', alt: '', width: 'medium' },
    image_gallery: { layout: '2-col grid' },
    video: { autoplay: false, caption: '' },
    audio: { transcript: '' },
    dialogue: { bubbleStyle: 'Chat' },
    character_monologue: { characterName: '', avatarUrl: '', emotion: 'neutral', alignment: 'left' },
    branching_dialogue: { bubbleStyle: 'Chat' },
    fill_blank: { acceptedAnswers: '', caseSensitive: false },
    true_false: { correctAnswer: 'True', explanation: '' },
    matching: { instructions: '' },
    hotspot: { imageUrl: '', regions: '' },
    short_answer: { keywords: '', manualReview: false },
    likert: { scaleSize: 5, lowLabel: 'Strongly disagree', highLabel: 'Strongly agree' },
    rating_slider: { min: 0, max: 10, step: 1, minLabel: '', maxLabel: '' },
    choice_point: { destinationMode: 'lesson' },
    consequence: { imageUrl: '', label: 'Result:' },
    decision_recap: { autoPopulate: true, intro: '' },
    branch_merge: { internalLabel: '' },
    conditional_gate: { conditionType: 'viewed lesson', target: '', lockedMessage: '' },
    timeline: { orientation: 'vertical' },
    checklist: { showProgress: true },
    reveal: { triggerLabel: 'Reveal', hiddenContent: '' },
    accordion: { behavior: 'single' },
    tabs: { overflowArrows: true },
    flashcards: { layout: 'grid', clickPrompt: 'Click to flip', imageSide: 'front' },
    sorting_activity: { graded: false, instructions: 'Sort each item into the correct category.', completionMessage: 'All items sorted.' },
    before_after: { beforeImage: '', afterImage: '', beforeLabel: 'Before', afterLabel: 'After' },
    table: { rows: 3, columns: 3, headerRow: true },
    chart: {
      chartType: 'bar',
      data: JSON.stringify([
        { label: 'Item 1', value: 40 },
        { label: 'Item 2', value: 70 },
        { label: 'Item 3', value: 55 },
      ]),
      axisLabels: '',
      chartTitle: '',
    },
    resource_link: { url: '', icon: '' },
    file_download: { fileUrl: '', label: '', description: '' },
    glossary: { term: '', definition: '', example: '' },
    process_steps: {
      introTitle: 'Process overview',
      introText: '',
      introImageUrl: '',
      startLabel: 'Start',
      summaryTitle: 'Process complete',
      summaryText: '',
      restartLabel: 'Start Again',
    },
    continue_button: {
      label: 'Continue',
      alignment: 'center',
      completionType: 'None',
      lockedHint: 'Complete the required activity above to continue.',
      unlockedHint: 'Ready to continue.',
    },
    score_summary: { sourceQuiz: '', passMessage: '', failMessage: '' },
    certificate: { logoUrl: '', signatureUrl: '' },
    completion_message: { imageUrl: '' },
    restart_button: { label: 'Restart', scope: 'entire course' },
    ordering: { orientation: 'vertical' },
    matching_pairs: { instructions: '' },
  }

  return {
    ...questionDefaults,
    ...(defaults[type] ?? {}),
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function categoryLabelFor(category?: CourseBlockCategory) {
  return category ? categoryLabels[category] ?? category : 'Blocks'
}
