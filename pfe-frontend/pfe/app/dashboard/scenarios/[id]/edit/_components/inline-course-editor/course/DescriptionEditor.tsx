import { useState } from 'react'
import { cn } from '@/lib/utils'

export function DescriptionEditor({
  value,
  coverMode = false,
  readOnly = false,
  onCommit,
}: {
  value: string
  coverMode?: boolean
  readOnly?: boolean
  onCommit: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (readOnly) {
    return (
      <p className={cn(
        'mt-8 block max-w-3xl whitespace-pre-wrap text-left font-serif text-2xl leading-9',
        coverMode ? 'text-white/82 drop-shadow' : 'text-[var(--lux-muted)]',
      )}>
        {value || 'No description.'}
      </p>
    )
  }

  if (!editing && !value.trim()) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={cn(
          'mt-8 block text-left font-serif text-2xl leading-9',
          coverMode ? 'text-white/70 drop-shadow hover:text-white' : 'text-[var(--lux-muted)] hover:text-[var(--lux-text)]',
        )}
      >
        Describe your course...
      </button>
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={cn(
          'mt-8 block max-w-3xl whitespace-pre-wrap text-left font-serif text-2xl leading-9',
          coverMode ? 'text-white/82 drop-shadow hover:text-white' : 'text-[var(--lux-muted)] hover:text-[var(--lux-text)]',
        )}
      >
        {value}
      </button>
    )
  }

  return (
    <textarea
      value={draft}
      autoFocus
      rows={3}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        onCommit(draft.trim())
        setEditing(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      className={cn(
        'mt-8 w-full max-w-3xl resize-none bg-transparent font-serif text-2xl leading-9 outline-none placeholder:text-[var(--lux-muted-soft)]',
        coverMode ? 'text-white drop-shadow placeholder:text-white/55' : 'text-[var(--lux-text)]',
      )}
      placeholder="Describe your course..."
    />
  )
}
