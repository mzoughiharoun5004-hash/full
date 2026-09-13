'use client'

import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Check,
  FileArchive,
  Library,
  MessageSquareText,
  PenLine,
  ShieldCheck,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const heroPhotoUrl =
  'https://images.pexels.com/photos/5212655/pexels-photo-5212655.jpeg?auto=compress&cs=tinysrgb&w=1800'

const workflow = [
  {
    number: '01',
    icon: PenLine,
    title: 'Shape the learning path',
    detail: 'Write lessons, decisions, and assessments in one structured course document.',
  },
  {
    number: '02',
    icon: MessageSquareText,
    title: 'Review with context',
    detail: 'Keep feedback, ownership, and approval status connected to the scenario.',
  },
  {
    number: '03',
    icon: FileArchive,
    title: 'Validate delivery',
    detail: 'Preview SCORM packages and verify the learner experience before release.',
  },
]

const capabilities = [
  'Scenario and course authoring',
  'Shared media library',
  'Review and approval workflow',
  'SCORM package preview',
]

function PrimaryLink({
  href,
  children,
  light,
}: {
  href: string
  children: React.ReactNode
  light?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        light
          ? 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-[var(--lux-primary)] shadow-md transition-all hover:bg-white/90 hover:shadow-lg'
          : 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--lux-primary)] px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-[var(--lux-primary-hover)] hover:shadow-lg'
      }
    >
      {children}
    </Link>
  )
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--lux-line-strong)] bg-[var(--lux-surface)] px-6 text-sm font-bold text-[var(--lux-text-strong)] shadow-sm transition-all hover:bg-[var(--lux-elevated)]"
    >
      {children}
    </Link>
  )
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--lux-bg)] text-[var(--lux-text)]">
      <section className="relative flex min-h-[660px] flex-col justify-between overflow-hidden pb-12 pt-4 lg:min-h-[720px] lg:pb-16">
        <div
          className="absolute inset-0 bg-cover bg-[center_36%] lg:bg-center opacity-90 dark:opacity-75 transition-opacity duration-300 pointer-events-none"
          style={{ backgroundImage: `url(${heroPhotoUrl})` }}
          role="img"
          aria-label="An educator leading an online learning session"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--lux-bg)]/30 via-transparent to-[var(--lux-bg)] pointer-events-none" />

        <header className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 rounded-2xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface)]/80 px-4 backdrop-blur-xl shadow-xl sm:px-6">
            <Link href="/" className="flex min-w-0 items-center gap-3 text-[var(--lux-text-strong)] group">
              <div className="grid h-9.5 w-9.5 place-items-center rounded-xl bg-[var(--lux-primary)] text-white shadow-[0_4px_14px_rgba(16,185,129,0.35)] transition-transform duration-300 group-hover:scale-105">
                <BookOpen size={17} />
              </div>
              <div className="min-w-0">
                <span className="block truncate text-sm font-extrabold tracking-tight">SupScenario</span>
                <span className="hidden text-[11px] font-medium text-[var(--lux-muted-soft)] sm:block">Learning design workspace</span>
              </div>
            </Link>

            <nav className="hidden items-center gap-7 text-xs font-bold uppercase tracking-wider text-[var(--lux-muted)] md:flex">
              <a href="#workflow" className="transition-colors hover:text-[var(--lux-primary-muted)]">Workflow</a>
              <a href="#platform" className="transition-colors hover:text-[var(--lux-primary-muted)]">Platform</a>
            </nav>

            <div className="flex items-center gap-2.5">
              <ThemeToggle compact />
              <Link
                href="/auth/login"
                className="hidden h-9.5 items-center rounded-xl px-4 text-xs font-bold text-[var(--lux-text-strong)] transition-colors hover:bg-[var(--lux-overlay-hover)] sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[var(--lux-primary)] px-4 text-xs font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.35)] transition-all hover:bg-[var(--lux-primary-hover)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.45)] active:scale-[0.98]"
              >
                Get started
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </header>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
          <div className="max-w-2xl rounded-3xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface)]/90 p-8 shadow-2xl backdrop-blur-2xl sm:p-11">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--lux-primary)]/35 bg-[var(--lux-primary-soft)] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-[var(--lux-primary-muted)] shadow-xs">
              <span className="h-2 w-2 rounded-full bg-[var(--lux-primary-muted)] animate-pulse" />
              Course authoring & review
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-[var(--lux-text-strong)] sm:text-5xl lg:text-6xl">
              SupScenario
            </h1>
            <p className="mt-4 text-lg font-bold text-[var(--lux-text)] sm:text-xl">
              Turn complex training material into clear, interactive learning paths.
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--lux-muted)] sm:text-base">
              Author scenarios, organize media, coordinate team review, and validate SCORM delivery from one unified workspace.
            </p>
            <div className="mt-9 flex flex-col gap-3.5 sm:flex-row sm:items-center">
              <PrimaryLink href="/auth/register">
                Start authoring
                <ArrowRight size={16} />
              </PrimaryLink>
              <SecondaryLink href="/auth/login">Open dashboard</SecondaryLink>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-[var(--lux-line)] bg-[var(--lux-bg-alt)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--lux-primary-muted)]">Workflow</p>
              <h2 className="mt-3 max-w-md text-3xl font-bold leading-tight text-[var(--lux-text-strong)] sm:text-4xl">
                From rough source material to a review-ready course.
              </h2>
            </div>

            <div className="grid border-t border-[var(--lux-line)] md:grid-cols-3">
              {workflow.map(({ number, icon: Icon, title, detail }, index) => (
                <article
                  key={title}
                  className={`border-b border-[var(--lux-line)] py-6 md:border-b-0 md:px-6 ${
                    index > 0 ? 'md:border-l' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--lux-muted-soft)]">{number}</span>
                    <Icon size={18} className="text-[var(--lux-primary-muted)]" />
                  </div>
                  <h3 className="mt-8 text-base font-bold text-[var(--lux-text-strong)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--lux-muted)]">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="bg-[var(--lux-bg)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--lux-info)]">One workspace</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight text-[var(--lux-text-strong)] sm:text-4xl">
              Keep course structure, team decisions, and delivery checks connected.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--lux-muted)]">
              SupScenario gives educators and instructional teams a practical system for repeated authoring work, without scattering the course across documents, folders, and disconnected review threads.
            </p>
          </div>

          <div className="border-t border-[var(--lux-line)]">
            {capabilities.map((capability) => (
              <div
                key={capability}
                className="flex items-center gap-3 border-b border-[var(--lux-line)] py-4 text-sm font-semibold text-[var(--lux-text)]"
              >
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]">
                  <Check size={14} />
                </span>
                {capability}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--lux-line)] bg-[var(--lux-primary)] text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 text-white/75">
              <Library size={17} />
              <ShieldCheck size={17} />
            </div>
            <h2 className="mt-4 text-3xl font-bold">Build the next course in one place.</h2>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Start a new learning scenario or continue work already in review.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-white/35 px-5 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              Log in
            </Link>
            <PrimaryLink href="/auth/register" light>
              Create account
              <ArrowRight size={15} />
            </PrimaryLink>
          </div>
        </div>
      </section>

      <footer className="bg-[var(--lux-bg)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-[var(--lux-muted-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>SupScenario</span>
          <span>Course authoring, review, and SCORM validation.</span>
        </div>
      </footer>
    </main>
  )
}
