import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'
import { previewMetaString } from './previewHelpers'

export function PreviewContinueBlock({
  block,
  accentColor,
  unlocked,
  revealed,
  onReveal,
}: {
  block: CourseBlock
  accentColor: string
  unlocked: boolean
  revealed: boolean
  onReveal: () => void
}) {
  const label = previewMetaString(block, 'label', block.content || block.title || 'Continue')
  const alignment = previewMetaString(block, 'alignment', 'center')
  const hint = unlocked
    ? previewMetaString(block, 'unlockedHint', 'Ready to continue.')
    : previewMetaString(block, 'lockedHint', 'Complete the required activity above to continue.')

  return (
    <section className={cn('border-t border-[var(--lux-line)] pt-5', alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center')}>
      <button
        type="button"
        disabled={!unlocked || revealed}
        onClick={onReveal}
        className="inline-flex min-w-36 items-center justify-center rounded-full px-6 py-3 text-sm font-bold text-[var(--lux-text-strong)] transition disabled:cursor-not-allowed disabled:bg-[var(--lux-line)] disabled:text-[var(--lux-muted)]"
        style={unlocked && !revealed ? { background: accentColor } : undefined}
      >
        {revealed ? 'Unlocked' : label}
      </button>
      <p className="mt-2 text-xs font-semibold text-[var(--lux-muted)]">{revealed ? previewMetaString(block, 'unlockedHint', 'Content unlocked.') : hint}</p>
    </section>
  )
}
