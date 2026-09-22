import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'
import { previewMetaString, previewMetaBoolean } from './previewHelpers'
import { uploadedAssetUrl } from '../shared/mediaHelpers'

export function PreviewQuoteBlock({ block }: { block: CourseBlock }) {
  const body = block.content?.trim() || block.title?.trim() || ''
  const attributionName = previewMetaString(block, 'attributionName')
  const attributionRole = previewMetaString(block, 'attributionRole')
  const avatarUrl = previewMetaString(block, 'avatarUrl')
  const alignment = previewMetaString(block, 'alignment', 'left')
  const spacing = previewMetaString(block, 'spacing', 'normal')
  const showQuoteMark = previewMetaBoolean(block, 'showQuoteMark', true)
  const showAvatar = previewMetaBoolean(block, 'showAvatar', true)
  const alignClass = alignment === 'center' ? 'items-center text-center' : alignment === 'right' ? 'items-end text-right' : 'items-start text-left'
  const spacingClass = spacing === 'compact' ? 'gap-2 py-4' : spacing === 'wide' ? 'gap-5 py-8' : 'gap-3 py-6'
  const avatar = showAvatar && avatarUrl ? uploadedAssetUrl(avatarUrl) : ''
  const attribution = attributionName || attributionRole

  const quoteContent = (
    <div className={cn('flex flex-col', alignClass, spacingClass)}>
      {showQuoteMark && <span className="text-5xl font-black leading-none text-[var(--lux-primary-muted)]">&quot;</span>}
      <blockquote className="max-w-3xl whitespace-pre-wrap text-2xl font-semibold leading-9 text-[var(--lux-text-strong)]">{body}</blockquote>
      {showQuoteMark && <span className="self-end text-5xl font-black leading-none text-[var(--lux-primary-muted)]">&quot;</span>}
      {attribution && (
        <figcaption className={cn('flex items-center gap-3 text-sm text-[var(--lux-text)]', alignment === 'center' && 'justify-center', alignment === 'right' && 'flex-row-reverse')}>
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-11 w-11 rounded-full border border-white/20 object-cover" />
          )}
          <span>
            {attributionName && <span className="block font-bold text-[var(--lux-text-strong)]">{attributionName}</span>}
            {attributionRole && <span className="block text-[var(--lux-muted)]">{attributionRole}</span>}
          </span>
        </figcaption>
      )}
    </div>
  )

  return (
    <figure className="pt-5">
      <div className="px-0">
        {quoteContent}
      </div>
    </figure>
  )
}
