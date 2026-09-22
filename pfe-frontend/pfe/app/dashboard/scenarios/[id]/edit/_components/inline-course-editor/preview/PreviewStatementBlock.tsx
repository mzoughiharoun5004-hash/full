import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'
import { previewMetaString } from './previewHelpers'

export function PreviewStatementBlock({ block }: { block: CourseBlock }) {
  const content = block.content?.trim() || ''
  const styleMeta = previewMetaString(block, 'style', 'Info')
  const styleLabel = statementStyleLabel(styleMeta)
  const callout = statementCalloutLabel(block.title, styleLabel)

  return (
    <section className={cn('statement-block rounded-lg border p-5 transition-colors', statementStyleClasses(styleLabel))}>
      <div className="mb-3">
        <span className={cn('statement-label inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statementBadgeClasses(styleLabel))}>
          {callout}
        </span>
      </div>
      <p className={cn('whitespace-pre-wrap text-xl font-extrabold leading-8', statementTextClasses(styleLabel))}>
        {content}
      </p>
    </section>
  )
}

export function statementStyleLabel(value?: string) {
  const normalized = (value || 'Info').replace(/^\s*[^\p{L}\p{N}]*/u, '').trim().toLowerCase()
  if (normalized === 'warning') return 'Warning'
  if (normalized === 'tip') return 'Tip'
  if (normalized === 'note') return 'Note'
  return 'Info'
}

function statementTextLabel(value?: string) {
  const normalized = (value || '').replace(/^\s*[^\p{L}\p{N}]*/u, '').trim()
  return normalized || (value || '').trim()
}

export function statementCalloutLabel(title: unknown, styleLabel: string) {
  const trimmed = String(title ?? '').trim()
  return trimmed && !['info', 'warning', 'tip', 'note'].includes(statementTextLabel(trimmed).toLowerCase())
    ? statementTextLabel(trimmed)
    : statementStyleLabel(styleLabel)
}

export function statementStyleClasses(styleLabel: string) {
  const normalized = statementStyleLabel(styleLabel).toLowerCase()
  if (normalized === 'warning') return 'statement-warning border-[var(--statement-warning-border)] bg-[var(--statement-warning-bg)]'
  if (normalized === 'tip') return 'statement-tip border-[var(--statement-tip-border)] bg-[var(--statement-tip-bg)]'
  if (normalized === 'note') return 'statement-note border-[var(--statement-note-border)] bg-[var(--statement-note-bg)]'
  return 'statement-info border-[var(--statement-info-border)] bg-[var(--statement-info-bg)]'
}

export function statementBadgeClasses(styleLabel: string) {
  const normalized = statementStyleLabel(styleLabel).toLowerCase()
  if (normalized === 'warning') return 'border border-[var(--statement-warning-badge-border)] bg-[var(--statement-warning-badge-bg)] text-[var(--statement-warning-badge-text)]'
  if (normalized === 'tip') return 'border border-[var(--statement-tip-badge-border)] bg-[var(--statement-tip-badge-bg)] text-[var(--statement-tip-badge-text)]'
  if (normalized === 'note') return 'border border-[var(--statement-note-badge-border)] bg-[var(--statement-note-badge-bg)] text-[var(--statement-note-badge-text)]'
  return 'border border-[var(--statement-info-badge-border)] bg-[var(--statement-info-badge-bg)] text-[var(--statement-info-badge-text)]'
}

export function statementTextClasses(styleLabel: string) {
  const normalized = statementStyleLabel(styleLabel).toLowerCase()
  if (normalized === 'warning') return 'text-[var(--statement-warning-text)]'
  if (normalized === 'tip') return 'text-[var(--statement-tip-text)]'
  if (normalized === 'note') return 'text-[var(--statement-note-text)]'
  return 'text-[var(--statement-info-text)]'
}
