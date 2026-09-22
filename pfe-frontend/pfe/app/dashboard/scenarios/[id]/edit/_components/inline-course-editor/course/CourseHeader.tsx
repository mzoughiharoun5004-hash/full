import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseDocument } from '@/types'
import {
  formatCourseDuration,
  getCourseEstimatedMinutes,
  getScormSettings,
} from '../courseEditorModel'
import { AuthorBadge } from './AuthorBadge'
import { DescriptionEditor } from './DescriptionEditor'
import { InlineText } from '../shared/uiPrimitives'

export function CourseHeader({
  document,
  authorName,
  readOnly,
  courseTitleBackgroundUrl,
  onEditTitle,
  onUpdateDocument,
}: {
  document: CourseDocument
  authorName: string
  readOnly: boolean
  courseTitleBackgroundUrl: string
  onEditTitle: () => void
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
}) {
  const metadata = document.metadata ?? {}
  return (
    <section
      className={cn(
        'fade-up fade-up-1 relative overflow-hidden rounded-lg border border-[var(--lux-line)] px-5 py-7 shadow-sm sm:px-7 sm:py-9',
        courseTitleBackgroundUrl ? 'bg-cover bg-center' : 'bg-[var(--lux-surface-soft)]',
      )}
      style={courseTitleBackgroundUrl ? { backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.56), rgba(5, 12, 14, 0.56)), url(${courseTitleBackgroundUrl})` } : undefined}
    >
      <div className="relative">
        <div className="flex items-center gap-3">
          <AuthorBadge name={String(metadata.authorName || authorName)} coverMode={Boolean(courseTitleBackgroundUrl)} />
          <InlineText
            value={String(metadata.authorName || authorName)}
            className={cn(
              'text-sm font-bold uppercase',
              courseTitleBackgroundUrl ? 'text-white/80 drop-shadow' : 'text-[var(--lux-muted)]',
            )}
            readOnly={readOnly}
            onCommit={(value) =>
              onUpdateDocument((current) => ({
                ...current,
                metadata: { ...current.metadata, authorName: value || authorName },
              }))
            }
          />
          <ChevronDown size={15} className={courseTitleBackgroundUrl ? 'text-white/65' : 'text-[var(--lux-muted)]'} />
        </div>

        <button
          type="button"
          onClick={readOnly ? undefined : onEditTitle}
          className={cn(
            'mt-9 block max-w-4xl text-left text-[44px] font-bold leading-tight sm:text-[52px]',
            courseTitleBackgroundUrl
              ? 'text-white drop-shadow hover:text-white'
              : 'text-[var(--lux-muted)] hover:text-[var(--lux-text-strong)]',
          )}
        >
          {document.title}
        </button>

        <div className="mt-10 h-1.5 w-[200px] bg-[var(--lux-primary)]" />

        <DescriptionEditor
          value={document.description ?? ''}
          coverMode={Boolean(courseTitleBackgroundUrl)}
          readOnly={readOnly}
          onCommit={(description) =>
            onUpdateDocument((current) => ({
              ...current,
              description,
              metadata: {
                ...current.metadata,
                scorm: {
                  ...getScormSettings(current),
                  lmsDescription: description,
                },
              },
            }))
          }
        />
      </div>

      <div className="mt-7 flex flex-wrap gap-2 text-sm text-[var(--lux-muted)]">
        <span className="rounded-full bg-[var(--lux-surface-soft)] px-3 py-1.5">
          Duration: {formatCourseDuration(getCourseEstimatedMinutes(document))}
        </span>
        {String(metadata.audience ?? '').trim() && (
          <span className="rounded-full bg-[var(--lux-surface-soft)] px-3 py-1.5">
            Audience: {String(metadata.audience)}
          </span>
        )}
        {String(metadata.tone ?? '').trim() && (
          <span className="rounded-full bg-[var(--lux-surface-soft)] px-3 py-1.5">
            Tone: {String(metadata.tone)}
          </span>
        )}
      </div>
    </section>
  )
}
