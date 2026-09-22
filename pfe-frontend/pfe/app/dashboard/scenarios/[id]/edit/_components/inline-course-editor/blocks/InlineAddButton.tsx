import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

export function InlineAddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]"
    >
      <Plus size={14} />
      {children}
    </button>
  )
}
