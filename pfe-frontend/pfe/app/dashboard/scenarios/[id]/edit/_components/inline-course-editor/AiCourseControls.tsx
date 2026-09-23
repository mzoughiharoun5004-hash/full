'use client'

import { useMemo, useState } from 'react'
import { Bot, Check, LoaderCircle, Sparkles, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { aiCoursesApi, getApiErrorMessage } from '@/lib/api'
import type { AiChangeSet, AiCourseBrief, AiCourseOutline, CourseDocument, Scenario } from '@/types'

const inputClass = 'w-full rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-3 py-2 text-sm text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] focus:ring-2 focus:ring-[var(--lux-primary)]/20'

// Temporary kill switch for the "Ask AI" edit control (course/lesson/block
// scopes, in AiCourseEditControl below). The "Create with AI" wizard is
// unaffected and always renders. Flip to `true` (or drop the
// `if (!ASK_AI_EDIT_VISIBLE) return null` below) to bring editing back too —
// nothing else changes: every prop, hook, and call site in
// InlineScenarioCourseEditor.tsx / LessonEditor.tsx / BlockItem.tsx stays
// wired up exactly as before.
const ASK_AI_EDIT_VISIBLE = false

export function AiCourseCreationWizard({ onCreated }: { onCreated: (scenario: Scenario) => void }) {
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState<AiCourseBrief>({
    topic: '', audience: 'General learners', language: 'English', difficulty: 'Beginner', objectives: [], estimatedMinutes: 30, tone: 'friendly', sourceMaterial: '',
  })
  const [objectivesText, setObjectivesText] = useState('')
  const [outline, setOutline] = useState<AiCourseOutline | null>(null)
  const [loading, setLoading] = useState<'outline' | 'create' | null>(null)

  const normalizedBrief = (): AiCourseBrief => ({
    ...brief,
    topic: brief.topic.trim(),
    audience: brief.audience.trim(),
    language: brief.language.trim(),
    difficulty: brief.difficulty.trim(),
    objectives: objectivesText.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 12),
    sourceMaterial: brief.sourceMaterial?.trim() || undefined,
  })

  const getOutline = async () => {
    const payload = normalizedBrief()
    if (!payload.topic) return toast.error('Enter a course topic first')
    setLoading('outline')
    try {
      const response = await aiCoursesApi.createOutline(payload)
      setOutline(response.data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not create an AI outline'))
    } finally {
      setLoading(null)
    }
  }

  const createCourse = async () => {
    setLoading('create')
    try {
      const response = await aiCoursesApi.create(normalizedBrief(), outline ?? undefined)
      setOpen(false)
      onCreated(response.data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not create the AI course'))
    } finally {
      setLoading(null)
    }
  }

  return <>
    <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
      <Sparkles size={14} className="mr-1" /> Create with AI
    </Button>
    {open && (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Create course with AI">
        <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--lux-line)] bg-[var(--lux-surface)] p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><h2 className="text-xl font-bold text-[var(--lux-text-strong)]">Create a course with AI</h2><p className="mt-1 text-sm text-[var(--lux-muted)]">Review the outline before a draft is created. You can edit every result afterward.</p></div>
            <button type="button" className="p-1 text-[var(--lux-muted)]" onClick={() => !loading && setOpen(false)} aria-label="Close"><X size={20} /></button>
          </div>
          {!outline ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-medium">Topic<input className={inputClass} value={brief.topic} onChange={(event) => setBrief({ ...brief, topic: event.target.value })} placeholder="e.g. Cybersecurity basics" /></label>
            <label className="text-sm font-medium">Audience<input className={inputClass} value={brief.audience} onChange={(event) => setBrief({ ...brief, audience: event.target.value })} /></label>
            <label className="text-sm font-medium">Difficulty<input className={inputClass} value={brief.difficulty} onChange={(event) => setBrief({ ...brief, difficulty: event.target.value })} /></label>
            <label className="text-sm font-medium">Language<input className={inputClass} value={brief.language} onChange={(event) => setBrief({ ...brief, language: event.target.value })} /></label>
            <label className="text-sm font-medium">Duration (minutes)<input className={inputClass} type="number" min="5" max="480" value={brief.estimatedMinutes} onChange={(event) => setBrief({ ...brief, estimatedMinutes: Number(event.target.value) })} /></label>
            <label className="sm:col-span-2 text-sm font-medium">Learning objectives, one per line<textarea className={`${inputClass} min-h-24`} value={objectivesText} onChange={(event) => setObjectivesText(event.target.value)} placeholder="Recognize common phishing tactics\nChoose an appropriate response" /></label>
            <label className="sm:col-span-2 text-sm font-medium">Optional source material<textarea className={`${inputClass} min-h-24`} value={brief.sourceMaterial} onChange={(event) => setBrief({ ...brief, sourceMaterial: event.target.value })} placeholder="Paste material the AI should use. Do not include secrets or private data." /></label>
            <div className="sm:col-span-2 flex justify-end"><Button type="button" onClick={getOutline} disabled={loading !== null}>{loading === 'outline' ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : <Sparkles className="mr-2" size={16} />}Generate outline</Button></div>
          </div> : <div className="space-y-5">
            <div><h3 className="text-lg font-bold text-[var(--lux-text-strong)]">{outline.title}</h3><p className="mt-1 text-sm text-[var(--lux-muted)]">{outline.description}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-[var(--lux-muted)]">Objectives</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{outline.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></div>
            <ol className="space-y-2">{outline.lessons.map((lesson, index) => <li key={`${lesson.title}-${index}`} className="rounded-lg border border-[var(--lux-line)] p-3"><p className="font-semibold">{index + 1}. {lesson.title} <span className="font-normal text-[var(--lux-muted)]">· {lesson.estimatedMinutes} min</span></p><p className="mt-1 text-sm text-[var(--lux-muted)]">{lesson.summary}</p></li>)}</ol>
            <div className="flex justify-between gap-3"><Button type="button" variant="secondary" onClick={() => setOutline(null)}>Edit brief</Button><Button type="button" onClick={createCourse} disabled={loading !== null}>{loading === 'create' ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : <Check className="mr-2" size={16} />}Create draft course</Button></div>
          </div>}
        </section>
      </div>
    )}
  </>
}

export function AiCourseEditControl({
  scenarioId,
  document,
  scope,
  onApplied,
  courseDocumentVersion,
  onBeforePropose,
  compact = false,
}: {
  scenarioId: string
  document: CourseDocument
  scope: { type: 'course' } | { type: 'lesson'; lessonId: string } | { type: 'block'; lessonId: string; blockId: string }
  onApplied: (document: CourseDocument) => void
  courseDocumentVersion?: number
  onBeforePropose?: () => Promise<{ document: CourseDocument; version: number } | null>
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState<AiChangeSet | null>(null)
  const [loading, setLoading] = useState<'propose' | 'apply' | null>(null)
  const expectedVersion = courseDocumentVersion ?? (Number(document.metadata?.version) || 1)

  const propose = async () => {
    if (!instruction.trim()) return toast.error('Describe the change you want')
    setLoading('propose')
    try {
      const savedBaseline = onBeforePropose ? await onBeforePropose() : null
      if (onBeforePropose && !savedBaseline) return
      const response = await aiCoursesApi.proposeEdit(scenarioId, {
        instruction: instruction.trim(),
        scope,
        courseDocument: savedBaseline?.document ?? document,
        expectedVersion: savedBaseline?.version ?? expectedVersion,
      })
      setProposal(response.data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not get an AI suggestion'))
    } finally { setLoading(null) }
  }

  const apply = async () => {
    if (!proposal) return
    setLoading('apply')
    try {
      const response = await aiCoursesApi.apply(proposal.id)
      onApplied(response.data)
      toast.success('AI change applied')
      setOpen(false)
      setProposal(null)
      setInstruction('')
    } catch (error) { toast.error(getApiErrorMessage(error, 'Could not apply the AI change'))
    } finally { setLoading(null) }
  }

  const reject = async () => {
    if (proposal) {
      try { await aiCoursesApi.reject(proposal.id) } catch { /* A failed dismissal leaves the proposal harmless. */ }
    }
    setProposal(null)
    setOpen(false)
  }

  if (!ASK_AI_EDIT_VISIBLE) return null

  return <>
    <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)} title="Ask AI to propose an edit">
      <Bot size={14} className={compact ? '' : 'mr-1'} />{compact ? null : 'Ask AI'}
    </Button>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Ask AI to edit course content">
      <section className="w-full max-w-xl rounded-xl border border-[var(--lux-line)] bg-[var(--lux-surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between"><div><h2 className="text-lg font-bold">Ask AI</h2><p className="text-sm text-[var(--lux-muted)]">The AI proposes a change. Nothing is saved until you apply it.</p></div><button type="button" onClick={() => !loading && reject()} aria-label="Close"><X size={20} /></button></div>
        {!proposal ? <><textarea autoFocus className={`${inputClass} min-h-28`} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Example: simplify this content for beginners and add a practical example." /><p className="mt-2 text-xs text-[var(--lux-muted)]">Your latest edits are saved before AI receives the selected content. You can review and reject its proposal.</p><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={propose} disabled={loading !== null}>{loading ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : <Sparkles className="mr-2" size={16} />}Propose change</Button></div></> : <><ProposalReview proposal={proposal} /><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={reject}>Reject</Button><Button type="button" onClick={apply} disabled={loading !== null}>{loading ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : <Check className="mr-2" size={16} />}Apply change</Button></div></>}
      </section>
    </div>}
  </>
}

function ProposalReview({ proposal }: { proposal: AiChangeSet }) {
  const changes = useMemo(() => (proposal.proposal.patches ?? []).map((patch) => {
    const details = patch as {
      block?: { title?: string; content?: string }
      blocks?: unknown[]
      lesson?: { title?: string }
    }
    if (patch.op === 'replace_block') return `Replace “${details.block?.title || details.block?.content?.slice(0, 70) || 'untitled block'}”`
    if (patch.op === 'insert_blocks') {
      const count = details.blocks?.length ?? 0
      return `Add ${count} block${count === 1 ? '' : 's'}`
    }
    if (patch.op === 'remove_block') return 'Remove one block'
    if (patch.op === 'replace_lesson') return `Replace lesson “${details.lesson?.title ?? 'untitled lesson'}”`
    if (patch.op === 'insert_lesson') return `Add lesson “${details.lesson?.title ?? 'untitled lesson'}”`
    return 'Update course details'
  }), [proposal.proposal.patches])

  return <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4">
    <p className="font-semibold">Review AI proposal</p>
    <p className="mt-1 text-sm text-[var(--lux-muted)]">{proposal.proposal.summary || 'AI proposed updates to the selected content.'}</p>
    <ul className="mt-3 space-y-2 text-sm">{changes.map((change, index) => <li key={`${change}-${index}`} className="flex gap-2"><Check className="mt-0.5 shrink-0 text-[var(--lux-primary)]" size={15} />{change}</li>)}</ul>
  </div>
}
