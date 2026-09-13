'use client'

import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: 'sm' | 'md' | 'lg'
  className?: string
  dot?: boolean
  pulse?: boolean
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-[var(--lux-surface-soft)] text-[var(--lux-text)] border-[var(--lux-line)]',
  success: 'bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)] border-[var(--lux-primary)]/30',
  warning: 'bg-[var(--lux-gold-soft)] text-[var(--lux-gold)] border-[var(--lux-gold)]/30',
  danger:  'bg-red-500/12 text-red-400 border-red-500/25',
  info:    'bg-[var(--lux-info-soft)] text-[var(--lux-info)] border-[var(--lux-info)]/30',
  purple:  'bg-[var(--lux-violet-soft)] text-[var(--lux-violet)] border-[var(--lux-violet)]/30',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[var(--lux-muted)]',
  success: 'bg-[var(--lux-primary-muted)] shadow-[0_0_8px_rgba(16,185,129,0.8)]',
  warning: 'bg-[var(--lux-gold)] shadow-[0_0_8px_rgba(245,158,11,0.8)]',
  danger:  'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]',
  info:    'bg-[var(--lux-info)] shadow-[0_0_8px_rgba(56,189,248,0.8)]',
  purple:  'bg-[var(--lux-violet)] shadow-[0_0_8px_rgba(167,139,250,0.8)]',
}

export function Badge({ children, variant = 'default', size = 'sm', className, dot, pulse }: BadgeProps) {
  const sizeClasses = {
    sm: 'px-2.5 py-0.5 text-[11px] font-semibold',
    md: 'px-3 py-1 text-xs font-bold',
    lg: 'px-3.5 py-1.5 text-xs font-bold tracking-wide uppercase',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border backdrop-blur-sm transition-all duration-200',
        sizeClasses[size],
        variants[variant],
        className
      )}
    >
      {(dot || pulse) && (
        <span className="relative flex h-2 w-2 items-center justify-center">
          {pulse && (
            <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dotColors[variant])} />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotColors[variant])} />
        </span>
      )}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant; pulse?: boolean }> = {
    BROUILLON: { label: 'Draft', variant: 'warning' },
    EN_COURS_VALIDATION: { label: 'In review', variant: 'info', pulse: true },
    APPROUVE: { label: 'Approved', variant: 'success', pulse: true },
    EXPORTE: { label: 'Approved', variant: 'success', pulse: true },
    ARCHIVE: { label: 'Archived', variant: 'default' },
    DRAFT: { label: 'Draft', variant: 'warning' },
    PUBLISHED: { label: 'Published', variant: 'success', pulse: true },
    ARCHIVED: { label: 'Archived', variant: 'default' },
    EDUCATOR: { label: 'Educator', variant: 'info' },
    TEACHER: { label: 'Educator', variant: 'info' },
    ADMIN: { label: 'Admin', variant: 'purple' },
  }
  const cfg = map[status] ?? { label: status, variant: 'default' }
  return <Badge variant={cfg.variant} dot pulse={cfg.pulse}>{cfg.label}</Badge>
}
