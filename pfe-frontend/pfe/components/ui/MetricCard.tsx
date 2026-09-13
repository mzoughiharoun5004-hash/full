'use client'

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface MetricCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  iconVariant?: 'primary' | 'info' | 'violet' | 'gold' | 'danger'
  trend?: {
    value: string
    label?: string
    isPositive?: boolean
  }
  className?: string
  action?: ReactNode
  onClick?: () => void
}

const iconVariantStyles = {
  primary: 'bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)] border-[var(--lux-primary)]/25',
  info:    'bg-[var(--lux-info-soft)] text-[var(--lux-info)] border-[var(--lux-info)]/25',
  violet:  'bg-[var(--lux-violet-soft)] text-[var(--lux-violet)] border-[var(--lux-violet)]/25',
  gold:    'bg-[var(--lux-gold-soft)] text-[var(--lux-gold)] border-[var(--lux-gold)]/25',
  danger:  'bg-red-500/12 text-red-400 border-red-500/25',
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  iconVariant = 'primary',
  trend,
  className,
  action,
  onClick,
}: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-[var(--lux-line)]/90 bg-[var(--lux-surface)] p-5 shadow-xs',
        'transition-all duration-300 hover:-translate-y-1 hover:border-[var(--lux-primary)]/45 hover:shadow-[0_14px_32px_rgba(0,0,0,0.22)]',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Background glow accent on hover */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--lux-primary)]/8 blur-2xl transition-opacity duration-300 group-hover:opacity-100 opacity-0" />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-[var(--lux-muted-soft)]">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-[var(--lux-text-strong)] sm:text-3xl">
              {value}
            </span>
          </div>
        </div>

        {Icon && (
          <div className={cn('grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border transition-all duration-300 group-hover:scale-110 group-hover:shadow-md', iconVariantStyles[iconVariant])}>
            <Icon size={20} />
          </div>
        )}
      </div>

      {(description || trend || action) && (
        <div className="mt-4 flex items-center justify-between border-t border-[var(--lux-line)]/60 pt-3 text-xs">
          {trend ? (
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase',
                  trend.isPositive !== false
                    ? 'bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)] border border-[var(--lux-primary)]/20'
                    : 'bg-red-500/12 text-red-400 border border-red-500/20'
                )}
              >
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-[var(--lux-muted-soft)] font-medium">{trend.label}</span>
              )}
            </div>
          ) : (
            <span className="truncate text-[var(--lux-muted-soft)] font-medium">{description}</span>
          )}

          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
    </div>
  )
}

