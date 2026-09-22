import { useState } from 'react'
import { AlertTriangle, BookOpen, Clock3, FileCheck2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseReadiness } from '../courseEditorModel'

export function CourseReadinessPanel({
  readiness,
  lessonCount,
  estimatedMinutes,
  onOpenLesson,
  onOpenCourseSettings,
}: {
  readiness: CourseReadiness
  lessonCount: number
  estimatedMinutes: number
  onOpenLesson: (lessonId: string) => void
  onOpenCourseSettings: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleIssues = expanded ? readiness.issues : readiness.issues.slice(0, 3)

  return (
    <section className="mt-8 border-y border-[var(--lux-line)] py-5">
      <div className="flex flex-wrap items-center gap-5">
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
            <span>Publish readiness</span>
            <span>{readiness.percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--lux-overlay)]">
            <div
              className={cn(
                'h-full rounded-full transition-[width]',
                readiness.ready ? 'bg-emerald-500' : 'bg-amber-500',
              )}
              style={{ width: `${readiness.percent}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm text-[var(--lux-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen size={15} />
            {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={15} />
            {estimatedMinutes ? `${estimatedMinutes} min` : 'Duration unset'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileCheck2 size={15} />
            {readiness.errors.length} blocking
          </span>
        </div>
      </div>

      {visibleIssues.length > 0 && (
        <div className="mt-4 grid gap-2">
          {visibleIssues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => (issue.lessonId ? onOpenLesson(issue.lessonId) : onOpenCourseSettings())}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm',
                issue.severity === 'error'
                  ? 'bg-red-500/8 text-red-400'
                  : 'bg-amber-500/8 text-amber-500',
                issue.lessonId && 'hover:bg-[var(--lux-overlay-hover)]',
              )}
              >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span className="flex-1">{issue.message}</span>
              <span className="text-xs font-semibold">Open</span>
            </button>
          ))}
          {readiness.issues.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="justify-self-start text-xs font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]"
            >
              {expanded ? 'Show fewer checks' : `Show ${readiness.issues.length - 3} more checks`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
