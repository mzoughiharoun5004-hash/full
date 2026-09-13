'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  variant?: 'default' | 'glass' | 'elevated' | 'outline'
  onClick?: () => void
  as?: 'div' | 'article' | 'section'
}

const cardVariants = {
  default:  'bg-[var(--lux-surface)] border-[var(--lux-line)] shadow-sm hover:border-[var(--lux-line-strong)]',
  glass:    'lux-glass-card',
  elevated: 'bg-[var(--lux-surface-soft)] border-[var(--lux-line-strong)] shadow-md',
  outline:  'bg-transparent border-[var(--lux-line)] shadow-none',
}

export function Card({ children, className, hover, variant = 'default', onClick, as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'rounded-2xl border transition-all duration-300 overflow-hidden',
        cardVariants[variant],
        hover && 'cursor-pointer hover:-translate-y-1 hover:border-[var(--lux-primary)]/45 hover:shadow-[0_16px_36px_rgba(0,0,0,0.22)]',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </Tag>
  )
}

interface CardHeaderProps { children: ReactNode; className?: string }
export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn(
      'flex min-h-13 items-center justify-between border-b border-[var(--lux-line)]/70 px-5 py-4 sm:px-6',
      className
    )}>
      {children}
    </div>
  )
}

interface CardBodyProps { children: ReactNode; className?: string }
export function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={cn('px-5 py-5 sm:px-6', className)}>
      {children}
    </div>
  )
}

