import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'relative flex flex-col gap-4 border-b border-[var(--lux-line)]/80 pb-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <span className="mb-2 inline-flex items-center rounded-full bg-[var(--lux-primary-soft)] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--lux-primary-muted)] border border-[var(--lux-primary)]/20">
            {eyebrow}
          </span>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--lux-text-strong)] sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-xs font-medium leading-relaxed text-[var(--lux-muted-soft)] sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">{actions}</div>}
    </header>
  )
}

