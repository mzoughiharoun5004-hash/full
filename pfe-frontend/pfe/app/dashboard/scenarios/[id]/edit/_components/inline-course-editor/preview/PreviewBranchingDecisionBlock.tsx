import { useState } from 'react'
import type { CourseBlock } from '@/types'

export function PreviewBranchingDecisionBlock({
  block,
  accentColor,
  onOpenLessonById,
  getLessonTitle,
}: {
  block: CourseBlock
  accentColor: string
  onOpenLessonById: (lessonId: string) => void
  getLessonTitle: (lessonId: string) => string
}) {
  const choices = (block.items ?? []).filter((item) => item.title?.trim())
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null)
  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId) ?? null

  if (!choices.length) {
    return <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">Add at least two choices to this decision.</p>
  }

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">{block.type === 'choice_point' ? 'Choice point' : 'Branching dialogue'}</p>
      {block.title && <h3 className="mt-1 text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 grid gap-3">
        {choices.map((choice) => {
          const destinationId = choice.match ?? ''
          const linked = Boolean(destinationId)
          return (
            <button
              key={choice.id}
              type="button"
              disabled={!linked}
              onClick={() => {
                setSelectedChoiceId(choice.id)
                if (destinationId) onOpenLessonById(destinationId)
              }}
              className="rounded-lg border px-4 py-3 text-left text-sm transition enabled:hover:border-[var(--lux-primary-muted)] enabled:hover:bg-[var(--lux-surface-soft)] disabled:cursor-not-allowed disabled:opacity-45"
              style={selectedChoiceId === choice.id ? { borderColor: accentColor, background: `${accentColor}18` } : undefined}
            >
              <span className="block font-bold text-[var(--lux-text-strong)]">{choice.title}</span>
              {choice.content && <span className="mt-1 block text-xs leading-5 text-[var(--lux-muted)]">{choice.content}</span>}
              <span className="mt-2 block text-xs font-semibold" style={{ color: accentColor }}>
                {linked ? `Continue to: ${getLessonTitle(destinationId)}` : 'Destination not linked'}
              </span>
            </button>
          )
        })}
      </div>
      {selectedChoice?.content && <p className="mt-4 rounded-lg bg-[var(--lux-surface-soft)] px-3 py-2 text-sm text-[var(--lux-text)]">{selectedChoice.content}</p>}
    </section>
  )
}
