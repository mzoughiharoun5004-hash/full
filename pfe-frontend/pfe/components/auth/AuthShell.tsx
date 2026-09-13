'use client'

import Link from 'next/link'
import { BookOpen, CheckCircle2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const authPhotoUrl =
  'https://images.pexels.com/photos/5212655/pexels-photo-5212655.jpeg?auto=compress&cs=tinysrgb&w=1400'

interface AuthShellProps {
  title: string
  description: string
  children: React.ReactNode
  footer: React.ReactNode
}

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="grid min-h-screen bg-[var(--lux-bg)] text-[var(--lux-text)] lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden min-h-screen overflow-hidden border-r border-[var(--lux-line)] lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${authPhotoUrl})` }}
          role="img"
          aria-label="An educator facilitating an online class"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--lux-bg)]/40 via-transparent to-[var(--lux-bg)]/75 pointer-events-none" />

        <div className="relative flex h-full flex-col justify-between p-8 xl:p-12">
          <Link href="/" className="inline-flex w-fit items-center gap-3 rounded-2xl border border-[var(--lux-line)] bg-[var(--lux-surface)]/85 px-4 py-2.5 backdrop-blur-md shadow-lg">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--lux-primary)] text-white shadow-sm">
              <BookOpen size={17} />
            </span>
            <span>
              <span className="block text-sm font-bold text-[var(--lux-text-strong)]">SupScenario</span>
              <span className="block text-[11px] text-[var(--lux-muted-soft)]">Learning design workspace</span>
            </span>
          </Link>

          <div className="max-w-lg rounded-3xl border border-[var(--lux-line)] bg-[var(--lux-surface)]/90 p-8 shadow-2xl backdrop-blur-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lux-primary)]/30 bg-[var(--lux-primary-soft)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--lux-primary-muted)]">
              Focused course operations
            </span>
            <p className="mt-4 text-3xl font-bold leading-tight text-[var(--lux-text-strong)]">
              Keep authoring, review, and delivery in one connected workflow.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-[var(--lux-muted)]">
              <CheckCircle2 size={16} className="text-[var(--lux-primary-muted)]" />
              Structured for educators and instructional teams
            </div>
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-16 sm:px-8 lg:px-12">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle compact />
        </div>

        <div className="w-full max-w-[440px]">
          <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--lux-primary)] text-white">
              <BookOpen size={17} />
            </span>
            <span className="text-base font-bold text-[var(--lux-text-strong)]">SupScenario</span>
          </Link>

          <div className="border-t border-[var(--lux-line)] pt-8">
            <h1 className="text-3xl font-bold text-[var(--lux-text-strong)]">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--lux-muted)]">{description}</p>
            <div className="mt-8">{children}</div>
          </div>

          <div className="mt-7 border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">
            {footer}
          </div>
        </div>
      </main>
    </div>
  )
}
