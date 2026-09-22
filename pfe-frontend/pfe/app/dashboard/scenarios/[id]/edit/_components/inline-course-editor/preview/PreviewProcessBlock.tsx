import { useEffect, useState } from 'react'
import type { CourseBlock } from '@/types'
import { PreviewItemMedia } from './PreviewListBlock'
import { previewMetaString } from './previewHelpers'
import { uploadedAssetUrl } from '../shared/mediaHelpers'

export function PreviewProcessBlock({
  block,
  accentColor,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  onComplete?: () => void
}) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  const [stepIndex, setStepIndex] = useState(-1)
  const summaryIndex = items.length
  const onSummary = stepIndex === summaryIndex
  const currentStep = stepIndex >= 0 && stepIndex < items.length ? items[stepIndex] : null

  useEffect(() => {
    if (onSummary) onComplete?.()
  }, [onComplete, onSummary])

  const goTo = (index: number) => setStepIndex(Math.max(-1, Math.min(summaryIndex, index)))

  return (
    <section className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
      {stepIndex === -1 ? (
        <div className="mt-3">
          <h3 className="text-2xl font-bold">{previewMetaString(block, 'introTitle', block.title || '')}</h3>
          {(block.content || previewMetaString(block, 'introText')) && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{previewMetaString(block, 'introText', block.content ?? '')}</p>}
          {previewMetaString(block, 'introImageUrl') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedAssetUrl(previewMetaString(block, 'introImageUrl'))} alt="" className="mt-5 max-h-72 w-full rounded-lg object-contain" />
          )}
          <button type="button" onClick={() => goTo(0)} className="mt-5 rounded-full px-5 py-2 text-sm font-bold text-[var(--lux-text-strong)]" style={{ background: accentColor }}>
            {previewMetaString(block, 'startLabel', 'Start')}
          </button>
        </div>
      ) : onSummary ? (
        <div className="mt-3">
          <h3 className="text-2xl font-bold">{previewMetaString(block, 'summaryTitle', 'Process complete')}</h3>
          {previewMetaString(block, 'summaryText') && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{previewMetaString(block, 'summaryText')}</p>}
          <button type="button" onClick={() => goTo(-1)} className="mt-5 rounded-full px-5 py-2 text-sm font-bold text-[var(--lux-text-strong)] bg-[var(--lux-surface)] hover:bg-[var(--lux-surface-soft)]">
            {previewMetaString(block, 'restartLabel', 'Start Again')}
          </button>
        </div>
      ) : currentStep ? (
        <div className="mt-3">
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-[var(--lux-muted)]">
            <span className="grid h-8 w-8 place-items-center rounded-full text-[var(--lux-text-strong)]" style={{ background: accentColor }}>{stepIndex + 1}</span>
            <span>Step {stepIndex + 1} of {items.length}</span>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
            <div>
              {currentStep.title && <h3 className="text-2xl font-bold">{currentStep.title}</h3>}
              {currentStep.content && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{currentStep.content}</p>}
            </div>
            {currentStep.mediaUrl && <PreviewItemMedia item={currentStep} />}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={() => goTo(stepIndex - 1)} className="rounded-full px-4 py-2 text-sm font-bold text-[var(--lux-text-strong)] bg-[var(--lux-surface)] hover:bg-[var(--lux-surface-soft)]">
              Previous
            </button>
            <button type="button" onClick={() => goTo(stepIndex + 1)} className="rounded-full px-4 py-2 text-sm font-bold text-[var(--lux-text-strong)]" style={{ background: accentColor }}>
              {stepIndex === items.length - 1 ? 'Summary' : 'Next'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
