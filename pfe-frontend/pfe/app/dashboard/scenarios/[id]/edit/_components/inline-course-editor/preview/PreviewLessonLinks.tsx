import { ChevronDown } from 'lucide-react'

export function PreviewLessonHeaderLink({
  lessonNumber,
  lessonTitle,
  onClick,
}: {
  lessonNumber: number
  lessonTitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mb-8 flex w-full flex-col items-center justify-center border-b border-[var(--lux-line)] px-4 pb-7 text-center text-[var(--lux-muted)] transition hover:bg-[var(--lux-surface-soft)] hover:text-[var(--lux-primary)]"
    >
      <ChevronDown size={26} className="mb-2 rotate-180 transition group-hover:-translate-y-1" />
      <span className="text-sm font-semibold uppercase tracking-wide">
        Lesson {lessonNumber} - {lessonTitle}
      </span>
    </button>
  )
}

export function PreviewLessonFooterLink({
  lessonNumber,
  lessonTitle,
  disabled,
  onClick,
}: {
  lessonNumber: number
  lessonTitle: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group mt-8 flex w-full flex-col items-center justify-center border-t border-[var(--lux-line)] px-4 py-10 text-center text-[var(--lux-muted)] transition hover:bg-[var(--lux-surface-soft)] hover:text-[var(--lux-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--lux-muted)]"
    >
      <span className="text-sm font-semibold uppercase tracking-wide">
        Lesson {lessonNumber} - {lessonTitle}
      </span>
      <ChevronDown size={26} className="mt-2 transition group-hover:translate-y-1 group-disabled:translate-y-0" />
    </button>
  )
}
