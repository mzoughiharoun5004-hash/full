import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { inputClass } from './editorStyles'

export function InlineText({
  value,
  prefix = '',
  placeholder = '',
  className,
  readOnly = false,
  onCommit,
}: {
  value: string
  prefix?: string
  placeholder?: string
  className?: string
  readOnly?: boolean
  onCommit: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (readOnly) {
    return <span className={cn('text-left', className)}>{prefix}{value || placeholder || 'Add value'}</span>
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={cn('text-left', className)}
      >
        {prefix}{value || placeholder || 'Add value'}
      </button>
    )
  }

  return (
    <input
      value={draft}
      autoFocus
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        onCommit(draft)
        setEditing(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onCommit(draft)
          setEditing(false)
        }
        if (event.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      className={cn(inputClass, 'w-full', className)}
      placeholder={placeholder}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">
      {label}
      {children}
    </label>
  )
}

export function RadioGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">{label}</p>
      <div className="space-y-2">
        {options.map(([optionValue, labelText]) => (
          <label key={optionValue} className="flex items-center gap-2 text-sm text-[var(--lux-muted)]">
            <input type="radio" checked={value === optionValue} onChange={() => onChange(optionValue)} />
            {labelText}
          </label>
        ))}
      </div>
    </div>
  )
}

export function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md text-[var(--lux-muted-soft)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}
