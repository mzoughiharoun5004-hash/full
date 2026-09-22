import { useState, type DragEvent } from 'react'
import { BookOpen, ChevronDown, Clock3, Copy, GripVertical, List, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseLesson } from '@/types'
import { setLessonKind } from '../courseEditorModel'
import { InlineText } from '../shared/uiPrimitives'

export function LessonStructureItem({
  lesson,
  readOnly,
  onDuplicate,
  onUpdate,
  onRemove,
  onOpen,
  ...dragProps
}: {
  lesson: CourseLesson
  readOnly: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (event: DragEvent) => void
  onDrop?: () => void
  onDuplicate: () => void
  onUpdate: (updater: (lesson: CourseLesson) => CourseLesson) => void
  onRemove: () => void
  onOpen: () => void
}) {
  const [chooserOpen, setChooserOpen] = useState(false)
  const contentKind = typeof lesson.metadata?.contentKind === 'string' ? lesson.metadata.contentKind : undefined
  const hasContent =
    lesson.blocks.length > 0 ||
    lesson.type === 'quiz' ||
    contentKind === 'lesson' ||
    contentKind === 'quiz'

  const handleAction = () => {
    if (hasContent) {
      onOpen()
      return
    }
    setChooserOpen((current) => !current)
  }

  return (
    <div className={cn('group relative py-7 transition-colors', chooserOpen && 'bg-[var(--lux-surface-soft)] px-5 sm:px-8')} {...dragProps}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <GripVertical className="hidden h-4 w-4 flex-shrink-0 cursor-grab text-[var(--lux-muted-soft)] opacity-0 transition group-hover:opacity-100 sm:block" />
          <span className="ml-5 text-2xl leading-none text-[var(--lux-muted-soft)] sm:ml-0">•</span>
          <InlineText
            value={lesson.title}
            className="min-w-0 text-xl font-bold text-[var(--lux-text-strong)]"
            readOnly={readOnly}
            onCommit={(title) => title.trim() && onUpdate((current) => ({ ...current, title: title.trim() }))}
          />
          {lesson.type === 'quiz' && <span className="rounded-full bg-[var(--lux-overlay)] px-2.5 py-1 text-xs font-bold text-[var(--lux-muted)]">Quiz</span>}
        </div>
        {!readOnly && (
          <label className="flex items-center gap-2 rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">
            <Clock3 size={14} />
            <span>Duration</span>
            <input
              type="number"
              min="1"
              value={lesson.estimatedMinutes ?? ''}
              onChange={(event) => {
                const raw = event.target.value.trim()
                if (!raw) {
                  onUpdate((current) => ({ ...current, estimatedMinutes: undefined }))
                  return
                }
                const minutes = Number(raw)
                if (!Number.isFinite(minutes) || minutes <= 0) return
                onUpdate((current) => ({ ...current, estimatedMinutes: Math.round(minutes) }))
              }}
              className="w-20 border-0 bg-transparent p-0 text-sm font-semibold text-[var(--lux-text-strong)] outline-none [appearance:textfield]"
            />
            <span>min</span>
          </label>
        )}
        <div className="relative flex items-center gap-3 sm:justify-end">
          <button
            type="button"
            onClick={handleAction}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--lux-primary)] px-5 text-base font-bold text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-primary-hover)]"
          >
            {hasContent ? (readOnly ? 'Review Content' : 'Edit Content') : 'Add Content'}
            {!readOnly && <ChevronDown size={18} className={cn(chooserOpen && 'rotate-180')} />}
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={onDuplicate}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] opacity-0 transition hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] group-hover:opacity-100 focus:opacity-100"
                aria-label="Duplicate lesson"
                title="Duplicate lesson"
              >
                <Copy size={17} />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] opacity-0 transition hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] group-hover:opacity-100 focus:opacity-100"
                aria-label="Delete lesson"
                title="Delete lesson"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {chooserOpen && !hasContent && !readOnly && (
        <div className="relative ml-auto mt-5 w-full max-w-[625px] rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-6 shadow-[var(--lux-shadow)] before:absolute before:-top-3 before:right-24 before:h-6 before:w-6 before:rotate-45 before:border-l before:border-t before:border-[var(--lux-line)] before:bg-[var(--lux-surface)]">
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => {
                onUpdate((current) => setLessonKind(current, 'lesson'))
                onOpen()
              }}
              className="flex w-full items-center justify-between rounded bg-[var(--lux-surface-soft)] px-8 py-6 text-left transition hover:bg-[var(--lux-elevated)]"
            >
              <span>
                <span className="block text-xl font-bold text-[var(--lux-text-strong)]">Create Lesson</span>
                <span className="mt-1 block text-lg text-[var(--lux-text)]">Create a new lesson from a wide range of learning blocks.</span>
              </span>
              <List size={28} />
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdate((current) => setLessonKind(current, 'quiz'))
                onOpen()
              }}
              className="flex w-full items-center justify-between rounded bg-[var(--lux-surface-soft)] px-8 py-6 text-left transition hover:bg-[var(--lux-elevated)]"
            >
              <span>
                <span className="block text-xl font-bold text-[var(--lux-text-strong)]">Create Quiz</span>
                <span className="mt-1 block text-lg text-[var(--lux-text)]">Test the learner&apos;s knowledge with a quiz.</span>
              </span>
              <BookOpen size={28} />
            </button>
          </div>
          
        </div>
      )}

    </div>
  )
}
