'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {icon && (
        <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface-soft)] text-[var(--lux-primary-muted)] shadow-md backdrop-blur-md">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[var(--lux-primary)]/10 blur-sm" />
          {icon}
        </div>
      )}
      <h3 className="mb-1.5 text-base font-bold tracking-tight text-[var(--lux-text-strong)]">{title}</h3>
      {description && <p className="mb-6 max-w-sm text-sm leading-6 text-[var(--lux-muted)]">{description}</p>}
      {action && <div className="flex items-center gap-3">{action}</div>}
    </div>
  )
}
