'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

export function Modal({ open, onClose, title, children, size = 'md', className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-md sm:items-center lux-scrollbar"
    >
      <div
        className={cn(
          'flex max-h-[calc(100vh-2.5rem)] w-full flex-col overflow-hidden rounded-3xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface)]/95 shadow-2xl backdrop-blur-xl',
          'transition-all duration-200',
          sizes[size],
          className
        )}
        style={{ animation: 'modal-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--lux-line)]/70 px-6 py-4.5">
            <h2 className="text-base font-bold tracking-tight text-[var(--lux-text-strong)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-xl text-[var(--lux-muted)] transition-all hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-text-strong)]"
              aria-label="Close dialog"
            >
              <X size={17} />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto p-6 lux-scrollbar">{children}</div>
      </div>
    </div>
  )
}
