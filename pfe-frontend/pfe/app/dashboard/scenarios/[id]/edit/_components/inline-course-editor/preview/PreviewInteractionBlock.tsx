import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'

export function PreviewInteractionBlock({ block }: { block: CourseBlock }) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      {items.length > 0 && (
        <div className={cn('mt-4 grid gap-3', block.type === 'flashcards' && 'sm:grid-cols-2')}>
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4">
              {item.title && <p className="font-semibold">{item.title}</p>}
              {item.content && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{item.content}</p>}
              {item.match && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted)]">{item.match}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
