import { X } from 'lucide-react'
import type { CourseBlockType } from '@/types'
import { getBlockDefinition } from '../courseEditorModel'
import { blockLibraryGroups } from '../shared/blockLibrary'

export function BlockLibraryRail({
  quizMode,
  onClose,
  onInsert,
}: {
  quizMode: boolean
  onClose: () => void
  onInsert: (type: CourseBlockType) => void
}) {
  const allowedQuizTypes: CourseBlockType[] = ['multiple_choice', 'multiple_select', 'fill_blank', 'matching']
  const groups = blockLibraryGroups.filter((item) => {
    if (!quizMode) return item.type ? !getBlockDefinition(item.type).questionOnly : true
    return item.type ? allowedQuizTypes.includes(item.type) : false
  })

  return (
    <aside className="fixed bottom-0 left-0 top-24 z-40 w-[min(280px,calc(100vw-24px))] border-r border-[var(--lux-line)] bg-[var(--lux-surface)] shadow-[var(--lux-shadow)]">
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between border-b border-[var(--lux-line)] px-4">
          <h2 className="text-sm font-bold text-[var(--lux-text-strong)]">Block library</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--lux-overlay-hover)]" aria-label="Close block library">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 lux-scrollbar">
          <div className="grid gap-1.5">
            {groups.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.type && onInsert(item.type)}
                  className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-sm font-semibold leading-tight text-[var(--lux-text)] transition hover:border-[var(--lux-line)] hover:bg-[var(--lux-overlay-hover)]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--lux-surface-soft)] text-[var(--lux-text)]">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.beta && <span className="shrink-0 rounded bg-[var(--lux-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lux-text-strong)]">Beta</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </aside>
  )
}
