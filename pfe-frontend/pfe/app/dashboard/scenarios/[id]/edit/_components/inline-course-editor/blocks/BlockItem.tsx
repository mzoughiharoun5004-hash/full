import type { DragEvent } from 'react'
import { ChevronDown, Copy, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseBlock, CourseDocument, CourseLesson } from '@/types'
import { AiCourseEditControl } from '../AiCourseControls'
import { InlineBlockSurface } from './InlineBlockSurface'
import type { BeforeAiProposeHandler } from '../shared/editorTypes'
import { IconButton } from '../shared/uiPrimitives'

export function BlockItem({
  block,
  currentLessonId,
  document,
  aiScenarioId,
  courseDocumentVersion,
  onAiApplied,
  onBeforeAiPropose,
  lessonDestinations,
  index,
  total,
  editing,
  readOnly,
  onEdit,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  ...dragProps
}: {
  block: CourseBlock
  currentLessonId: string
  document: CourseDocument
  aiScenarioId?: string
  courseDocumentVersion?: number
  onAiApplied?: (document: CourseDocument) => void
  onBeforeAiPropose?: BeforeAiProposeHandler
  lessonDestinations: CourseLesson[]
  index: number
  total: number
  editing: boolean
  readOnly: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (event: DragEvent) => void
  onDrop?: () => void
  onEdit: () => void
  onUpdate: (updater: (block: CourseBlock) => CourseBlock) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <article className={cn('group relative px-2 py-8 transition', editing && 'z-10')} {...dragProps}>
      {!readOnly && <div className="absolute right-[-64px] top-8 hidden items-center gap-2 rounded bg-[var(--lux-surface)] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.12)] group-hover:flex">
        <IconButton label="Move up" disabled={index === 0} onClick={onMoveUp}><ChevronDown size={20} className="rotate-180" /></IconButton>
        <IconButton label="Move down" disabled={index === total - 1} onClick={onMoveDown}><ChevronDown size={20} /></IconButton>
        <IconButton label="Duplicate" onClick={onDuplicate}><Copy size={20} /></IconButton>
        {aiScenarioId && (
          <AiCourseEditControl
            scenarioId={aiScenarioId}
            document={document}
            scope={{ type: 'block', lessonId: currentLessonId, blockId: block.id }}
            compact
            courseDocumentVersion={courseDocumentVersion}
            onApplied={onAiApplied ?? (() => window.location.reload())}
            onBeforePropose={onBeforeAiPropose}
          />
        )}
        <IconButton label="Delete" onClick={onDelete}><Trash2 size={20} /></IconButton>
      </div>}

      <InlineBlockSurface
        block={block}
        currentLessonId={currentLessonId}
        lessonDestinations={lessonDestinations}
        editing={editing}
        readOnly={readOnly}
        onFocus={onEdit}
        onUpdate={onUpdate}
      />
    </article>
  )
}
