'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: ReactNode
  iconRight?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { label, error, hint, icon, iconRight, className, id, style, ...props },
    ref,
  ) {
    const paddingLeft = icon ? '2.5rem' : '0.875rem'
    const paddingRight = iconRight ? '2.5rem' : '0.875rem'

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[var(--lux-text)]">
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--lux-muted-soft)]">
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            style={{ paddingLeft, paddingRight, ...style }}
            className={cn(
              'h-10.5 w-full rounded-xl border bg-[var(--lux-surface)] text-sm text-[var(--lux-text)] shadow-xs',
              'placeholder:text-[var(--lux-muted-soft)]',
              'transition-all duration-200',
              'focus:border-[var(--lux-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--lux-focus)] focus:shadow-[0_0_15px_rgba(16,185,129,0.15)]',
              error
                ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20'
                : 'border-[var(--lux-line)] hover:border-[var(--lux-line-strong)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            {...props}
          />

          {iconRight && (
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--lux-muted-soft)]">
              {iconRight}
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-1 text-xs text-[#EF4444]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--lux-muted-soft)]">{hint}</p>
        )}
      </div>
    )
  },
)
