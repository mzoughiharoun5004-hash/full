import { useState } from 'react'
import { ArrowLeft, Check, ChevronDown, Redo2, Undo2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { ScenarioLockInfo } from '@/context/SocketContext'
import type { CourseBlock, CourseBlockType, CourseDocument, CourseLesson } from '@/types'
import { createBlock, duplicateBlock, setLessonKind, type SaveStatus } from '../courseEditorModel'
import { AiCourseEditControl } from '../AiCourseControls'
import { BetweenBlocksInsert } from '../blocks/BetweenBlocksInsert'
import { BlockItem } from '../blocks/BlockItem'
import { BlockLibraryRail } from '../blocks/BlockLibraryRail'
import { QuickInsertBar } from '../blocks/QuickInsertBar'
import { collaborationUserName } from '../collaboration/collaborationHelpers'
import { TitleBackgroundImageControl } from '../course/TitleBackgroundImageControl'
import { LessonNavigationLink } from './LessonNavigationLink'
import { QuizLessonEditor } from '../quiz/QuizLessonEditor'
import { QuizSettingsPanel } from '../quiz/QuizSettingsPanel'
import type { BeforeAiProposeHandler } from '../shared/editorTypes'
import { uploadedAssetUrl } from '../shared/mediaHelpers'
import { InlineText, IconButton } from '../shared/uiPrimitives'

export function LessonEditor({
  document,
  lesson,
  lessonOrder,
  lessonCount,
  settingsOpen,
  readOnly,
  lock,
  saveStatus,
  onFinish,
  onBack,
  onOpenLesson,
  onUpdateLesson,
  aiScenarioId,
  courseDocumentVersion,
  onAiApplied,
  onBeforeAiPropose,
}: {
  document: CourseDocument
  lesson: CourseLesson
  lessonOrder: number
  lessonCount: number
  settingsOpen: boolean
  readOnly: boolean
  lock?: ScenarioLockInfo
  saveStatus: SaveStatus
  onFinish: () => void
  onBack: () => void
  onOpenLesson: (lessonId: string) => void
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
  onUpdateLesson: (updater: (lesson: CourseLesson) => CourseLesson) => void
  aiScenarioId?: string
  courseDocumentVersion?: number
  onAiApplied?: (document: CourseDocument) => void
  onBeforeAiPropose?: BeforeAiProposeHandler
}) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null)
  const [undoStack, setUndoStack] = useState<CourseLesson[]>([])
  const [redoStack, setRedoStack] = useState<CourseLesson[]>([])
  const previousLesson = document.lessons?.[lessonOrder - 2] ?? null
  const nextLesson = document.lessons?.[lessonOrder] ?? null
  const lessonTitleBackgroundUrl = lesson.coverImageUrl ? uploadedAssetUrl(lesson.coverImageUrl) : ''
  const lockOwner = lock ? collaborationUserName(lock.user) : ''

  const updateLessonWithHistory = (updater: (lesson: CourseLesson) => CourseLesson) => {
    if (readOnly) return
    setUndoStack((current) => [...current.slice(-49), lesson])
    setRedoStack([])
    onUpdateLesson(updater)
  }

  const updateLessonMetadata = (updater: (lesson: CourseLesson) => CourseLesson) => {
    updateLessonWithHistory(updater)
  }

  const undoLessonChange = () => {
    if (readOnly || undoStack.length === 0) return
    const previousLesson = undoStack[undoStack.length - 1]
    setUndoStack((current) => current.slice(0, -1))
    setRedoStack((current) => [...current.slice(-49), lesson])
    setEditingBlockId(null)
    onUpdateLesson(() => previousLesson)
  }

  const redoLessonChange = () => {
    if (readOnly || redoStack.length === 0) return
    const nextLesson = redoStack[redoStack.length - 1]
    setRedoStack((current) => current.slice(0, -1))
    setUndoStack((current) => [...current.slice(-49), lesson])
    setEditingBlockId(null)
    onUpdateLesson(() => nextLesson)
  }

  const updateBlock = (blockId: string, updater: (block: CourseBlock) => CourseBlock) => {
    if (readOnly) return
    updateLessonWithHistory((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId ? updater(block) : block),
    }))
  }

  const insertBlock = (type: CourseBlockType, insertIndex = pendingInsertIndex) => {
    if (readOnly) return
    const block = createBlock(type)
    updateLessonWithHistory((current) => {
      const blocks = [...current.blocks]
      const safeIndex = insertIndex === null
        ? blocks.length
        : Math.max(0, Math.min(insertIndex, blocks.length))
      blocks.splice(safeIndex, 0, block)
      return {
        ...setLessonKind(current, lesson.type),
        blocks,
      }
    })
    setEditingBlockId(block.id)
    setPendingInsertIndex(null)
    setLibraryOpen(false)
  }

  const openLibraryForInsert = (insertIndex: number) => {
    if (readOnly) return
    setPendingInsertIndex(insertIndex)
    setLibraryOpen(true)
  }

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    if (readOnly) return
    updateLessonWithHistory((current) => {
      const blocks = [...current.blocks]
      const index = blocks.findIndex((block) => block.id === blockId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return current
      const [block] = blocks.splice(index, 1)
      blocks.splice(nextIndex, 0, block)
      return { ...current, blocks }
    })
  }

  const reorderBlock = (targetBlockId: string) => {
    if (readOnly) return
    if (!draggedBlockId || draggedBlockId === targetBlockId) return
    updateLessonWithHistory((current) => {
      const blocks = [...current.blocks]
      const from = blocks.findIndex((block) => block.id === draggedBlockId)
      const to = blocks.findIndex((block) => block.id === targetBlockId)
      if (from < 0 || to < 0) return current
      const [block] = blocks.splice(from, 1)
      blocks.splice(to, 0, block)
      return { ...current, blocks }
    })
    setDraggedBlockId(null)
  }

  return (
    <main className="min-h-[calc(100vh-2.5rem)] bg-[var(--lux-bg)]">
      <div className="sticky top-10 z-30 flex h-14 items-center justify-between border-b border-[var(--lux-line)] bg-[var(--lux-surface)] px-3">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="grid h-11 w-11 place-items-center border-r border-[var(--lux-line)] text-[var(--lux-text)] hover:bg-[var(--lux-overlay-hover)]"
            aria-label="Back to course outline"
          >
            <ArrowLeft size={24} />
          </button>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex max-w-[220px] items-center gap-2 rounded bg-[var(--lux-surface-soft)] px-6 py-2 text-base font-bold text-[var(--lux-text-strong)] hover:bg-[var(--lux-elevated)]"
          >
            <span className="truncate">{lesson.title}</span>
            <ChevronDown size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 pr-4 text-[var(--lux-text)]">
          {!readOnly && (
            <>
              <IconButton label="Undo" disabled={undoStack.length === 0} onClick={undoLessonChange}><Undo2 size={24} /></IconButton>
              <IconButton label="Redo" disabled={redoStack.length === 0} onClick={redoLessonChange}><Redo2 size={24} /></IconButton>
            </>
          )}
          <ThemeToggle compact className="h-9 w-9 rounded-md" />
          {aiScenarioId && (
            <AiCourseEditControl
              scenarioId={aiScenarioId}
              document={document}
              scope={{ type: 'lesson', lessonId: lesson.id }}
              courseDocumentVersion={courseDocumentVersion}
              onApplied={onAiApplied ?? (() => window.location.reload())}
              onBeforePropose={onBeforeAiPropose}
            />
          )}
        </div>
      </div>
      {lock && readOnly && (
        <div className="border-b border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-4 py-2 text-center text-xs font-semibold text-[var(--lux-muted)]">
          {lockOwner} is editing this lesson
        </div>
      )}

      <div>
        {previousLesson && (
          <LessonNavigationLink
            placement="header"
            lessonNumber={lessonOrder - 1}
            lessonTitle={previousLesson.title}
            onClick={() => onOpenLesson(previousLesson.id)}
          />
        )}
        <section className="mx-auto max-w-[600px] px-5 pb-[122px] pt-16 sm:pt-20">
          <header
            className={cn(
              'relative overflow-hidden',
              lessonTitleBackgroundUrl && 'rounded-lg border border-[var(--lux-line)] bg-cover bg-center px-5 py-7 shadow-sm sm:px-7 sm:py-9',
            )}
            style={lessonTitleBackgroundUrl ? { backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.5), rgba(5, 12, 14, 0.5)), url(${lessonTitleBackgroundUrl})` } : undefined}
          >
            <div className="relative">
              <p className={cn(
                'mb-3 text-xs font-semibold uppercase tracking-wide',
                lessonTitleBackgroundUrl ? 'text-white/75' : 'text-[var(--lux-muted)]',
              )}>
                Lesson {lessonOrder} of {Math.max(lessonCount, lessonOrder)}
              </p>
              <InlineText
                value={lesson.title}
                className={cn(
                  'text-[44px] font-bold leading-tight sm:text-[52px]',
                  lessonTitleBackgroundUrl ? 'text-white drop-shadow' : 'text-[var(--lux-text-strong)]',
                )}
                readOnly={readOnly}
                onCommit={(title) => title.trim() && updateLessonMetadata((current) => ({ ...current, title: title.trim() }))}
              />
              <div className="mt-[76px] h-1.5 w-[200px] bg-[var(--lux-primary)]" />
            </div>
          </header>
          {!readOnly && (
            <TitleBackgroundImageControl
              label="Lesson title background"
              value={lesson.coverImageUrl ?? ''}
              onChange={(coverImageUrl) => updateLessonMetadata((current) => ({ ...current, coverImageUrl }))}
            />
          )}

          {settingsOpen && lesson.type === 'quiz' && !readOnly && (
            <QuizSettingsPanel lesson={lesson} onUpdateLesson={updateLessonMetadata} />
          )}
        </section>

        {lesson.type === 'quiz' ? (
          <QuizLessonEditor
            lesson={lesson}
            readOnly={readOnly}
            saveStatus={saveStatus}
            onFinish={onFinish}
            onUpdateLesson={updateLessonWithHistory}
          />
        ) : (
          <section className="border-t-[3px] border-[var(--lux-line)] px-4 pb-12 pt-10">
            <div className="mx-auto max-w-[930px] space-y-4">
              {lesson.blocks.length === 0 && (
                <div className="mb-8 text-center">
                  <p className="text-2xl font-semibold text-[var(--lux-text-strong)]">
                    {readOnly ? 'No blocks in this lesson' : 'Add your first block'}
                  </p>
                  <span className="mx-auto mt-3 block h-px w-7 bg-[var(--lux-muted-soft)]" />
                </div>
              )}

              {lesson.blocks.map((block, index) => (
                <div key={block.id}>
                  {index > 0 && (
                    <BetweenBlocksInsert
                      onInsert={() => openLibraryForInsert(index)}
                      disabled={readOnly}
                    />
                  )}
                  <BlockItem
                    block={block}
                    currentLessonId={lesson.id}
                    document={document}
                    aiScenarioId={aiScenarioId}
                    courseDocumentVersion={courseDocumentVersion}
                    onAiApplied={onAiApplied}
                    onBeforeAiPropose={onBeforeAiPropose}
                    lessonDestinations={document.lessons ?? []}
                    index={index}
                    total={lesson.blocks.length}
                    editing={editingBlockId === block.id}
                    readOnly={readOnly}
                    onEdit={() => !readOnly && setEditingBlockId(block.id)}
                    onUpdate={(updater) => updateBlock(block.id, updater)}
                    onMoveUp={() => moveBlock(block.id, -1)}
                    onMoveDown={() => moveBlock(block.id, 1)}
                    onDuplicate={() => !readOnly && updateLessonWithHistory((current) => {
                      const blocks = [...current.blocks]
                      const blockIndex = blocks.findIndex((item) => item.id === block.id)
                      blocks.splice(blockIndex + 1, 0, duplicateBlock(block))
                      return { ...current, blocks }
                    })}
                    onDelete={() => !readOnly && updateLessonWithHistory((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) }))}
                    draggable={!readOnly}
                    onDragStart={() => setDraggedBlockId(block.id)}
                    onDragOver={(event) => !readOnly && event.preventDefault()}
                    onDrop={() => reorderBlock(block.id)}
                  />
                </div>
              ))}

              {!readOnly && (
                <>
                  <QuickInsertBar
                    libraryOpen={libraryOpen && pendingInsertIndex === null}
                    onToggleLibrary={() => {
                      setPendingInsertIndex(null)
                      setLibraryOpen((current) => !current)
                    }}
                    onInsert={(type) => insertBlock(type, null)}
                  />
                  <div className="mt-6 flex justify-center">
                    <Button size="lg" className="min-w-[160px] px-10" onClick={onFinish} disabled={saveStatus === 'saving'}>
                      <Check size={16} className="mr-1" />
                      Finish
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
        {nextLesson && (
          <LessonNavigationLink
            placement="footer"
            lessonNumber={lessonOrder + 1}
            lessonTitle={nextLesson.title}
            onClick={() => onOpenLesson(nextLesson.id)}
          />
        )}
      </div>

      {libraryOpen && lesson.type !== 'quiz' && !readOnly && (
        <BlockLibraryRail
          quizMode={false}
          onClose={() => setLibraryOpen(false)}
          onInsert={insertBlock}
        />
      )}
    </main>
  )
}
