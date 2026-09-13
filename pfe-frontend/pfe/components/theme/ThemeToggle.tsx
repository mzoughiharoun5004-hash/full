'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  compact?: boolean
  className?: string
}

export function ThemeToggle({ compact, className }: ThemeToggleProps) {
  const { themeName, toggleTheme } = useTheme()
  const nextTheme = themeName === 'dark' ? 'light' : 'dark'
  const Icon = themeName === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold',
        'border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-[var(--lux-text-strong)]',
        'transition-colors hover:bg-[var(--lux-elevated)]',
        compact && 'h-9 w-9 px-0',
        className
      )}
      title={`Switch to ${nextTheme} theme`}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      <Icon size={15} />
      {!compact && (
        <span className="hidden sm:inline">
          {nextTheme === 'dark' ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  )
}
