'use client'

import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

interface SidebarToggleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  direction: 'collapse' | 'expand'
  label: string
  shortcut?: string
}

export function SidebarToggleButton({
  direction,
  label,
  shortcut = 'Ctrl+[',
  className,
  ...props
}: SidebarToggleButtonProps) {
  const isExpand = direction === 'expand'
  const tooltipText = shortcut ? `${label} (${shortcut})` : label

  return (
    <button
      type="button"
      aria-label={label}
      title={tooltipText}
      className={cn(
        'group relative inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border',
        'border-[var(--lux-line-strong)] bg-[var(--lux-surface-soft)]/80 text-[var(--lux-muted-soft)] backdrop-blur-md',
        'shadow-xs transition-all duration-300 cursor-pointer select-none',
        'hover:border-[var(--lux-primary)]/50 hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)]',
        'hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] active:scale-[0.95]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lux-primary)]/40',
        className,
      )}
      {...props}
    >
      <div className="relative flex items-center justify-center">
        <PanelLeft size={16} className="transition-transform duration-300 group-hover:scale-105" />
        <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-[var(--lux-surface)] border border-[var(--lux-line-strong)] group-hover:border-[var(--lux-primary)]/40 transition-colors">
          {isExpand ? (
            <ChevronRight size={9} className="text-[var(--lux-primary-muted)] transition-transform group-hover:translate-x-0.5" />
          ) : (
            <ChevronLeft size={9} className="text-[var(--lux-muted-soft)] group-hover:text-[var(--lux-primary-muted)] transition-transform group-hover:-translate-x-0.5" />
          )}
        </span>
      </div>
    </button>
  )
}

