import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { CourseDocument } from '@/types'
import { PercentageInput } from './PercentageInput'
import { inputClass, selectClass } from '../shared/editorStyles'
import { InlineText, Field, IconButton } from '../shared/uiPrimitives'

export function CourseSetupPanel({
  document,
  readOnly,
  onUpdateDocument,
}: {
  document: CourseDocument
  readOnly: boolean
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
}) {
  const metadata = document.metadata ?? {}
  const objectives = document.objectives ?? []
  const settings = document.settings
  const updateDuration = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      onUpdateDocument((current) => ({
        ...current,
        estimatedMinutes: undefined,
        metadata: { ...current.metadata, duration: '' },
      }))
      return
    }
    const minutes = Number(trimmed)
    if (!Number.isFinite(minutes) || minutes <= 0) return
    const rounded = Math.round(minutes)
    onUpdateDocument((current) => ({
      ...current,
      estimatedMinutes: rounded,
      metadata: { ...current.metadata, duration: String(rounded) },
    }))
  }

  return (
    <section className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
      <h2 className="text-sm font-semibold uppercase text-[var(--lux-muted-soft)]">Course setup</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Audience">
          <InlineText
            value={String(metadata.audience ?? '')}
            readOnly={readOnly}
            placeholder="Audience"
            onCommit={(value) => onUpdateDocument((current) => ({ ...current, metadata: { ...current.metadata, audience: value } }))}
          />
        </Field>
        <Field label="Duration (minutes)">
          <input
            type="number"
            min="1"
            value={document.estimatedMinutes ?? ''}
            onChange={(event) => updateDuration(event.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </Field>
        <Field label="Tone">
          <InlineText
            value={String(metadata.tone ?? '')}
            readOnly={readOnly}
            placeholder="Tone"
            onCommit={(value) => onUpdateDocument((current) => ({ ...current, metadata: { ...current.metadata, tone: value } }))}
          />
        </Field>
        <Field label="Completion mode">
          <select
            value={settings.completionMode}
            onChange={(event) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, completionMode: event.target.value as CourseDocument['settings']['completionMode'] },
              }))
            }
            className={selectClass}
            disabled={readOnly}
          >
            <option value="pages">Course progress</option>
            <option value="score">Quiz score</option>
          </select>
        </Field>
        <Field label="Completion threshold (%)">
          <PercentageInput
            value={settings.completionPercentage ?? 100}
            minimum={1}
            disabled={readOnly}
            onCommit={(completionPercentage) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, completionPercentage },
              }))
            }
          />
        </Field>
        <Field label="Passing score (%)">
          <PercentageInput
            value={settings.passingScore}
            disabled={readOnly}
            onCommit={(passingScore) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, passingScore },
              }))
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-[var(--lux-muted)]">
          <input
            type="checkbox"
            checked={Boolean(settings.requireQuizPass)}
            onChange={(event) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, requireQuizPass: event.target.checked },
              }))
            }
            disabled={readOnly}
          />
          Require quiz pass
        </label>
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">Learning objectives</p>
        {objectives.length === 0 && !readOnly && (
          <button
            type="button"
            className="rounded-md border border-dashed border-[var(--lux-line)] px-3 py-2 text-left text-sm text-[var(--lux-muted)]"
            onClick={() => onUpdateDocument((current) => ({ ...current, objectives: [''] }))}
            disabled={readOnly}
          >
            Add the first objective
          </button>
        )}
        {objectives.map((objective, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={objective}
              onChange={(event) => {
                const value = event.target.value
                onUpdateDocument((current) => {
                  const next = [...(current.objectives ?? [])]
                  next[index] = value
                  return { ...current, objectives: next }
                })
              }}
              placeholder={`Objective ${index + 1}`}
              className={cn(inputClass, 'min-w-0 flex-1')}
              disabled={readOnly}
            />
            {!readOnly && (
              <IconButton
                label={`Remove objective ${index + 1}`}
                onClick={() =>
                  onUpdateDocument((current) => ({
                    ...current,
                    objectives: (current.objectives ?? []).filter((_, itemIndex) => itemIndex !== index),
                  }))
                }
              >
                <Trash2 size={15} />
              </IconButton>
            )}
          </div>
        ))}
        {objectives.length > 0 && !readOnly && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onUpdateDocument((current) => ({ ...current, objectives: [...(current.objectives ?? []), ''] }))}
          >
            Add objective
          </Button>
        )}
      </div>
    </section>
  )
}
