import { inputClass } from '../shared/editorStyles'

export function PercentageInput({
  value,
  minimum = 0,
  disabled = false,
  onCommit,
}: {
  value: number | undefined
  minimum?: number
  disabled?: boolean
  onCommit: (value: number) => void
}) {
  const normalizedValue = clampPercentage(value, minimum)
  const commit = (rawValue: string) => {
    const nextValue = clampPercentage(rawValue, minimum, normalizedValue)
    if (nextValue !== normalizedValue) onCommit(nextValue)
  }

  return (
    <input
      key={`${minimum}-${normalizedValue}`}
      type="number"
      min={minimum}
      max="100"
      step="1"
      defaultValue={normalizedValue}
      onBlur={(event) => {
        const nextValue = clampPercentage(event.target.value, minimum, normalizedValue)
        event.currentTarget.value = String(nextValue)
        commit(String(nextValue))
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className={inputClass}
      disabled={disabled}
    />
  )
}

function clampPercentage(value: unknown, minimum: number, fallback = minimum): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(100, Math.round(parsed)))
}
