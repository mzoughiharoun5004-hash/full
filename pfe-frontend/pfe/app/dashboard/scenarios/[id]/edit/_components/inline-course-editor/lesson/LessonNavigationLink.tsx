import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LessonNavigationLink({
  placement,
  lessonNumber,
  lessonTitle,
  onClick,
}: {
  placement: 'header' | 'footer'
  lessonNumber: number
  lessonTitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full flex-col items-center justify-center px-4 text-center text-[var(--lux-muted)] transition hover:bg-[var(--lux-surface-soft)] hover:text-[var(--lux-primary)]',
        placement === 'header'
          ? 'border-b border-[var(--lux-line)] py-8'
          : 'border-t border-[var(--lux-line)] py-10',
      )}
    >
      {placement === 'header' && (
        <ChevronDown size={26} className="mb-2 rotate-180 transition group-hover:-translate-y-1" />
      )}
      <span className="text-sm font-semibold uppercase tracking-wide">
        Lesson {lessonNumber} - {lessonTitle}
      </span>
      {placement === 'footer' && (
        <ChevronDown size={26} className="mt-2 transition group-hover:translate-y-1" />
      )}
    </button>
  )
}
