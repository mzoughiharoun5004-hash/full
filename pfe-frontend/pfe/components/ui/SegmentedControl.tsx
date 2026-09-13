'use client'

import { cn } from '@/lib/utils'

interface SegmentedControlItem<T extends string | number> {
  label: string
  value: T
}

interface SegmentedControlProps<T extends string | number> {
  items: SegmentedControlItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string | number>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--lux-line)] bg-[var(--lux-surface-soft)]/80 p-1 backdrop-blur-sm lux-scrollbar',
        className,
      )}
    >
      {items.map((item) => {
        const isSelected = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(item.value)}
            className={cn(
              'h-8 shrink-0 rounded-lg px-3.5 text-xs font-bold transition-all duration-200 cursor-pointer select-none',
              isSelected
                ? 'bg-[var(--lux-surface)] text-[var(--lux-text-strong)] shadow-xs border border-[var(--lux-line)]/80 scale-[1.02]'
                : 'text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)]',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
