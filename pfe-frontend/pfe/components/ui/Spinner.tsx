'use client'

import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <svg
      className={cn('animate-spin text-[var(--lux-primary)]', sizes[size], className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--lux-bg)]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--lux-primary)]">
            <span className="text-xl font-bold text-white">S</span>
          </div>
          <Spinner size="lg" className="absolute -inset-1 text-[#C6A765]/40" />
        </div>
        <p className="text-sm text-[var(--lux-muted)]">Loading SupScenario...</p>
      </div>
    </div>
  )
}
