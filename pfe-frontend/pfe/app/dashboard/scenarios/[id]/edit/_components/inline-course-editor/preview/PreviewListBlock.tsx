import type { CourseBlock, CourseInteractionItem } from '@/types'
import { uploadedAssetUrl } from '../shared/mediaHelpers'

export function PreviewListBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      <div className="mt-4 grid gap-3">
        {items.map((item, index) => (
          <article key={item.id} className="grid gap-4 rounded-lg bg-transparent p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-extrabold" style={{ background: `${accentColor}33`, color: '#83BFA1' }}>
              {block.type === 'numbered_list' || block.type === 'ordering' || block.type === 'timeline' ? index + 1 : '•'}
            </span>
            <div className="min-w-0">
              {item.title && <h4 className="mt-3 text-base font-bold first:mt-0">{item.title}</h4>}
              {item.content && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{item.content}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function PreviewItemMedia({ item }: { item: CourseInteractionItem }) {
  const mediaUrl = item.mediaUrl ? uploadedAssetUrl(item.mediaUrl) : ''
  if (!mediaUrl) return null

  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(mediaUrl)) {
    return <video controls src={mediaUrl} className="mb-3 w-full rounded-lg" />
  }

  if (/\.(mp3|wav|m4a|aac|oga)(\?|#|$)/i.test(mediaUrl)) {
    return <audio controls src={mediaUrl} className="mb-3 w-full" />
  }

  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)/i.test(mediaUrl)) {
    return <iframe title={item.title || 'Embedded media'} src={mediaUrl} className="mb-3 aspect-video w-full rounded-lg" />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaUrl} alt={item.title} className="mb-3 max-h-72 w-full rounded-lg border border-[var(--lux-line)] object-contain" />
  )
}
