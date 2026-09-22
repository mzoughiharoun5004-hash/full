import { LibraryBig } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseBlockType } from '@/types'
import { quickInsertBlocks } from '../shared/blockLibrary'

export function QuickInsertBar({
  libraryOpen,
  onToggleLibrary,
  onInsert,
}: {
  libraryOpen: boolean
  onToggleLibrary: () => void
  onInsert: (type: CourseBlockType) => void
}) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-stretch">
      <button
        type="button"
        onClick={onToggleLibrary}
        className={cn(
          'flex h-20 w-full shrink-0 flex-col items-center justify-center rounded bg-[var(--lux-primary)] px-2 text-center text-sm font-bold leading-tight text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-primary-hover)] sm:h-auto sm:w-[84px]',
          libraryOpen && 'bg-[var(--lux-primary-hover)]',
        )}
      >
        <LibraryBig size={22} />
        <span className="mt-1.5">Block library</span>
      </button>
      <div className="grid flex-1 grid-cols-2 gap-1.5 rounded border border-dashed border-[var(--lux-line-strong)] bg-[var(--lux-surface)] px-3 py-3 sm:grid-cols-4 lg:grid-cols-8">
        {quickInsertBlocks.map((block) => {
          const Icon = block.icon
          return (
            <button
              key={`${block.label}-${block.type}`}
              type="button"
              onClick={() => onInsert(block.type)}
              className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-md px-2 py-2 text-center text-xs font-semibold leading-tight text-[var(--lux-text)] transition hover:bg-[var(--lux-overlay-hover)]"
            >
              <Icon size={18} className="text-[var(--lux-text)]" />
              <span>{block.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
