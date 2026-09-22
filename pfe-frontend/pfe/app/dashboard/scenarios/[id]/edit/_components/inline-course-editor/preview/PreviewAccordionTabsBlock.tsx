import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseBlock, CourseInteractionItem } from '@/types'
import { PreviewInteractionBlock } from './PreviewInteractionBlock'
import { PreviewItemMedia } from './PreviewListBlock'
import { previewMetaString, previewMetaBoolean } from './previewHelpers'

export function PreviewAccordionTabsBlock({
  block,
  accentColor,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  onComplete?: () => void
}) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  const isTabs = block.type === 'tabs'
  const [activeTabId, setActiveTabId] = useState(() => items[0]?.id ?? '')
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const [visitedIds, setVisitedIds] = useState<Set<string>>(() => new Set(isTabs && items[0]?.id ? [items[0].id] : []))
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const allowMultiple = previewMetaString(block, 'behavior', 'single') === 'multiple'
  const showOverflowArrows = previewMetaBoolean(block, 'overflowArrows', true)
  const activeItemId = items.some((item) => item.id === activeTabId) ? activeTabId : items[0]?.id ?? ''

  const markVisited = useCallback((itemId: string) => {
    setVisitedIds((current) => {
      if (current.has(itemId)) return current
      const next = new Set(current)
      next.add(itemId)
      return next
    })
  }, [])

  useEffect(() => {
    if (items.length > 0 && visitedIds.size >= items.length) onComplete?.()
  }, [items.length, onComplete, visitedIds])

  if (!items.length) {
    return <PreviewInteractionBlock block={block} />
  }

  if (isTabs) {
    const activeItem = items.find((item) => item.id === activeItemId) ?? items[0]
    const selectTab = (itemId: string) => {
      setActiveTabId(itemId)
      markVisited(itemId)
    }

    return (
      <section className="pt-5">
        {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
        {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
        <div className="mt-5 flex items-center gap-2">
          {showOverflowArrows && (
            <button type="button" onClick={() => tabListRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--lux-line)] text-[var(--lux-muted)] hover:border-[var(--lux-primary-muted)] hover:text-[var(--lux-text-strong)]" aria-label="Scroll tabs left">
              <ArrowLeft size={16} />
            </button>
          )}
          <div ref={tabListRef} role="tablist" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 lux-scrollbar">
            {items.map((item) => {
              const selected = item.id === activeItemId
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(item.id)}
                  className="min-w-max rounded-full border px-4 py-2 text-sm font-bold transition"
                  style={selected ? { borderColor: accentColor, background: accentColor, color: '#fff' } : { borderColor: '#313847', color: '#C6CFDA' }}
                >
                  {item.title || ''}
                </button>
              )
            })}
          </div>
          {showOverflowArrows && (
            <button type="button" onClick={() => tabListRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--lux-line)] text-[var(--lux-muted)] hover:border-[var(--lux-primary-muted)] hover:text-[var(--lux-text-strong)]" aria-label="Scroll tabs right">
              <ArrowLeft size={16} className="rotate-180" />
            </button>
          )}
        </div>
        <div className="mt-5 rounded-lg bg-transparent p-4">
          <PreviewPanelContent item={activeItem} />
        </div>
      </section>
    )
  }

  const toggleAccordion = (itemId: string) => {
    markVisited(itemId)
    setOpenIds((current) => {
      const next = allowMultiple ? new Set(current) : new Set<string>()
      if (current.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 divide-y divide-[var(--lux-line)] overflow-hidden rounded-lg border border-[var(--lux-line)]">
        {items.map((item) => {
          const open = openIds.has(item.id)
          return (
            <article key={item.id} className="bg-transparent">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleAccordion(item.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-base font-bold text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-elevated)]"
              >
                <span>{item.title || ''}</span>
                <ChevronDown size={18} className={cn('shrink-0 transition', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="px-4 pb-4">
                  <PreviewPanelContent item={item} />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PreviewPanelContent({ item }: { item: CourseInteractionItem }) {
  return (
    <div>
      {item.mediaUrl && <PreviewItemMedia item={item} />}
      {item.content && <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--lux-text)]">{item.content}</p>}
    </div>
  )
}
