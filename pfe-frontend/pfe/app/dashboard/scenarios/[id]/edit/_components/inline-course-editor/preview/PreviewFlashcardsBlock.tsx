import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { CourseBlock, CourseInteractionItem } from '@/types'
import { PreviewItemMedia } from './PreviewListBlock'

export function PreviewFlashcardsBlock({
  block,
  accentColor,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  onComplete?: () => void
}) {
  const items = block.items ?? []
  const [flippedCards, setFlippedCards] = useState<Set<string>>(() => new Set())

  const flipCard = (id: string) => {
    setFlippedCards((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      if (!current.has(id) && items.every((item) => item.id === id || next.has(item.id))) {
        window.setTimeout(() => onComplete?.(), 0)
      }
      return next
    })
  }

  const card = (item: CourseInteractionItem) => {
    const flipped = flippedCards.has(item.id)
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => flipCard(item.id)}
        className="group relative flex min-h-[240px] flex-1 basis-[220px] cursor-pointer flex-col text-center outline-none [perspective:1000px]"
        style={{ minWidth: '200px' }}
      >
        <div 
          className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front Face */}
          <div 
            className="absolute inset-0 flex flex-col overflow-hidden [backface-visibility:hidden]"
            style={{
              boxShadow: '0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${accentColor}`,
              borderRadius: '2px',
              background: 'var(--lux-surface)',
            }}
          >
            <div className="flex w-full justify-end p-3">
              <RefreshCw size={16} className="text-[var(--lux-text-strong)] opacity-60 transition-opacity hover:opacity-100" />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
              {item.mediaUrl && ((item.match || 'front') === 'front') && (
                <div className="mb-4 flex w-full justify-center">
                  <PreviewItemMedia item={item} />
                </div>
              )}
              <p className="text-lg font-normal leading-relaxed text-[var(--lux-text-strong)]">
                {item.title || '\u2014'}
              </p>
            </div>
          </div>

          {/* Back Face */}
          <div 
            className="absolute inset-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{
              boxShadow: '0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${accentColor}`,
              borderRadius: '2px',
              background: 'var(--lux-surface)',
            }}
          >
            <div className="flex w-full justify-end p-3">
              <RefreshCw size={16} className="text-[var(--lux-text-strong)] opacity-60 transition-opacity hover:opacity-100" style={{ transform: 'rotateY(180deg)' }} />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
              {item.mediaUrl && ((item.match || 'front') === 'back') && (
                <div className="mb-4 flex w-full justify-center">
                  <PreviewItemMedia item={item} />
                </div>
              )}
              <p className="text-lg font-normal leading-relaxed text-[var(--lux-text-strong)]">
                {item.content || '\u2014'}
              </p>
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 flex flex-wrap gap-5">{items.map(card)}</div>
    </section>
  )
}
