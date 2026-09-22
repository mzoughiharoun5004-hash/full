import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'
import { branchingDecisionBlockTypes, isQuestionBlock } from '../courseEditorModel'
import { PreviewAccordionTabsBlock } from './PreviewAccordionTabsBlock'
import { PreviewBranchingDecisionBlock } from './PreviewBranchingDecisionBlock'
import { PreviewChartBlock } from './PreviewChartBlock'
import { PreviewFlashcardsBlock } from './PreviewFlashcardsBlock'
import { PreviewInteractionBlock } from './PreviewInteractionBlock'
import { PreviewListBlock } from './PreviewListBlock'
import { PreviewMediaBlock, PreviewGalleryBlock } from './PreviewMediaBlock'
import { PreviewProcessBlock } from './PreviewProcessBlock'
import { PreviewQuestionBlock } from './PreviewQuestionBlock'
import { PreviewQuoteBlock } from './PreviewQuoteBlock'
import { PreviewSortingBlock } from './PreviewSortingBlock'
import {
  PreviewStatementBlock,
  statementStyleLabel,
  statementCalloutLabel,
  statementStyleClasses,
  statementTextClasses,
} from './PreviewStatementBlock'
import { PreviewTableBlock } from './PreviewTableBlock'
import { previewMetaString, previewMetaNumber } from './previewHelpers'

export function PreviewBlock({
  block,
  accentColor,
  completed = false,
  onComplete,
  onOpenLessonById,
  getLessonTitle,
}: {
  block: CourseBlock
  accentColor: string
  completed?: boolean
  onComplete?: () => void
  onOpenLessonById: (lessonId: string) => void
  getLessonTitle: (lessonId: string) => string
}) {
  const title = block.title?.trim()
  const content = block.content?.trim()

  if (block.type === 'heading') {
    return (
      <div className="pt-5">
        <h3 className="text-2xl font-bold leading-tight">{content || title || ''}</h3>
        {previewMetaString(block, 'subtitle') && <p className="mt-2 text-base text-[var(--lux-muted)]">{previewMetaString(block, 'subtitle')}</p>}
      </div>
    )
  }

  if (['text', 'paragraph'].includes(block.type)) {
    return <div className="pt-5"><p className="whitespace-pre-wrap text-base leading-7 text-[var(--lux-muted)]">{content || ''}</p></div>
  }

  if (block.type === 'quote') {
    return <PreviewQuoteBlock block={block} />
  }

  if (block.type === 'statement') {
    return <PreviewStatementBlock block={block} />
  }

  if (block.type === 'callout') {
    const styleLabel = statementStyleLabel(previewMetaString(block, 'style', 'Info'))
    return (
      <div className={cn('statement-block callout rounded-lg border p-4 transition-colors', statementStyleClasses(styleLabel))}>
        <p className={cn('text-sm font-bold', statementTextClasses(styleLabel))}>{statementCalloutLabel(title, styleLabel)}</p>
        <p className={cn('mt-2 whitespace-pre-wrap text-base font-semibold leading-7', statementTextClasses(styleLabel))}>{content || ''}</p>
      </div>
    )
  }

  if (block.type === 'process_steps') {
    return <PreviewProcessBlock block={block} accentColor={accentColor} onComplete={onComplete} />
  }

  if (['numbered_list', 'list', 'checklist', 'ordering', 'timeline', 'lesson_summary'].includes(block.type)) {
    return <PreviewListBlock block={block} accentColor={accentColor} />
  }

  if (block.type === 'divider') {
    const label = previewMetaString(block, 'label')
    return (
      <div className="flex items-center gap-4 py-3">
        <span className="h-px flex-1 bg-[var(--lux-line)]" />
        {label && <span className="text-xs font-bold uppercase tracking-wide text-[var(--lux-muted)]">{label}</span>}
        <span className="h-px flex-1 bg-[var(--lux-line)]" />
      </div>
    )
  }

  if (block.type === 'spacer') return <div style={{ height: previewMetaNumber(block, 'height', 48) }} />

  if (['image', 'video', 'audio', 'attachment', 'document', 'file_download', 'resource_link'].includes(block.type)) {
    return <PreviewMediaBlock block={block} accentColor={accentColor} />
  }

  if (block.type === 'image_gallery' || block.type === 'gallery') {
    return <PreviewGalleryBlock block={block} />
  }

  if (isQuestionBlock(block.type) || block.type === 'knowledge_check') {
    return <PreviewQuestionBlock block={block} />
  }

  if (block.type === 'table') return <PreviewTableBlock block={block} />
  if (block.type === 'chart') return <PreviewChartBlock block={block} accentColor={accentColor} />

  if (['button', 'restart_button'].includes(block.type)) {
    const label = previewMetaString(block, 'label', content || title || '')
    return (
      <div className={cn('flex', previewMetaString(block, 'alignment', 'center') === 'left' ? 'justify-start' : previewMetaString(block, 'alignment', 'center') === 'right' ? 'justify-end' : 'justify-center')}>
        <a href={block.assetUrl || '#'} className="inline-flex min-w-36 items-center justify-center rounded-full px-6 py-3 text-sm font-bold text-white" style={{ background: accentColor }}>
          {label}
        </a>
      </div>
    )
  }

  if (block.type === 'code') {
    return <pre className="overflow-x-auto rounded-lg bg-[var(--lux-bg-alt)] p-4 text-xs leading-6 text-[var(--lux-text-strong)] lux-scrollbar">{content || title}</pre>
  }

  if (block.type === 'flashcards') {
    return <PreviewFlashcardsBlock block={block} accentColor={accentColor} onComplete={onComplete} />
  }

  if (branchingDecisionBlockTypes.includes(block.type)) {
    return <PreviewBranchingDecisionBlock block={block} accentColor={accentColor} onOpenLessonById={onOpenLessonById} getLessonTitle={getLessonTitle} />
  }

  if (block.type === 'sorting_activity' || block.type === 'sorting') {
    return <PreviewSortingBlock block={block} accentColor={accentColor} completed={completed} onComplete={onComplete} />
  }

  if (block.type === 'accordion' || block.type === 'tabs') {
    return <PreviewAccordionTabsBlock block={block} accentColor={accentColor} onComplete={onComplete} />
  }

  return <PreviewInteractionBlock block={block} />
}
