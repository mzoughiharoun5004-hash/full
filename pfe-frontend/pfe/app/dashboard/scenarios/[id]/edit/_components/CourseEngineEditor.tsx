'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ElementType } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Braces,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  Copy,
  FileText,
  Flag,
  GripVertical,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LayoutPanelTop,
  Library,
  ListChecks,
  Lock,
  MessageSquare,
  Monitor,
  MousePointer2,
  PanelLeft,
  Pencil,
  Phone,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareStack,
  Tablet,
  Trash2,
  Type,
  Video,
} from 'lucide-react'
import { scenariosApi } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/context/AuthContext'
import { useSocket, type ScenarioCursorEvent, type ScenarioLockInfo } from '@/context/SocketContext'
import { cn } from '@/lib/utils'
import { MediaPicker } from './MediaPicker'
import { blockHasContent } from './inline-course-editor/courseEditorModel'
import type {
  CourseBlock,
  CourseBlockCategory,
  CourseBlockType,
  CourseDocument,
  CourseInteractionItem,
  CourseKnowledgeCheck,
  CourseKnowledgeCheckOption,
  CourseLesson,
  CourseLessonType,
  CoursePage,
  CoursePublishSettings,
  CourseQuizQuestion,
  CourseQuizQuestionOption,
  CourseSection,
  CourseTheme,
  MediaAsset,
  MediaType,
} from '@/types'

interface Props {
  scenarioId: string
  courseLock?: ScenarioLockInfo
  remoteCursors?: ScenarioCursorEvent[]
}

type EditorMode = 'build' | 'preview'
type InspectorTab = 'blocks' | 'theme' | 'settings' | 'publish'
type PreviewDevice = 'desktop' | 'tablet' | 'phone'

interface BlockDefinition {
  type: CourseBlockType
  category: CourseBlockCategory
  label: string
  icon: ElementType
}

interface DraftQuiz {
  passingScore: number
  timeLimitMinutes?: number
  attempts?: number
  randomizeQuestions?: boolean
  randomizeAnswers?: boolean
  showFeedback?: boolean
  questions: CourseQuizQuestion[]
}

const selectClass =
  'h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200 outline-none focus:border-[#0F6B4A]'

const textareaClass =
  'w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-[#0F6B4A] focus:ring-2 focus:ring-[#0F6B4A]/20 disabled:cursor-not-allowed disabled:opacity-50'

let uidFallbackCounter = 0

const uid = (prefix: string) => {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}-${uuid ?? `${Date.now()}-${++uidFallbackCounter}`}`
}

const defaultTheme: CourseTheme = {
  accentColor: '#0F6B4A',
  fontPairing: 'modern',
  coverLayout: 'centered',
  navigationMode: 'sidebar',
  lessonNumbers: true,
  sidebarEnabled: true,
}

const defaultPublish: CoursePublishSettings = {
  target: 'lms',
  lmsStandard: 'scorm_1_2',
  tracking: 'completion_and_score',
  completionPercentage: 100,
  passingScore: 80,
  reportingStatus: 'completed_passed',
}

const blockLibrary: BlockDefinition[] = [
  { type: 'heading', category: 'text', label: 'Heading', icon: Type },
  { type: 'paragraph', category: 'text', label: 'Paragraph', icon: AlignLeft },
  { type: 'quote', category: 'statement', label: 'Quote', icon: MessageSquare },
  { type: 'statement', category: 'statement', label: 'Statement', icon: Sparkles },
  { type: 'callout', category: 'statement', label: 'Callout', icon: HelpCircle },
  { type: 'list', category: 'list', label: 'List', icon: ListChecks },
  { type: 'image', category: 'media', label: 'Image', icon: ImageIcon },
  { type: 'gallery', category: 'media', label: 'Gallery', icon: SquareStack },
  { type: 'video', category: 'media', label: 'Video', icon: Video },
  { type: 'audio', category: 'media', label: 'Audio', icon: Presentation },
  { type: 'attachment', category: 'media', label: 'Attachment', icon: FileText },
  { type: 'code', category: 'media', label: 'Code', icon: Braces },
  { type: 'accordion', category: 'interactive', label: 'Accordion', icon: ChevronDown },
  { type: 'tabs', category: 'interactive', label: 'Tabs', icon: LayoutPanelTop },
  { type: 'process', category: 'interactive', label: 'Process', icon: Layers },
  { type: 'timeline', category: 'interactive', label: 'Timeline', icon: Flag },
  { type: 'flashcards', category: 'interactive', label: 'Flashcards', icon: Copy },
  { type: 'sorting', category: 'interactive', label: 'Sorting', icon: CheckSquare },
  { type: 'labeled_graphic', category: 'interactive', label: 'Labeled Graphic', icon: MousePointer2 },
  { type: 'scenario', category: 'interactive', label: 'Scenario', icon: PanelLeft },
  { type: 'knowledge_check', category: 'knowledge_check', label: 'Knowledge Check', icon: ClipboardCheck },
  { type: 'chart', category: 'chart', label: 'Chart', icon: BarChart3 },
  { type: 'button', category: 'divider', label: 'Button', icon: MousePointer2 },
  { type: 'divider', category: 'divider', label: 'Divider', icon: GripVertical },
  { type: 'spacer', category: 'divider', label: 'Spacer', icon: SlidersHorizontal },
]

const categoryLabels: Record<CourseBlockCategory, string> = {
  text: 'Text',
  text_narrative: 'Text & Narrative',
  statement: 'Statements',
  list: 'Lists',
  media: 'Media',
  dialogue_characters: 'Dialogue & Characters',
  interactive: 'Interactive',
  interactive_engagement: 'Interactive & Engagement',
  knowledge_check: 'Knowledge',
  questions: 'Questions & Assessments',
  branching_decision: 'Branching & Decision',
  data_reference: 'Data & Reference',
  navigation_completion: 'Navigation & Completion',
  chart: 'Charts',
  divider: 'Layout',
  rating_slider: 'Interactive & Engagement',
  likert: 'Interactive & Engagement',
  hotspot: 'Interactive & Engagement',
  short_answer: 'Questions & Assessments',
  ordering: 'Interactive & Engagement',
  matching_pairs: 'Questions & Assessments',
}

function definitionFor(type: CourseBlockType): BlockDefinition {
  return blockLibrary.find((item) => item.type === type) ?? blockLibrary[1]
}

function categoryFor(type: CourseBlockType): CourseBlockCategory {
  return definitionFor(type).category
}

function normalizeBlockType(type: CourseBlockType): CourseBlockType {
  if (type === 'text') return 'paragraph'
  if (type === 'document') return 'attachment'
  return type
}

function createItems(type: CourseBlockType): CourseInteractionItem[] {
  if (type === 'gallery') {
    return [
      { id: uid('item'), title: 'Image 1', mediaUrl: '', content: 'Caption' },
      { id: uid('item'), title: 'Image 2', mediaUrl: '', content: 'Caption' },
    ]
  }

  if (type === 'sorting') {
    return [
      { id: uid('item'), title: 'Item A', content: 'Category 1' },
      { id: uid('item'), title: 'Item B', content: 'Category 2' },
    ]
  }

  if (type === 'chart') {
    return [
      { id: uid('item'), title: 'Segment A', content: '45' },
      { id: uid('item'), title: 'Segment B', content: '30' },
      { id: uid('item'), title: 'Segment C', content: '25' },
    ]
  }

  if (type === 'labeled_graphic') {
    return [
      { id: uid('item'), title: 'Marker 1', content: 'Marker text', marker: { x: 35, y: 45 } },
      { id: uid('item'), title: 'Marker 2', content: 'Marker text', marker: { x: 65, y: 55 } },
    ]
  }

  if (type === 'list') {
    return [
      { id: uid('item'), title: 'First item', content: '' },
      { id: uid('item'), title: 'Second item', content: '' },
    ]
  }

  return [
    { id: uid('item'), title: 'Step 1', content: 'Add the first part of the interaction.' },
    { id: uid('item'), title: 'Step 2', content: 'Add the next part of the interaction.' },
  ]
}

function createKnowledgeCheck(): CourseKnowledgeCheck {
  return {
    type: 'multiple_choice',
    question: 'Which option is correct?',
    correctFeedback: 'Correct.',
    incorrectFeedback: 'Review the lesson and try again.',
    allowRetry: true,
    options: [
      { id: uid('option'), text: 'Correct answer', isCorrect: true },
      { id: uid('option'), text: 'Distractor', isCorrect: false },
    ],
  }
}

function createQuestion(): CourseQuizQuestion {
  return {
    id: uid('question'),
    type: 'multiple_choice',
    text: 'New question',
    points: 1,
    feedback: '',
    options: [
      { id: uid('option'), text: 'Correct answer', isCorrect: true },
      { id: uid('option'), text: 'Distractor', isCorrect: false },
    ],
  }
}

function createBlock(type: CourseBlockType): CourseBlock {
  const normalizedType = normalizeBlockType(type)
  const definition = definitionFor(normalizedType)
  const base: CourseBlock = {
    id: uid('block'),
    type: normalizedType,
    category: definition.category,
    title: definition.label,
    content: '',
    metadata: {
      layout: 'stacked',
      width: 'normal',
      align: 'left',
    },
  }

  if (['accordion', 'tabs', 'process', 'timeline', 'flashcards', 'sorting', 'labeled_graphic', 'gallery', 'list', 'chart', 'scenario'].includes(normalizedType)) {
    base.items = createItems(normalizedType)
    base.metadata = { ...base.metadata, items: base.items }
  }

  if (['image', 'video', 'audio', 'attachment'].includes(normalizedType)) {
    base.assetUrl = ''
    base.content = ''
  }

  if (normalizedType === 'knowledge_check') {
    base.knowledgeCheck = createKnowledgeCheck()
    base.metadata = { ...base.metadata, knowledgeCheck: base.knowledgeCheck }
  }

  if (normalizedType === 'button') {
    base.title = 'Button'
    base.content = 'Continue'
    base.assetUrl = '#'
  }

  if (normalizedType === 'spacer') {
    base.metadata = { ...base.metadata, height: 48 }
  }

  return base
}

function createLesson(type: CourseLessonType): CourseLesson {
  const lesson: CourseLesson = {
    id: uid(type),
    type,
    title: type === 'quiz' ? 'New quiz' : 'New lesson',
    summary: '',
    estimatedMinutes: type === 'quiz' ? 5 : 10,
    blocks: type === 'quiz' ? [] : [createBlock('heading'), createBlock('paragraph')],
    metadata: { required: true },
  }

  if (type === 'quiz') {
    lesson.quiz = {
      passingScore: 80,
      attempts: 3,
      randomizeQuestions: false,
      randomizeAnswers: false,
      showFeedback: true,
      questions: [createQuestion()],
    }
  }

  return lesson
}

function normalizeBlock(block: CourseBlock): CourseBlock {
  const type = normalizeBlockType(block.type)
  const items = block.items ?? (Array.isArray(block.metadata?.items) ? block.metadata?.items as CourseInteractionItem[] : undefined)
  const knowledgeCheck = block.knowledgeCheck ?? (
    typeof block.metadata?.knowledgeCheck === 'object' && block.metadata?.knowledgeCheck
      ? block.metadata.knowledgeCheck as CourseKnowledgeCheck
      : undefined
  )

  return {
    ...block,
    type,
    category: block.category ?? categoryFor(type),
    title: block.title ?? definitionFor(type).label,
    content: block.content ?? '',
    assetUrl: block.assetUrl ?? '',
    items,
    knowledgeCheck,
    metadata: {
      layout: 'stacked',
      width: 'normal',
      align: 'left',
      ...block.metadata,
      ...(items ? { items } : {}),
      ...(knowledgeCheck ? { knowledgeCheck } : {}),
    },
  }
}

function pageToLesson(page: CoursePage): CourseLesson {
  const blocks = (page.blocks ?? []).map(normalizeBlock)
  return {
    id: page.id,
    type: page.type === 'quiz' ? 'quiz' : 'lesson',
    title: page.title,
    summary: page.summary ?? '',
    estimatedMinutes: typeof page.metadata?.estimatedMinutes === 'number' ? page.metadata.estimatedMinutes : undefined,
    coverImageUrl: typeof page.metadata?.coverImageUrl === 'string' ? page.metadata.coverImageUrl : undefined,
    blocks,
    quiz: page.quiz
      ? {
          passingScore: page.quiz.passingScore,
          questions: page.quiz.questions,
          showFeedback: true,
        }
      : undefined,
    metadata: { required: true, ...page.metadata },
  }
}

function lessonToPage(lesson: CourseLesson): CoursePage {
  return {
    id: lesson.id,
    type: lesson.type === 'quiz' ? 'quiz' : 'lesson',
    title: lesson.title,
    summary: lesson.summary,
    blocks: lesson.blocks,
    quiz: lesson.quiz
      ? {
          passingScore: lesson.quiz.passingScore,
          questions: lesson.quiz.questions,
        }
      : undefined,
    metadata: {
      ...lesson.metadata,
      estimatedMinutes: lesson.estimatedMinutes,
      coverImageUrl: lesson.coverImageUrl,
    },
  }
}

function normalizeSections(sections: CourseSection[] | undefined, lessons: CourseLesson[]): CourseSection[] {
  const lessonIds = new Set(lessons.map((lesson) => lesson.id))
  const nextSections = (sections?.length
    ? sections
    : [{ id: uid('section'), title: 'Course content', lessonIds: lessons.map((lesson) => lesson.id) }]
  ).map((section) => ({
    ...section,
    lessonIds: section.lessonIds.filter((lessonId) => lessonIds.has(lessonId)),
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

function normalizeCourseDocument(document: CourseDocument): CourseDocument {
  const lessons = (document.lessons?.length
    ? document.lessons
    : document.pages.map(pageToLesson)
  ).map((lesson) => ({
    ...lesson,
    type: lesson.type ?? 'lesson',
    summary: lesson.summary ?? '',
    blocks: (lesson.blocks ?? []).map(normalizeBlock),
    metadata: { required: true, ...lesson.metadata },
  }))

  const safeLessons = lessons.length ? lessons : [createLesson('lesson')]
  const sections = normalizeSections(document.sections, safeLessons)
  const publish = { ...defaultPublish, ...document.publish }
  const theme = { ...defaultTheme, ...document.theme }

  return {
    ...document,
    objectives: document.objectives ?? [],
    lessons: safeLessons,
    sections,
    pages: safeLessons.map(lessonToPage),
    settings: {
      completionMode: document.settings?.completionMode ?? 'pages',
      passingScore: publish.passingScore ?? document.settings?.passingScore ?? 80,
      scormVersion:
        publish.lmsStandard === 'scorm_2004'
          ? '2004'
          : document.settings?.scormVersion ?? '1.2',
      completionPercentage: document.settings?.completionPercentage ?? publish.completionPercentage,
      requireQuizPass: document.settings?.requireQuizPass ?? true,
    },
    theme,
    publish,
    metadata: {
      ...document.metadata,
      source: 'course_engine',
    },
  }
}

function syncCourseDocument(document: CourseDocument): CourseDocument {
  const lessons = document.lessons ?? []
  const publish = { ...defaultPublish, ...document.publish }

  return {
    ...document,
    lessons,
    pages: lessons.map(lessonToPage),
    sections: normalizeSections(document.sections, lessons),
    settings: {
      ...document.settings,
      scormVersion: publish.lmsStandard === 'scorm_2004' ? '2004' : '1.2',
      passingScore: publish.passingScore,
      completionPercentage: publish.completionPercentage,
    },
    publish,
    theme: { ...defaultTheme, ...document.theme },
  }
}

function mediaTypesForBlock(type: CourseBlockType): MediaType[] {
  if (type === 'image' || type === 'gallery' || type === 'labeled_graphic') return ['IMAGE']
  if (type === 'video') return ['VIDEO']
  if (type === 'audio') return ['AUDIO']
  if (type === 'attachment' || type === 'document') return ['DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO']
  return ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT']
}

function metadataString(block: CourseBlock, key: string, fallback = '') {
  const value = block.metadata?.[key]
  return typeof value === 'string' ? value : fallback
}

function metadataNumber(block: CourseBlock, key: string, fallback = 0) {
  const value = block.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isInteractionBlock(type: CourseBlockType) {
  return ['accordion', 'tabs', 'process', 'timeline', 'flashcards', 'sorting', 'labeled_graphic', 'gallery', 'list', 'chart', 'scenario'].includes(type)
}

export function CourseEngineEditor({ scenarioId, courseLock, remoteCursors = [] }: Props) {
  const { data, isLoading } = useQuery<CourseDocument>({
    queryKey: ['course-document', scenarioId],
    queryFn: () => scenariosApi.getCourseDocument(scenarioId).then((response) => response.data),
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        No course document found.
      </div>
    )
  }

  const key = `${data.id}:${data.metadata?.version ?? 1}:${data.lessons?.length ?? data.pages.length}`
  return (
    <CourseDocumentDesigner
      key={key}
      scenarioId={scenarioId}
      initialDocument={data}
      courseLock={courseLock}
      remoteCursors={remoteCursors}
    />
  )
}

function CourseDocumentDesigner({
  scenarioId,
  initialDocument,
  courseLock,
  remoteCursors,
}: {
  scenarioId: string
  initialDocument: CourseDocument
  courseLock?: ScenarioLockInfo
  remoteCursors: ScenarioCursorEvent[]
}) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { broadcastScenarioEdit, broadcastCursor, lockElement, unlockElement } = useSocket()
  const [document, setDocument] = useState<CourseDocument>(() => normalizeCourseDocument(initialDocument))
  const lessons = document.lessons ?? []
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id ?? '')
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('build')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('blocks')
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const claimedLock = useRef(false)
  const elementId = `course:${scenarioId}`
  const lockedByOther = !!courseLock && String(courseLock.user.id) !== String(user?.id)
  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons[0]
  const selectedBlock = selectedLesson?.blocks.find((block) => block.id === selectedBlockId) ?? null

  useEffect(() => {
    if (!lockedByOther && !claimedLock.current) {
      claimedLock.current = true
      lockElement({ scenarioId, elementId, elementType: 'course' })
    }

    return () => {
      if (claimedLock.current) {
        unlockElement({ scenarioId, elementId, elementType: 'course' })
        claimedLock.current = false
      }
    }
  }, [elementId, lockElement, lockedByOther, scenarioId, unlockElement])

  const { mutate: saveDocument, isPending } = useMutation({
    mutationFn: () => scenariosApi.updateCourseDocument(scenarioId, syncCourseDocument(document)).then((response) => response.data),
    onSuccess: (nextDocument) => {
      setDocument(normalizeCourseDocument(nextDocument))
      toast.success('Course saved')
      qc.invalidateQueries({ queryKey: ['course-document', scenarioId] })
      qc.invalidateQueries({ queryKey: ['scenario', scenarioId] })
      broadcastScenarioEdit({ scenarioId, entityType: 'course', action: 'update' })
    },
    onError: () => toast.error('Failed to save course'),
  })

  const updateDocument = (updater: (current: CourseDocument) => CourseDocument) => {
    if (lockedByOther) return
    setDocument((current) => normalizeCourseDocument(updater(current)))
  }

  const updateSelectedLesson = (updater: (lesson: CourseLesson) => CourseLesson) => {
    if (!selectedLesson) return
    updateDocument((current) => ({
      ...current,
      lessons: (current.lessons ?? []).map((lesson) =>
        lesson.id === selectedLesson.id ? updater(lesson) : lesson,
      ),
    }))
  }

  const updateBlock = (blockId: string, updater: (block: CourseBlock) => CourseBlock) => {
    updateSelectedLesson((lesson) => ({
      ...lesson,
      blocks: lesson.blocks.map((block) => (block.id === blockId ? normalizeBlock(updater(block)) : block)),
    }))
  }

  const addSection = () => {
    updateDocument((current) => ({
      ...current,
      sections: [...(current.sections ?? []), { id: uid('section'), title: 'New section', lessonIds: [] }],
    }))
  }

  const addLesson = (type: CourseLessonType, sectionId?: string) => {
    const lesson = createLesson(type)
    updateDocument((current) => {
      const targetSectionId = sectionId ?? current.sections?.[0]?.id
      const sections = current.sections?.length
        ? current.sections.map((section) =>
            section.id === targetSectionId
              ? { ...section, lessonIds: [...section.lessonIds, lesson.id] }
              : section,
          )
        : [{ id: uid('section'), title: 'Course content', lessonIds: [lesson.id] }]

      return {
        ...current,
        lessons: [...(current.lessons ?? []), lesson],
        sections,
      }
    })
    setSelectedLessonId(lesson.id)
    setSelectedBlockId(null)
  }

  const deleteLesson = (lessonId: string) => {
    if (lessons.length <= 1) return
    updateDocument((current) => {
      const nextLessons = (current.lessons ?? []).filter((lesson) => lesson.id !== lessonId)
      return {
        ...current,
        lessons: nextLessons,
        sections: (current.sections ?? []).map((section) => ({
          ...section,
          lessonIds: section.lessonIds.filter((id) => id !== lessonId),
        })),
      }
    })
    if (selectedLessonId === lessonId) {
      const next = lessons.find((lesson) => lesson.id !== lessonId)
      setSelectedLessonId(next?.id ?? '')
      setSelectedBlockId(null)
    }
  }

  const duplicateLesson = (lesson: CourseLesson, sectionId: string) => {
    const clone: CourseLesson = {
      ...lesson,
      id: uid('lesson'),
      title: `${lesson.title} copy`,
      blocks: lesson.blocks.map((block) => ({ ...block, id: uid('block') })),
      quiz: lesson.quiz
        ? {
            ...lesson.quiz,
            questions: lesson.quiz.questions.map((question) => ({
              ...question,
              id: uid('question'),
              options: question.options.map((option) => ({ ...option, id: uid('option') })),
            })),
          }
        : undefined,
    }

    updateDocument((current) => ({
      ...current,
      lessons: [...(current.lessons ?? []), clone],
      sections: (current.sections ?? []).map((section) =>
        section.id === sectionId ? { ...section, lessonIds: [...section.lessonIds, clone.id] } : section,
      ),
    }))
    setSelectedLessonId(clone.id)
    setSelectedBlockId(null)
  }

  const moveLesson = (sectionId: string, lessonId: string, direction: -1 | 1) => {
    updateDocument((current) => ({
      ...current,
      sections: (current.sections ?? []).map((section) => {
        if (section.id !== sectionId) return section
        const index = section.lessonIds.indexOf(lessonId)
        const nextIndex = index + direction
        if (index < 0 || nextIndex < 0 || nextIndex >= section.lessonIds.length) return section
        const nextIds = [...section.lessonIds]
        const [item] = nextIds.splice(index, 1)
        nextIds.splice(nextIndex, 0, item)
        return { ...section, lessonIds: nextIds }
      }),
    }))
  }

  const addBlock = (type: CourseBlockType) => {
    if (!selectedLesson || selectedLesson.type === 'quiz') return
    const block = createBlock(type)
    updateSelectedLesson((lesson) => ({ ...lesson, blocks: [...lesson.blocks, block] }))
    setSelectedBlockId(block.id)
    setInspectorTab('blocks')
  }

  const duplicateBlock = (block: CourseBlock) => {
    const clone = normalizeBlock({
      ...block,
      id: uid('block'),
      items: block.items?.map((item) => ({ ...item, id: uid('item') })),
      knowledgeCheck: block.knowledgeCheck
        ? {
            ...block.knowledgeCheck,
            options: block.knowledgeCheck.options.map((option) => ({ ...option, id: uid('option') })),
          }
        : undefined,
    })
    updateSelectedLesson((lesson) => {
      const index = lesson.blocks.findIndex((item) => item.id === block.id)
      const nextBlocks = [...lesson.blocks]
      nextBlocks.splice(index + 1, 0, clone)
      return { ...lesson, blocks: nextBlocks }
    })
    setSelectedBlockId(clone.id)
  }

  const deleteBlock = (blockId: string) => {
    updateSelectedLesson((lesson) => ({ ...lesson, blocks: lesson.blocks.filter((block) => block.id !== blockId) }))
    if (selectedBlockId === blockId) setSelectedBlockId(null)
  }

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    updateSelectedLesson((lesson) => {
      const index = lesson.blocks.findIndex((block) => block.id === blockId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= lesson.blocks.length) return lesson
      const nextBlocks = [...lesson.blocks]
      const [block] = nextBlocks.splice(index, 1)
      nextBlocks.splice(nextIndex, 0, block)
      return { ...lesson, blocks: nextBlocks }
    })
  }

  const handleCursor = (field: string) => {
    if (lockedByOther) return
    broadcastCursor({ scenarioId, elementId, elementType: 'course', field })
  }

  const clearCursor = () => {
    broadcastCursor({ scenarioId, elementId, elementType: 'course' })
  }

  const cursorLabel = remoteCursors
    .map((cursor) => {
      const name = [cursor.user?.firstName, cursor.user?.lastName].filter(Boolean).join(' ') || cursor.user?.email || 'Someone'
      return cursor.field ? `${name}: ${cursor.field}` : null
    })
    .filter(Boolean)
    .join(', ')

  const updateTheme = (patch: Partial<CourseTheme>) => {
    updateDocument((current) => ({ ...current, theme: { ...defaultTheme, ...current.theme, ...patch } }))
  }

  const updatePublish = (patch: Partial<CoursePublishSettings>) => {
    updateDocument((current) => ({ ...current, publish: { ...defaultPublish, ...current.publish, ...patch } }))
  }

  const handleMediaSelect = (asset: MediaAsset) => {
    if (!selectedBlock) return
    updateBlock(selectedBlock.id, (block) => ({ ...block, assetUrl: asset.url }))
  }

  return (
    <div className="flex h-full min-h-0 overflow-x-auto bg-[#111318] lux-scrollbar">
      <CourseOutline
        document={document}
        selectedLessonId={selectedLesson?.id ?? ''}
        locked={lockedByOther}
        onSelectLesson={(lessonId) => {
          setSelectedLessonId(lessonId)
          setSelectedBlockId(null)
        }}
        onAddSection={addSection}
        onAddLesson={addLesson}
        onUpdateDocument={updateDocument}
        onDeleteLesson={deleteLesson}
        onDuplicateLesson={duplicateLesson}
        onMoveLesson={moveLesson}
      />

      <main className="flex min-w-0 flex-1 flex-col border-r border-white/7">
        {lockedByOther && (
          <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
            <Lock size={13} />
            <span>{courseLock?.user.firstName ?? courseLock?.user.email ?? 'Another collaborator'} is editing this course.</span>
          </div>
        )}
        {!lockedByOther && cursorLabel && (
          <div className="flex items-center gap-2 border-b border-[#0F6B4A]/25 bg-[#0F6B4A]/10 px-4 py-2 text-xs text-[#83BFA1]">
            <MousePointer2 size={13} />
            <span>{cursorLabel}</span>
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/7 bg-[#0d0f17] px-3 py-2 lux-scrollbar">
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
            {(['build', 'preview'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMode(tab)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  mode === tab ? 'bg-[#0F6B4A] text-[#FFF8EC]' : 'text-slate-500 hover:text-slate-200',
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {mode === 'preview' && (
            <div className="ml-1 flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
              {[
                { id: 'desktop' as PreviewDevice, icon: Monitor },
                { id: 'tablet' as PreviewDevice, icon: Tablet },
                { id: 'phone' as PreviewDevice, icon: Phone },
              ].map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreviewDevice(id)}
                  className={cn(
                    'grid h-7 w-8 place-items-center rounded-lg transition-colors',
                    previewDevice === id ? 'bg-[#0F6B4A] text-[#FFF8EC]' : 'text-slate-500 hover:text-slate-200',
                  )}
                  title={id}
                >
                  <Icon size={13} />
                </button>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-slate-500 lg:inline">
              {lessons.length} lessons / {lessons.reduce((sum, lesson) => sum + lesson.blocks.length, 0)} blocks
            </span>
            <Button size="sm" onClick={() => saveDocument()} loading={isPending} disabled={lockedByOther}>
              <Save size={13} className="mr-1" /> Save
            </Button>
          </div>
        </div>

        {selectedLesson ? (
          mode === 'build' ? (
            <LessonCanvas
              lesson={selectedLesson}
              selectedBlockId={selectedBlockId}
              locked={lockedByOther}
              onSelectBlock={setSelectedBlockId}
              onUpdateLesson={updateSelectedLesson}
              onUpdateBlock={updateBlock}
              onAddBlock={addBlock}
              onDuplicateBlock={duplicateBlock}
              onDeleteBlock={deleteBlock}
              onMoveBlock={moveBlock}
              onFocusField={handleCursor}
              onBlurField={clearCursor}
            />
          ) : (
            <CoursePreview
              document={document}
              lesson={selectedLesson}
              device={previewDevice}
            />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Select a lesson.
          </div>
        )}
      </main>

      <CourseInspector
        tab={inspectorTab}
        onTabChange={setInspectorTab}
        document={document}
        selectedLesson={selectedLesson}
        selectedBlock={selectedBlock}
        locked={lockedByOther}
        onUpdateDocument={updateDocument}
        onUpdateTheme={updateTheme}
        onUpdatePublish={updatePublish}
        onAddBlock={addBlock}
        onUpdateBlock={updateBlock}
        onOpenMediaPicker={() => setMediaPickerOpen(true)}
      />

      {mediaPickerOpen && selectedBlock && (
        <MediaPicker
          open={mediaPickerOpen}
          onClose={() => setMediaPickerOpen(false)}
          acceptedTypes={mediaTypesForBlock(selectedBlock.type)}
          onSelect={handleMediaSelect}
        />
      )}
    </div>
  )
}

function CourseOutline({
  document,
  selectedLessonId,
  locked,
  onSelectLesson,
  onAddSection,
  onAddLesson,
  onUpdateDocument,
  onDeleteLesson,
  onDuplicateLesson,
  onMoveLesson,
}: {
  document: CourseDocument
  selectedLessonId: string
  locked: boolean
  onSelectLesson: (lessonId: string) => void
  onAddSection: () => void
  onAddLesson: (type: CourseLessonType, sectionId?: string) => void
  onUpdateDocument: (updater: (current: CourseDocument) => CourseDocument) => void
  onDeleteLesson: (lessonId: string) => void
  onDuplicateLesson: (lesson: CourseLesson, sectionId: string) => void
  onMoveLesson: (sectionId: string, lessonId: string, direction: -1 | 1) => void
}) {
  const lessonsById = new Map((document.lessons ?? []).map((lesson) => [lesson.id, lesson]))

  return (
    <aside className="flex min-h-0 w-72 shrink-0 flex-col border-r border-white/7 bg-[#0d0f17]">
      <div className="border-b border-white/7 p-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0F6B4A]/20 text-[#83BFA1]">
            <BookOpen size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{document.title}</p>
            <p className="text-[11px] text-slate-500">Course outline</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 lux-scrollbar">
        {(document.sections ?? []).map((section) => (
          <div key={section.id} className="mb-3">
            <div className="group flex items-center gap-2 px-2 py-1.5">
              <Input
                id={`section-${section.id}`}
                value={section.title}
                disabled={locked}
                onChange={(event) =>
                  onUpdateDocument((current) => ({
                    ...current,
                    sections: (current.sections ?? []).map((item) =>
                      item.id === section.id ? { ...item, title: event.target.value } : item,
                    ),
                  }))
                }
                className="h-8 rounded-lg text-xs font-semibold uppercase"
              />
              <button
                type="button"
                disabled={locked}
                onClick={() => onAddLesson('lesson', section.id)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white/8 hover:text-[#83BFA1] disabled:cursor-not-allowed disabled:opacity-50"
                title="Add lesson"
              >
                <Plus size={13} />
              </button>
            </div>

            <div className="space-y-1">
              {section.lessonIds.map((lessonId, index) => {
                const lesson = lessonsById.get(lessonId)
                if (!lesson) return null
                const active = selectedLessonId === lesson.id

                return (
                  <div
                    key={lesson.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-lg border px-2 py-2 transition-colors',
                      active
                        ? 'border-[#0F6B4A]/50 bg-[#0F6B4A]/18 text-[#83BFA1]'
                        : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectLesson(lesson.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/8 text-[10px]">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{lesson.title}</span>
                        <span className="block text-[10px] text-slate-600">{lesson.type === 'quiz' ? 'Quiz' : `${lesson.blocks.length} blocks`}</span>
                      </span>
                    </button>
                    <div className="hidden items-center gap-0.5 group-hover:flex">
                      <button type="button" disabled={locked} onClick={() => onMoveLesson(section.id, lesson.id, -1)} className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-30">
                        <ArrowUp size={11} />
                      </button>
                      <button type="button" disabled={locked} onClick={() => onMoveLesson(section.id, lesson.id, 1)} className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-30">
                        <ArrowDown size={11} />
                      </button>
                      <button type="button" disabled={locked} onClick={() => onDuplicateLesson(lesson, section.id)} className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-30">
                        <Copy size={11} />
                      </button>
                      <button type="button" disabled={locked} onClick={() => onDeleteLesson(lesson.id)} className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-30">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1 border-t border-white/7 p-2">
        <Button size="sm" variant="secondary" disabled={locked} onClick={() => onAddLesson('lesson')}>
          <Plus size={12} className="mr-1" /> Lesson
        </Button>
        <Button size="sm" variant="secondary" disabled={locked} onClick={() => onAddLesson('quiz')}>
          <HelpCircle size={12} className="mr-1" /> Quiz
        </Button>
        <Button size="sm" variant="secondary" disabled={locked} onClick={onAddSection}>
          <Layers size={12} className="mr-1" /> Section
        </Button>
      </div>
    </aside>
  )
}

function LessonCanvas({
  lesson,
  selectedBlockId,
  locked,
  onSelectBlock,
  onUpdateLesson,
  onUpdateBlock,
  onAddBlock,
  onDuplicateBlock,
  onDeleteBlock,
  onMoveBlock,
  onFocusField,
  onBlurField,
}: {
  lesson: CourseLesson
  selectedBlockId: string | null
  locked: boolean
  onSelectBlock: (blockId: string | null) => void
  onUpdateLesson: (updater: (lesson: CourseLesson) => CourseLesson) => void
  onUpdateBlock: (blockId: string, updater: (block: CourseBlock) => CourseBlock) => void
  onAddBlock: (type: CourseBlockType) => void
  onDuplicateBlock: (block: CourseBlock) => void
  onDeleteBlock: (blockId: string) => void
  onMoveBlock: (blockId: string, direction: -1 | 1) => void
  onFocusField: (field: string) => void
  onBlurField: () => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto lux-scrollbar">
      <div className="mx-auto w-full max-w-4xl px-5 py-5">
        <div className="rounded-lg border border-white/10 bg-white/4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
            <Input
              id="lesson-title"
              label={lesson.type === 'quiz' ? 'Quiz title' : 'Lesson title'}
              value={lesson.title}
              disabled={locked}
              onFocus={() => onFocusField('lesson title')}
              onBlur={onBlurField}
              onChange={(event) => onUpdateLesson((current) => ({ ...current, title: event.target.value }))}
            />
            <Input
              id="lesson-estimate"
              label="Minutes"
              type="number"
              value={String(lesson.estimatedMinutes ?? '')}
              disabled={locked}
              onChange={(event) =>
                onUpdateLesson((current) => ({
                  ...current,
                  estimatedMinutes: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
            />
          </div>
          <div className="mt-3">
            <label className="text-sm font-medium text-slate-300">Summary</label>
            <textarea
              value={lesson.summary ?? ''}
              disabled={locked}
              onFocus={() => onFocusField('lesson summary')}
              onBlur={onBlurField}
              onChange={(event) => onUpdateLesson((current) => ({ ...current, summary: event.target.value }))}
              rows={3}
              className={cn(textareaClass, 'mt-1')}
            />
          </div>
        </div>

        {lesson.type === 'quiz' ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/4 p-4">
            <QuizEditor
              quiz={lesson.quiz ?? { passingScore: 80, questions: [createQuestion()] }}
              locked={locked}
              onChange={(quiz) => onUpdateLesson((current) => ({ ...current, quiz }))}
            />
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/4 p-2">
              {blockLibrary.slice(0, 12).map((definition) => {
                const Icon = definition.icon
                return (
                  <button
                    key={definition.type}
                    type="button"
                    disabled={locked}
                    onClick={() => onAddBlock(definition.type)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon size={12} />
                    {definition.label}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 space-y-3">
              {lesson.blocks.map((block, index) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  index={index}
                  selected={selectedBlockId === block.id}
                  locked={locked}
                  onSelect={() => onSelectBlock(block.id)}
                  onUpdate={(updater) => onUpdateBlock(block.id, updater)}
                  onDuplicate={() => onDuplicateBlock(block)}
                  onDelete={() => onDeleteBlock(block.id)}
                  onMove={(direction) => onMoveBlock(block.id, direction)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-dashed border-white/12 p-3">
              <BlockPalette compact onAddBlock={onAddBlock} locked={locked} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BlockEditor({
  block,
  index,
  selected,
  locked,
  onSelect,
  onUpdate,
  onDuplicate,
  onDelete,
  onMove,
}: {
  block: CourseBlock
  index: number
  selected: boolean
  locked: boolean
  onSelect: () => void
  onUpdate: (updater: (block: CourseBlock) => CourseBlock) => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const definition = definitionFor(block.type)
  const Icon = definition.icon

  return (
    <section
      onClick={onSelect}
      className={cn(
        'rounded-lg border bg-white/4 transition-colors',
        selected ? 'border-[#0F6B4A]/60 ring-2 ring-[#0F6B4A]/15' : 'border-white/10 hover:border-white/20',
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/7 px-3 py-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/8 text-[#83BFA1]">
          <Icon size={13} />
        </span>
        <span className="text-xs font-semibold text-slate-200">{definition.label}</span>
        <span className="text-[10px] uppercase text-slate-600">Block {index + 1}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" disabled={locked} onClick={(event) => { event.stopPropagation(); onMove(-1) }} className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-30">
            <ArrowUp size={12} />
          </button>
          <button type="button" disabled={locked} onClick={(event) => { event.stopPropagation(); onMove(1) }} className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-30">
            <ArrowDown size={12} />
          </button>
          <button type="button" disabled={locked} onClick={(event) => { event.stopPropagation(); onDuplicate() }} className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-30">
            <Copy size={12} />
          </button>
          <button type="button" disabled={locked} onClick={(event) => { event.stopPropagation(); onDelete() }} className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-30">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="p-3">
        <BlockInlineBody block={block} locked={locked} onUpdate={onUpdate} />
      </div>
    </section>
  )
}

function BlockInlineBody({
  block,
  locked,
  onUpdate,
}: {
  block: CourseBlock
  locked: boolean
  onUpdate: (updater: (block: CourseBlock) => CourseBlock) => void
}) {
  if (block.type === 'divider') {
    return <div className="h-px bg-white/12" />
  }

  if (block.type === 'spacer') {
    return <div className="rounded-lg border border-dashed border-white/12 py-5 text-center text-xs text-slate-600">Spacer</div>
  }

  if (block.type === 'knowledge_check') {
    return (
      <div className="space-y-2">
        <Input
          id={`${block.id}-question`}
          value={block.knowledgeCheck?.question ?? ''}
          disabled={locked}
          onChange={(event) =>
            onUpdate((current) => ({
              ...current,
              knowledgeCheck: { ...(current.knowledgeCheck ?? createKnowledgeCheck()), question: event.target.value },
            }))
          }
        />
        <p className="text-xs text-slate-500">{block.knowledgeCheck?.options.length ?? 0} answer options</p>
      </div>
    )
  }

  if (isInteractionBlock(block.type)) {
    return (
      <div className="space-y-2">
        <Input
          id={`${block.id}-title`}
          value={block.title ?? ''}
          disabled={locked}
          onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))}
        />
        <p className="text-xs text-slate-500">{(block.items ?? []).length} items configured</p>
      </div>
    )
  }

  if (['image', 'video', 'audio', 'attachment'].includes(block.type)) {
    return (
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Input
          id={`${block.id}-title`}
          value={block.title ?? ''}
          disabled={locked}
          onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))}
        />
        <Input
          id={`${block.id}-asset`}
          value={block.assetUrl ?? block.content ?? ''}
          disabled={locked}
          onChange={(event) => onUpdate((current) => ({ ...current, assetUrl: event.target.value, content: event.target.value }))}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Input
        id={`${block.id}-title`}
        value={block.title ?? ''}
        disabled={locked}
        onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))}
      />
      <textarea
        rows={block.type === 'heading' ? 2 : 4}
        value={block.content ?? ''}
        disabled={locked}
        onChange={(event) => onUpdate((current) => ({ ...current, content: event.target.value }))}
        className={textareaClass}
      />
    </div>
  )
}

function CourseInspector({
  tab,
  onTabChange,
  document,
  selectedLesson,
  selectedBlock,
  locked,
  onUpdateDocument,
  onUpdateTheme,
  onUpdatePublish,
  onAddBlock,
  onUpdateBlock,
  onOpenMediaPicker,
}: {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  document: CourseDocument
  selectedLesson?: CourseLesson
  selectedBlock: CourseBlock | null
  locked: boolean
  onUpdateDocument: (updater: (current: CourseDocument) => CourseDocument) => void
  onUpdateTheme: (patch: Partial<CourseTheme>) => void
  onUpdatePublish: (patch: Partial<CoursePublishSettings>) => void
  onAddBlock: (type: CourseBlockType) => void
  onUpdateBlock: (blockId: string, updater: (block: CourseBlock) => CourseBlock) => void
  onOpenMediaPicker: () => void
}) {
  return (
    <aside className="flex min-h-0 w-80 shrink-0 flex-col bg-[#0d0f17]">
      <div className="grid grid-cols-4 border-b border-white/7">
        {([
          ['blocks', Layers],
          ['theme', Pencil],
          ['settings', Settings],
          ['publish', Flag],
        ] as [InspectorTab, ElementType][]).map(([item, Icon]) => (
          <button
            key={item}
            type="button"
            onClick={() => onTabChange(item)}
            className={cn(
              'flex items-center justify-center gap-1 border-b-2 px-2 py-2 text-[11px] font-semibold capitalize transition-colors',
              tab === item
                ? 'border-[#0F6B4A] text-[#83BFA1]'
                : 'border-transparent text-slate-500 hover:text-slate-300',
            )}
          >
            <Icon size={12} />
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 lux-scrollbar">
        {tab === 'blocks' && (
          <div className="space-y-4">
            <BlockPalette onAddBlock={onAddBlock} locked={locked || selectedLesson?.type === 'quiz'} />
            {selectedBlock ? (
              <BlockInspector
                block={selectedBlock}
                locked={locked}
                onChange={(nextBlock) => onUpdateBlock(selectedBlock.id, () => nextBlock)}
                onOpenMediaPicker={onOpenMediaPicker}
              />
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/4 p-3 text-xs text-slate-500">
                Select a block to edit layout, media, interaction items, feedback, and tracking.
              </div>
            )}
          </div>
        )}

        {tab === 'theme' && (
          <ThemeInspector theme={document.theme ?? defaultTheme} locked={locked} onChange={onUpdateTheme} />
        )}

        {tab === 'settings' && (
          <SettingsInspector document={document} locked={locked} onUpdateDocument={onUpdateDocument} />
        )}

        {tab === 'publish' && (
          <PublishInspector publish={document.publish ?? defaultPublish} locked={locked} onChange={onUpdatePublish} />
        )}
      </div>
    </aside>
  )
}

function BlockPalette({
  onAddBlock,
  locked,
  compact = false,
}: {
  onAddBlock: (type: CourseBlockType) => void
  locked: boolean
  compact?: boolean
}) {
  const grouped = useMemo(() => {
    return blockLibrary.reduce<Record<CourseBlockCategory, BlockDefinition[]>>((acc, block) => {
      acc[block.category] = [...(acc[block.category] ?? []), block]
      return acc
    }, {} as Record<CourseBlockCategory, BlockDefinition[]>)
  }, [])

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {(Object.keys(grouped) as CourseBlockCategory[]).map((category) => (
        <div key={category}>
          {!compact && <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">{categoryLabels[category]}</p>}
          <div className={cn('grid gap-1', compact ? 'grid-cols-4 sm:grid-cols-6' : 'grid-cols-2')}>
            {grouped[category].map((block) => {
              const Icon = block.icon
              return (
                <button
                  key={block.type}
                  type="button"
                  disabled={locked}
                  onClick={() => onAddBlock(block.type)}
                  className="flex min-h-9 items-center gap-2 rounded-lg border border-white/8 bg-white/4 px-2 py-2 text-left text-[11px] font-medium text-slate-400 transition-colors hover:border-[#0F6B4A]/40 hover:bg-[#0F6B4A]/12 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon size={13} className="shrink-0 text-[#83BFA1]" />
                  <span className="truncate">{block.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function BlockInspector({
  block,
  locked,
  onChange,
  onOpenMediaPicker,
}: {
  block: CourseBlock
  locked: boolean
  onChange: (block: CourseBlock) => void
  onOpenMediaPicker: () => void
}) {
  const updateMetadata = (patch: Record<string, unknown>) => {
    onChange({ ...block, metadata: { ...block.metadata, ...patch } })
  }

  const changeType = (type: CourseBlockType) => {
    const next = createBlock(type)
    onChange({
      ...next,
      id: block.id,
      title: block.title || next.title,
      content: block.content || next.content,
      assetUrl: block.assetUrl || next.assetUrl,
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-white/4 p-3">
      <div>
        <label className="text-sm font-medium text-slate-300">Block type</label>
        <select value={block.type} disabled={locked} onChange={(event) => changeType(event.target.value as CourseBlockType)} className={cn(selectClass, 'mt-1')}>
          {blockLibrary.map((item) => (
            <option key={item.type} value={item.type}>{item.label}</option>
          ))}
        </select>
      </div>

      <Input
        id="block-inspector-title"
        label="Title"
        value={block.title ?? ''}
        disabled={locked}
        onChange={(event) => onChange({ ...block, title: event.target.value })}
      />

      {!['divider', 'spacer', 'knowledge_check'].includes(block.type) && (
        <div>
          <label className="text-sm font-medium text-slate-300">Content</label>
          <textarea
            value={block.content ?? ''}
            disabled={locked}
            onChange={(event) => onChange({ ...block, content: event.target.value })}
            rows={4}
            className={cn(textareaClass, 'mt-1')}
          />
        </div>
      )}

      {['image', 'video', 'audio', 'attachment', 'labeled_graphic'].includes(block.type) && (
        <div className="space-y-2">
          <Input
            id="block-asset"
            label="Media URL"
            value={block.assetUrl ?? block.content ?? ''}
            disabled={locked}
            onChange={(event) => onChange({ ...block, assetUrl: event.target.value })}
          />
          <Button size="sm" variant="secondary" disabled={locked} onClick={onOpenMediaPicker}>
            <Library size={13} className="mr-1" /> Library
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-slate-400">Width</label>
          <select value={metadataString(block, 'width', 'normal')} disabled={locked} onChange={(event) => updateMetadata({ width: event.target.value })} className={cn(selectClass, 'mt-1')}>
            <option value="narrow">Narrow</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
            <option value="full">Full</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400">Align</label>
          <select value={metadataString(block, 'align', 'left')} disabled={locked} onChange={(event) => updateMetadata({ align: event.target.value })} className={cn(selectClass, 'mt-1')}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          id="block-background"
          label="Background"
          value={metadataString(block, 'background', '')}
          disabled={locked}
          placeholder="#182420"
          onChange={(event) => updateMetadata({ background: event.target.value })}
        />
        <Input
          id="block-padding"
          label="Padding"
          type="number"
          value={String(metadataNumber(block, 'padding', 24))}
          disabled={locked}
          onChange={(event) => updateMetadata({ padding: Number(event.target.value) })}
        />
      </div>

      {isInteractionBlock(block.type) && (
        <ItemsEditor
          type={block.type}
          items={block.items ?? []}
          locked={locked}
          onChange={(items) => onChange({ ...block, items, metadata: { ...block.metadata, items } })}
        />
      )}

      {block.type === 'knowledge_check' && (
        <KnowledgeCheckEditor
          value={block.knowledgeCheck ?? createKnowledgeCheck()}
          locked={locked}
          onChange={(knowledgeCheck) => onChange({ ...block, knowledgeCheck, metadata: { ...block.metadata, knowledgeCheck } })}
        />
      )}

      {block.type === 'spacer' && (
        <Input
          id="spacer-height"
          label="Height"
          type="number"
          value={String(metadataNumber(block, 'height', 48))}
          disabled={locked}
          onChange={(event) => updateMetadata({ height: Number(event.target.value) })}
        />
      )}
    </div>
  )
}

function ItemsEditor({
  type,
  items,
  locked,
  onChange,
}: {
  type: CourseBlockType
  items: CourseInteractionItem[]
  locked: boolean
  onChange: (items: CourseInteractionItem[]) => void
}) {
  const addItem = () => onChange([...items, { id: uid('item'), title: 'New item', content: '' }])
  const updateItem = (id: string, patch: Partial<CourseInteractionItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const removeItem = (id: string) => onChange(items.filter((item) => item.id !== id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-slate-500">Items</p>
        <button type="button" disabled={locked} onClick={addItem} className="text-xs font-semibold text-[#83BFA1] disabled:opacity-40">
          Add
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-lg border border-white/10 bg-white/4 p-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-600">{index + 1}</span>
              <input
                value={item.title}
                disabled={locked}
                placeholder={type === 'flashcards' ? 'Front side' : 'Title'}
                onChange={(event) => updateItem(item.id, { title: event.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100 outline-none focus:border-[#0F6B4A]"
              />
              <button type="button" disabled={locked} onClick={() => removeItem(item.id)} className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-40">
                <Trash2 size={11} />
              </button>
            </div>
            <textarea
              value={item.content ?? ''}
              disabled={locked}
              onChange={(event) => updateItem(item.id, { content: event.target.value })}
              rows={2}
              placeholder={type === 'sorting' ? 'Category or target' : type === 'flashcards' ? 'Back side (revealed on flip)' : 'Content'}
              className={cn(textareaClass, 'mt-2 text-xs')}
            />
            {(type === 'gallery' || type === 'labeled_graphic') && (
              <Input
                id={`${item.id}-media`}
                value={item.mediaUrl ?? ''}
                disabled={locked}
                placeholder="Media URL"
                onChange={(event) => updateItem(item.id, { mediaUrl: event.target.value })}
                className="mt-2 h-8 text-xs"
              />
            )}
            {type === 'labeled_graphic' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  id={`${item.id}-x`}
                  value={String(item.marker?.x ?? 50)}
                  disabled={locked}
                  type="number"
                  onChange={(event) => updateItem(item.id, { marker: { x: Number(event.target.value), y: item.marker?.y ?? 50 } })}
                  className="h-8 text-xs"
                />
                <Input
                  id={`${item.id}-y`}
                  value={String(item.marker?.y ?? 50)}
                  disabled={locked}
                  type="number"
                  onChange={(event) => updateItem(item.id, { marker: { x: item.marker?.x ?? 50, y: Number(event.target.value) } })}
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function KnowledgeCheckEditor({
  value,
  locked,
  onChange,
}: {
  value: CourseKnowledgeCheck
  locked: boolean
  onChange: (value: CourseKnowledgeCheck) => void
}) {
  const updateOption = (id: string, patch: Partial<CourseKnowledgeCheckOption>) =>
    onChange({ ...value, options: value.options.map((option) => (option.id === id ? { ...option, ...patch } : option)) })

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium text-slate-300">Question type</label>
        <select value={value.type} disabled={locked} onChange={(event) => onChange({ ...value, type: event.target.value as CourseKnowledgeCheck['type'] })} className={cn(selectClass, 'mt-1')}>
          <option value="multiple_choice">Multiple choice</option>
          <option value="multiple_response">Multiple response</option>
          <option value="fill_blank">Fill blank</option>
          <option value="matching">Matching</option>
        </select>
      </div>
      <Input
        id="kc-question"
        label="Question"
        value={value.question}
        disabled={locked}
        onChange={(event) => onChange({ ...value, question: event.target.value })}
      />
      <div className="space-y-2">
        {value.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 p-2 text-xs text-slate-300">
            <input
              type={value.type === 'multiple_response' ? 'checkbox' : 'radio'}
              checked={option.isCorrect}
              disabled={locked}
              onChange={(event) => updateOption(option.id, { isCorrect: event.target.checked })}
            />
            <input
              value={option.text}
              disabled={locked}
              onChange={(event) => updateOption(option.id, { text: event.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-100 outline-none focus:border-[#0F6B4A]"
            />
          </label>
        ))}
        <button
          type="button"
          disabled={locked}
          onClick={() => onChange({ ...value, options: [...value.options, { id: uid('option'), text: 'New option', isCorrect: false }] })}
          className="text-xs font-semibold text-[#83BFA1] disabled:opacity-40"
        >
          Add option
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          id="kc-correct"
          label="Correct"
          value={value.correctFeedback ?? ''}
          disabled={locked}
          onChange={(event) => onChange({ ...value, correctFeedback: event.target.value })}
        />
        <Input
          id="kc-incorrect"
          label="Incorrect"
          value={value.incorrectFeedback ?? ''}
          disabled={locked}
          onChange={(event) => onChange({ ...value, incorrectFeedback: event.target.value })}
        />
      </div>
    </div>
  )
}

function QuizEditor({
  quiz,
  locked,
  onChange,
}: {
  quiz: DraftQuiz
  locked: boolean
  onChange: (quiz: DraftQuiz) => void
}) {
  const updateQuestion = (id: string, updater: (question: CourseQuizQuestion) => CourseQuizQuestion) => {
    onChange({
      ...quiz,
      questions: quiz.questions.map((question) => (question.id === id ? updater(question) : question)),
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Input
          id="quiz-pass"
          label="Passing score"
          type="number"
          value={String(quiz.passingScore)}
          disabled={locked}
          onChange={(event) => onChange({ ...quiz, passingScore: Number(event.target.value) })}
        />
        <Input
          id="quiz-time"
          label="Time limit"
          type="number"
          value={String(quiz.timeLimitMinutes ?? '')}
          disabled={locked}
          onChange={(event) => onChange({ ...quiz, timeLimitMinutes: event.target.value ? Number(event.target.value) : undefined })}
        />
        <Input
          id="quiz-attempts"
          label="Attempts"
          type="number"
          value={String(quiz.attempts ?? '')}
          disabled={locked}
          onChange={(event) => onChange({ ...quiz, attempts: event.target.value ? Number(event.target.value) : undefined })}
        />
        <label className="flex items-end gap-2 pb-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={quiz.showFeedback ?? true}
            disabled={locked}
            onChange={(event) => onChange({ ...quiz, showFeedback: event.target.checked })}
          />
          Feedback
        </label>
      </div>

      <div className="space-y-3">
        {quiz.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            question={question}
            index={index}
            locked={locked}
            onChange={(nextQuestion) => updateQuestion(question.id, () => nextQuestion)}
            onDelete={() => onChange({ ...quiz, questions: quiz.questions.filter((item) => item.id !== question.id) })}
          />
        ))}
      </div>

      <Button
        size="sm"
        variant="secondary"
        disabled={locked}
        onClick={() => onChange({ ...quiz, questions: [...quiz.questions, createQuestion()] })}
      >
        <Plus size={13} className="mr-1" /> Add question
      </Button>
    </div>
  )
}

function QuestionEditor({
  question,
  index,
  locked,
  onChange,
  onDelete,
}: {
  question: CourseQuizQuestion
  index: number
  locked: boolean
  onChange: (question: CourseQuizQuestion) => void
  onDelete: () => void
}) {
  const updateOption = (id: string, patch: Partial<CourseQuizQuestionOption>) =>
    onChange({ ...question, options: question.options.map((option) => (option.id === id ? { ...option, ...patch } : option)) })

  return (
    <div className="rounded-lg border border-white/10 bg-white/4 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">Question {index + 1}</span>
        <button type="button" disabled={locked} onClick={onDelete} className="ml-auto p-1 text-slate-600 hover:text-red-400 disabled:opacity-40">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_90px]">
        <Input
          id={`${question.id}-text`}
          value={question.text}
          disabled={locked}
          onChange={(event) => onChange({ ...question, text: event.target.value })}
        />
        <select value={question.type} disabled={locked} onChange={(event) => onChange({ ...question, type: event.target.value as CourseQuizQuestion['type'] })} className={selectClass}>
          <option value="multiple_choice">Multiple choice</option>
          <option value="multiple_response">Multiple response</option>
          <option value="true_false">True/false</option>
          <option value="fill_blank">Fill blank</option>
          <option value="matching">Matching</option>
        </select>
        <Input
          id={`${question.id}-points`}
          type="number"
          value={String(question.points)}
          disabled={locked}
          onChange={(event) => onChange({ ...question, points: Number(event.target.value) })}
        />
      </div>
      <div className="mt-3 space-y-2">
        {question.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type={question.type === 'multiple_response' ? 'checkbox' : 'radio'}
              checked={option.isCorrect}
              disabled={locked}
              onChange={(event) => updateOption(option.id, { isCorrect: event.target.checked })}
            />
            <input
              value={option.text}
              disabled={locked}
              onChange={(event) => updateOption(option.id, { text: event.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-100 outline-none focus:border-[#0F6B4A]"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={locked}
        onClick={() => onChange({ ...question, options: [...question.options, { id: uid('option'), text: 'New option', isCorrect: false }] })}
        className="mt-2 text-xs font-semibold text-[#83BFA1] disabled:opacity-40"
      >
        Add option
      </button>
    </div>
  )
}

function ThemeInspector({
  theme,
  locked,
  onChange,
}: {
  theme: CourseTheme
  locked: boolean
  onChange: (patch: Partial<CourseTheme>) => void
}) {
  return (
    <div className="space-y-4">
      <Input
        id="theme-accent"
        label="Accent color"
        value={theme.accentColor}
        disabled={locked}
        onChange={(event) => onChange({ accentColor: event.target.value })}
      />
      <div>
        <label className="text-sm font-medium text-slate-300">Font pairing</label>
        <select value={theme.fontPairing} disabled={locked} onChange={(event) => onChange({ fontPairing: event.target.value as CourseTheme['fontPairing'] })} className={cn(selectClass, 'mt-1')}>
          <option value="modern">Modern</option>
          <option value="classic">Classic</option>
          <option value="serif">Serif</option>
          <option value="friendly">Friendly</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-300">Cover layout</label>
        <select value={theme.coverLayout} disabled={locked} onChange={(event) => onChange({ coverLayout: event.target.value as CourseTheme['coverLayout'] })} className={cn(selectClass, 'mt-1')}>
          <option value="centered">Centered</option>
          <option value="split">Split</option>
          <option value="compact">Compact</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-300">Navigation</label>
        <select value={theme.navigationMode} disabled={locked} onChange={(event) => onChange({ navigationMode: event.target.value as CourseTheme['navigationMode'] })} className={cn(selectClass, 'mt-1')}>
          <option value="sidebar">Sidebar</option>
          <option value="compact">Compact</option>
          <option value="continuous">Continuous</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={theme.lessonNumbers} disabled={locked} onChange={(event) => onChange({ lessonNumbers: event.target.checked })} />
        Lesson numbers
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={theme.sidebarEnabled} disabled={locked} onChange={(event) => onChange({ sidebarEnabled: event.target.checked })} />
        Sidebar
      </label>
      <Input
        id="theme-logo"
        label="Logo URL"
        value={theme.logoUrl ?? ''}
        disabled={locked}
        onChange={(event) => onChange({ logoUrl: event.target.value })}
      />
      <Input
        id="theme-cover"
        label="Cover image"
        value={theme.coverImageUrl ?? ''}
        disabled={locked}
        onChange={(event) => onChange({ coverImageUrl: event.target.value })}
      />
    </div>
  )
}

function SettingsInspector({
  document,
  locked,
  onUpdateDocument,
}: {
  document: CourseDocument
  locked: boolean
  onUpdateDocument: (updater: (current: CourseDocument) => CourseDocument) => void
}) {
  const objectivesText = (document.objectives ?? []).join('\n')

  return (
    <div className="space-y-4">
      <Input
        id="course-title"
        label="Course title"
        value={document.title}
        disabled={locked}
        onChange={(event) => onUpdateDocument((current) => ({ ...current, title: event.target.value }))}
      />
      <div>
        <label className="text-sm font-medium text-slate-300">Description</label>
        <textarea
          value={document.description ?? ''}
          disabled={locked}
          onChange={(event) => onUpdateDocument((current) => ({ ...current, description: event.target.value }))}
          rows={3}
          className={cn(textareaClass, 'mt-1')}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-300">Objectives</label>
        <textarea
          value={objectivesText}
          disabled={locked}
          onChange={(event) => onUpdateDocument((current) => ({
            ...current,
            objectives: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean),
          }))}
          rows={4}
          className={cn(textareaClass, 'mt-1')}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          id="course-minutes"
          label="Minutes"
          type="number"
          value={String(document.estimatedMinutes ?? '')}
          disabled={locked}
          onChange={(event) => onUpdateDocument((current) => ({ ...current, estimatedMinutes: event.target.value ? Number(event.target.value) : undefined }))}
        />
        <Input
          id="course-pass"
          label="Passing score"
          type="number"
          value={String(document.settings.passingScore)}
          disabled={locked}
          onChange={(event) => onUpdateDocument((current) => ({ ...current, settings: { ...current.settings, passingScore: Number(event.target.value) } }))}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-300">Completion mode</label>
        <select
          value={document.settings.completionMode}
          disabled={locked}
          onChange={(event) => onUpdateDocument((current) => ({ ...current, settings: { ...current.settings, completionMode: event.target.value as 'pages' | 'score' } }))}
          className={cn(selectClass, 'mt-1')}
        >
          <option value="pages">Lesson completion</option>
          <option value="score">Score</option>
        </select>
      </div>
    </div>
  )
}

function PublishInspector({
  publish,
  locked,
  onChange,
}: {
  publish: CoursePublishSettings
  locked: boolean
  onChange: (patch: Partial<CoursePublishSettings>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-slate-300">Target</label>
        <select value={publish.target} disabled={locked} onChange={(event) => onChange({ target: event.target.value as CoursePublishSettings['target'] })} className={cn(selectClass, 'mt-1')}>
          <option value="lms">LMS</option>
          <option value="web">Web</option>
          <option value="pdf">PDF</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-300">LMS standard</label>
        <select value={publish.lmsStandard} disabled={locked} onChange={(event) => onChange({ lmsStandard: event.target.value as CoursePublishSettings['lmsStandard'] })} className={cn(selectClass, 'mt-1')}>
          <option value="scorm_1_2">SCORM 1.2</option>
          <option value="scorm_2004">SCORM 2004</option>
          <option value="xapi">xAPI</option>
          <option value="cmi5">cmi5</option>
          <option value="aicc">AICC</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-300">Tracking</label>
        <select value={publish.tracking} disabled={locked} onChange={(event) => onChange({ tracking: event.target.value as CoursePublishSettings['tracking'] })} className={cn(selectClass, 'mt-1')}>
          <option value="completion">Completion</option>
          <option value="quiz_score">Quiz score</option>
          <option value="completion_and_score">Completion and score</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          id="publish-completion"
          label="Completion %"
          type="number"
          value={String(publish.completionPercentage)}
          disabled={locked}
          onChange={(event) => onChange({ completionPercentage: Number(event.target.value) })}
        />
        <Input
          id="publish-score"
          label="Passing score"
          type="number"
          value={String(publish.passingScore)}
          disabled={locked}
          onChange={(event) => onChange({ passingScore: Number(event.target.value) })}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-300">Reporting</label>
        <select value={publish.reportingStatus} disabled={locked} onChange={(event) => onChange({ reportingStatus: event.target.value as CoursePublishSettings['reportingStatus'] })} className={cn(selectClass, 'mt-1')}>
          <option value="completed_passed">Completed / Passed</option>
          <option value="completed_failed">Completed / Failed</option>
          <option value="passed_failed">Passed / Failed</option>
        </select>
      </div>
    </div>
  )
}

function CoursePreview({
  document,
  lesson,
  device,
}: {
  document: CourseDocument
  lesson: CourseLesson
  device: PreviewDevice
}) {
  const theme = document.theme ?? defaultTheme
  const width = device === 'desktop' ? 'max-w-5xl' : device === 'tablet' ? 'max-w-2xl' : 'max-w-sm'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#10141D] p-5 lux-scrollbar">
      <div className={cn('mx-auto overflow-hidden rounded-lg border border-white/10 bg-[#F8F6F0] text-[#1F1B16] shadow-2xl', width)}>
        <div className="grid min-h-[620px] grid-cols-[220px_minmax(0,1fr)]">
          {theme.sidebarEnabled && device !== 'phone' && (
            <aside className="border-r border-black/10 bg-white p-4">
              <p className="text-sm font-bold">{document.title}</p>
              <div className="mt-4 space-y-1">
                {(document.lessons ?? []).map((item, index) => (
                  <div key={item.id} className={cn('rounded px-2 py-2 text-xs', item.id === lesson.id ? 'bg-black/8 font-semibold' : 'text-black/55')}>
                    {theme.lessonNumbers ? `${index + 1}. ` : ''}{item.title}
                  </div>
                ))}
              </div>
            </aside>
          )}
          <article className={cn('min-w-0 p-8', theme.coverLayout === 'compact' && 'p-5')}>
            <div className="mb-8 border-b border-black/10 pb-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: theme.accentColor }}>{lesson.type}</p>
              <h1 className="mt-2 text-4xl font-bold leading-tight">{lesson.title}</h1>
              {lesson.summary && <p className="mt-3 text-base leading-7 text-black/60">{lesson.summary}</p>}
            </div>
            {lesson.type === 'quiz' ? (
              <PreviewQuiz quiz={lesson.quiz} accentColor={theme.accentColor} />
            ) : (
              <div className="space-y-6">
                {lesson.blocks.filter(blockHasContent).map((block) => <PreviewBlock key={block.id} block={block} accentColor={theme.accentColor} />)}
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}

function PreviewQuiz({ quiz, accentColor }: { quiz?: DraftQuiz; accentColor: string }) {
  return (
    <div className="space-y-4">
      {(quiz?.questions ?? []).map((question, index) => (
        <div key={question.id} className="rounded-lg border border-black/10 bg-white p-4">
          <p className="text-xs font-bold uppercase" style={{ color: accentColor }}>Question {index + 1}</p>
          <h2 className="mt-1 text-lg font-semibold">{question.text}</h2>
          <div className="mt-3 space-y-2">
            {question.options.map((option) => (
              <div key={option.id} className="rounded border border-black/10 px-3 py-2 text-sm">{option.text}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PreviewFlashcardsBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const items = (block.items ?? []).filter((item) => item.title?.trim() || item.content?.trim())

  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div>
      {block.title && <h3 className="mb-5 text-xl font-semibold text-black">{block.title}</h3>}
      <div className="flex flex-wrap gap-5">
        {items.map((item) => {
          const isFlipped = flipped.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className="group relative flex min-h-[240px] flex-1 basis-[220px] cursor-pointer flex-col overflow-hidden bg-white text-center transition-all duration-200"
              style={{
                minWidth: '200px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
                borderTop: `3px solid ${accentColor}`,
                borderRadius: '2px'
              }}
            >
              {/* Flip icon */}
              <div className="flex w-full justify-end p-3">
                <RefreshCw
                  size={16}
                  className="transition-transform duration-500"
                  style={{
                    color: '#333',
                    opacity: 0.6,
                    transform: isFlipped ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </div>

              {/* Card content - centered */}
              <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
                <p
                  className="text-lg font-normal leading-relaxed text-[#333]"
                >
                  {isFlipped ? (item.content || '\u2014') : (item.title || '\u2014')}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PreviewBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  if (block.type === 'heading') return <h2 className="text-3xl font-bold">{block.title || block.content}</h2>
  if (block.type === 'paragraph' || block.type === 'text') return <p className="text-base leading-8 text-black/70">{block.content}</p>
  if (block.type === 'quote') return <blockquote className="border-l-4 pl-4 text-xl font-medium" style={{ borderColor: accentColor }}>{block.content || block.title}</blockquote>
  if (block.type === 'statement' || block.type === 'callout') return <div className="rounded-lg p-5 text-lg font-semibold" style={{ background: `${accentColor}18` }}>{block.content || block.title}</div>
  if (block.type === 'image') return <MediaPreview block={block} kind="image" />
  if (block.type === 'video') return <MediaPreview block={block} kind="video" />
  if (block.type === 'audio') return <MediaPreview block={block} kind="audio" />
  if (block.type === 'divider') return <hr className="border-black/10" />
  if (block.type === 'spacer') return <div style={{ height: metadataNumber(block, 'height', 48) }} />
  if (block.type === 'knowledge_check') {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <p className="text-xs font-bold uppercase" style={{ color: accentColor }}>Knowledge check</p>
        <h3 className="mt-1 text-lg font-semibold">{block.knowledgeCheck?.question}</h3>
        <div className="mt-3 space-y-2">
          {(block.knowledgeCheck?.options ?? []).map((option) => <div key={option.id} className="rounded border border-black/10 px-3 py-2 text-sm">{option.text}</div>)}
        </div>
      </div>
    )
  }
  if (block.type === 'flashcards') {
    return <PreviewFlashcardsBlock block={block} accentColor={accentColor} />
  }
  if (isInteractionBlock(block.type)) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h3 className="text-lg font-semibold">{block.title}</h3>
        <div className="mt-3 grid gap-2">
          {(block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim()).map((item) => (
            <div key={item.id} className="rounded border border-black/10 p-3">
              <p className="font-semibold">{item.title}</p>
              {item.content && <p className="mt-1 text-sm text-black/60">{item.content}</p>}
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (block.type === 'button') return <a className="inline-flex rounded-full px-5 py-2 text-sm font-bold text-white" style={{ background: accentColor }} href={block.assetUrl || '#'}>{block.content || block.title}</a>
  if (block.type === 'code') return <pre className="overflow-x-auto rounded-lg bg-black p-4 text-xs text-white lux-scrollbar">{block.content}</pre>
  return <p className="text-base leading-8 text-black/70">{block.content || block.title}</p>
}

function MediaPreview({ block, kind }: { block: CourseBlock; kind: 'image' | 'video' | 'audio' }) {
  if (!block.assetUrl) {
    return <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-black/15 bg-black/5 text-sm text-black/40">{block.title}</div>
  }

  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={block.assetUrl} alt={block.title ?? ''} className="w-full rounded-lg border border-black/10 object-contain" />
  }

  if (kind === 'video') return <video controls src={block.assetUrl} className="w-full rounded-lg border border-black/10" />
  return <audio controls src={block.assetUrl} className="w-full" />
}
