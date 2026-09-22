import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'
import { previewMetaString } from './previewHelpers'

export function PreviewSortingBlock({
  block,
  accentColor,
  completed,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  completed: boolean
  onComplete?: () => void
}) {
  const items = (block.items ?? []).filter((item) => item.title.trim())
  const categories = Array.from(
    new Set(items.map((item) => item.match?.trim()).filter((category): category is string => Boolean(category))),
  ).slice(0, 4)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [sortedIds, setSortedIds] = useState<Set<string>>(() => new Set())
  const [wrongIds, setWrongIds] = useState<Set<string>>(() => new Set())
  const [firstTryWrongIds, setFirstTryWrongIds] = useState<Set<string>>(() => new Set())

  const unsortedItems = items.filter((item) => !sortedIds.has(item.id))

  const attemptDrop = (category: string) => {
    if (!selectedItemId) return
    const item = items.find((candidate) => candidate.id === selectedItemId)
    if (!item) return

    if ((item.match ?? '').trim() === category) {
      const nextSorted = new Set(sortedIds)
      nextSorted.add(item.id)
      setSortedIds(nextSorted)
      setSelectedItemId(null)
      if (nextSorted.size === items.length) onComplete?.()
      return
    }

    setWrongIds((current) => new Set(current).add(item.id))
    setFirstTryWrongIds((current) => new Set(current).add(item.id))
    window.setTimeout(() => {
      setWrongIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }, 450)
  }

  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content || previewMetaString(block, 'instructions', 'Sort each item into the correct category.')}</p>
      {completed ? (
        <div className="mt-5 rounded-lg border border-[var(--lux-primary-muted)]/40 bg-[var(--lux-primary-muted)]/10 p-4">
          <p className="font-bold text-[var(--lux-text-strong)]">{previewMetaString(block, 'completionMessage', 'All items sorted.')}</p>
          <p className="mt-1 text-sm text-[var(--lux-muted)]">First try score: {items.length - firstTryWrongIds.size} / {items.length}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--lux-muted)]">Items</p>
            {unsortedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-3 text-left text-sm font-semibold transition',
                  selectedItemId === item.id ? 'border-[var(--lux-primary-muted)] bg-[var(--lux-primary-muted)]/15 text-[var(--lux-text-strong)]' : 'border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-[var(--lux-text-strong)] hover:border-[var(--lux-primary-muted)]/60',
                  wrongIds.has(item.id) && 'animate-[sorting-shake_0.4s_ease-in-out]',
                )}
              >
                {item.title.slice(0, 80)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => attemptDrop(category)}
                disabled={!selectedItemId}
                className="min-h-28 rounded-lg border border-dashed border-[var(--lux-primary-muted)]/45 bg-[var(--lux-surface-soft)] p-4 text-left transition hover:border-[var(--lux-primary-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="block text-sm font-bold text-[var(--lux-text-strong)]">{category}</span>
                <span className="mt-2 block text-xs text-[var(--lux-muted)]">Select an item, then choose this target.</span>
                <span className="mt-3 inline-flex rounded-full px-2 py-1 text-xs font-bold text-[var(--lux-text-strong)]" style={{ background: accentColor }}>
                  {items.filter((item) => sortedIds.has(item.id) && (item.match ?? '').trim() === category).length} sorted
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
