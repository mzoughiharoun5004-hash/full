'use client'

import { cn } from '@/lib/utils'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'glass'
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'icon'
  loading?: boolean
  children?: ReactNode
}

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:   'bg-[var(--lux-primary)] hover:bg-[var(--lux-primary-hover)] text-white border-[var(--lux-primary)] hover:border-[var(--lux-primary-hover)] shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)]',
  secondary: 'bg-[var(--lux-surface-soft)] hover:bg-[var(--lux-elevated)] text-[var(--lux-text)] border-[var(--lux-line)] hover:border-[var(--lux-line-strong)] shadow-xs',
  ghost:     'bg-transparent hover:bg-[var(--lux-primary-soft)] text-[var(--lux-muted)] hover:text-[var(--lux-text)] border-transparent',
  danger:    'bg-red-600/15 hover:bg-red-600/25 text-red-400 border-red-500/30 hover:border-red-500/50 shadow-xs',
  outline:   'bg-transparent hover:bg-[var(--lux-primary-soft)] text-[var(--lux-text)] border-[var(--lux-line)] hover:border-[var(--lux-primary)]',
  glass:     'bg-[var(--lux-surface)]/70 backdrop-blur-md hover:bg-[var(--lux-surface)] text-[var(--lux-text)] border-[var(--lux-line)] hover:border-[var(--lux-primary)] shadow-sm',
}

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm:   'h-8 px-3.5 text-xs rounded-lg gap-1.5 font-semibold',
  md:   'h-10 px-4.5 text-sm rounded-xl gap-2 font-semibold',
  lg:   'h-11 px-6 text-sm rounded-xl gap-2.5 font-bold',
  xl:   'h-12 px-7 text-base rounded-2xl gap-3 font-bold',
  icon: 'h-9 w-9 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center border font-medium',
        'transition-all duration-200 cursor-pointer select-none',
        'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lux-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lux-bg)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin flex-shrink-0 text-current"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
})
