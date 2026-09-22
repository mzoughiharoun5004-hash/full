import { Download, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'
import { getBlockDefinition } from '../courseEditorModel'
import { PreviewEmptyMedia, previewMetaString, previewMetaNumber } from './previewHelpers'
import { uploadedAssetUrl } from '../shared/mediaHelpers'

export function PreviewMediaBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  const assetUrl = block.assetUrl || previewMetaString(block, 'fileUrl') || previewMetaString(block, 'url')
  const displayUrl = assetUrl ? uploadedAssetUrl(assetUrl) : ''
  const caption = previewMetaString(block, 'caption', previewMetaString(block, 'label'))
  const attribution = previewMetaString(block, 'mediaAttribution')
  const attributionUrl = previewMetaString(block, 'mediaAttributionUrl')
  const credit = attribution ? <figcaption className="mt-2 text-xs text-[var(--lux-muted)]">{attributionUrl ? <a href={attributionUrl} target="_blank" rel="noreferrer" className="underline hover:text-[var(--lux-text)]">{attribution}</a> : attribution}</figcaption> : null

  if (block.type === 'image') {
    return (
      <figure className="border-t border-[var(--lux-line)] pt-5">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt={previewMetaString(block, 'alt', block.title ?? '')} className="max-h-[520px] w-full rounded-lg object-contain" />
        ) : (
          <div className="grid aspect-video place-items-center rounded-lg bg-[var(--lux-surface)] text-sm text-[var(--lux-muted)]">Image</div>
        )}
        {caption && <figcaption className="mt-2 text-center text-sm text-[var(--lux-muted)]">{caption}</figcaption>}
        {credit}
      </figure>
    )
  }

  if (block.type === 'video') {
    if (displayUrl) return <figure><video controls src={displayUrl} className="w-full rounded-lg" />{credit}</figure>
    const storyboard = Array.isArray(block.metadata?.aiStoryboard) ? block.metadata.aiStoryboard.filter((item): item is string => typeof item === 'string') : []
    if (storyboard.length || block.content) {
      const youtubeUrl = typeof block.metadata?.youtubeSearchUrl === 'string' ? block.metadata.youtubeSearchUrl : null
      return (
        <section className="rounded-lg border border-[var(--lux-primary)] bg-[var(--lux-primary-soft)] p-5">
          <div className="flex items-center gap-2 font-semibold text-[var(--lux-text-strong)]"><Video size={20} /> AI video storyboard</div>
          <p className="mt-2 text-sm leading-6 text-[var(--lux-text)]">{block.content}</p>
          {storyboard.length > 0 && <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--lux-muted)]">{storyboard.map((scene, index) => <li key={`${block.id}-${index}`}>{scene}</li>)}</ol>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-xs text-[var(--lux-muted)]">Upload a video to replace this storyboard, or find one online:</p>
            {youtubeUrl && (
              <a href={youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700">
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                Search YouTube
              </a>
            )}
          </div>
        </section>
      )
    }
    return <PreviewEmptyMedia label="Video" />
  }
  if (block.type === 'audio') return displayUrl ? <audio controls src={displayUrl} className="w-full" /> : <PreviewEmptyMedia label="Audio" />

  return (
    <a href={displayUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg bg-[var(--lux-surface)] p-4 text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-surface-soft)]">
      <Download size={24} style={{ color: accentColor }} />
      <span>
        <span className="block font-semibold">{block.title || previewMetaString(block, 'label') || getBlockDefinition(block.type).label}</span>
        {(caption || displayUrl) && <span className="mt-1 block text-sm text-[var(--lux-muted)]">{caption || displayUrl}</span>}
      </span>
    </a>
  )
}

export function PreviewGalleryBlock({ block }: { block: CourseBlock }) {
  const columns = previewMetaNumber(block, 'columns', 3)
  const validItems = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())

  return (
    <section className="pt-5">
      {block.title && <h3 className="mb-4 text-2xl font-bold">{block.title}</h3>}
      <div className={cn('grid gap-4', columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3')}>
        {validItems.map((item) => (
          <figure key={item.id} className="rounded-lg bg-transparent p-3">
            {item.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadedAssetUrl(item.mediaUrl)} alt={item.title} className="aspect-video w-full rounded object-contain" />
            ) : (
              <div className="grid aspect-video place-items-center rounded bg-[var(--lux-surface-soft)] text-sm text-[var(--lux-muted)]">Image</div>
            )}
            {item.title && <figcaption className="mt-2 text-sm text-[var(--lux-muted)]">{item.title}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  )
}
