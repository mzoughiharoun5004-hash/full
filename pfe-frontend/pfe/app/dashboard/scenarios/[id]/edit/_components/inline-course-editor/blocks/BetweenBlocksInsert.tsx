import { Plus } from 'lucide-react'

export function BetweenBlocksInsert({
  disabled,
  onInsert,
}: {
  disabled: boolean
  onInsert: () => void
}) {
  if (disabled) return null

  return (
    <div className="group relative -my-1 flex h-7 items-center justify-center">
      <span className="h-px flex-1 bg-transparent transition group-hover:bg-[var(--lux-line)]" />
      <button
        type="button"
        onClick={onInsert}
        className="grid h-7 w-7 scale-90 place-items-center rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface)] text-[var(--lux-muted)] opacity-0 shadow-sm transition hover:border-[var(--lux-primary)] hover:text-[var(--lux-primary)] group-hover:scale-100 group-hover:opacity-100"
        aria-label="Insert block between items"
      >
        <Plus size={16} />
      </button>
      <span className="h-px flex-1 bg-transparent transition group-hover:bg-[var(--lux-line)]" />
    </div>
  )
}
