import type { CourseBlock } from '@/types'
import { inputClass } from '../shared/editorStyles'
import { Field } from '../shared/uiPrimitives'

export function QuestionCommonSettings({
  block,
  onChange,
}: {
  block: CourseBlock
  onChange: (key: string, value: unknown) => void
}) {
  const metadata = block.metadata ?? {}
  return (
    <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
      <p className="text-xs font-semibold uppercase text-[var(--lux-muted-soft)]">Question Settings</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Points"><input type="number" value={Number(metadata.points ?? 1)} onChange={(e) => onChange('points', Number(e.target.value))} className={inputClass} /></Field>
        <Field label="Max attempts"><input type="number" value={Number(metadata.maxAttempts ?? 1)} onChange={(e) => onChange('maxAttempts', Number(e.target.value))} className={inputClass} /></Field>
        <Field label="Hint"><input value={String(metadata.hint ?? '')} onChange={(e) => onChange('hint', e.target.value)} className={inputClass} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--lux-muted)]">
        <label><input type="checkbox" checked={Boolean(metadata.allowRetry)} onChange={(e) => onChange('allowRetry', e.target.checked)} /> Allow retry</label>
        <label><input type="checkbox" checked={Boolean(metadata.shuffle)} onChange={(e) => onChange('shuffle', e.target.checked)} /> Shuffle options</label>
        <label><input type="checkbox" checked={Boolean(metadata.required)} onChange={(e) => onChange('required', e.target.checked)} /> Required</label>
      </div>
    </div>
  )
}
