import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { User } from '@/types'
import { collaborationUserName } from './collaborationHelpers'

export function CollaboratorInviteControl({
  email,
  suggestions,
  loading,
  onEmailChange,
  onSubmit,
}: {
  email: string
  suggestions: User[]
  loading: boolean
  onEmailChange: (email: string) => void
  onSubmit: () => void
}) {
  const trimmedEmail = email.trim()
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [suggestionsMenu, setSuggestionsMenu] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const showSuggestions = trimmedEmail.length >= 2 && suggestions.length > 0

  const updateSuggestionsMenu = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor || typeof window === 'undefined') return

    const rect = anchor.getBoundingClientRect()
    const viewportPadding = 8
    const width = Math.max(280, rect.width)
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    )
    const top = rect.bottom + 4

    setSuggestionsMenu({
      top,
      left,
      width,
      maxHeight: Math.min(224, Math.max(120, window.innerHeight - top - viewportPadding)),
    })
  }, [])

  useEffect(() => {
    if (!showSuggestions) return

    updateSuggestionsMenu()
    window.addEventListener('resize', updateSuggestionsMenu)
    window.addEventListener('scroll', updateSuggestionsMenu, true)

    return () => {
      window.removeEventListener('resize', updateSuggestionsMenu)
      window.removeEventListener('scroll', updateSuggestionsMenu, true)
    }
  }, [showSuggestions, updateSuggestionsMenu])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedEmail || loading) return
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex h-9 items-center gap-1">
      <div ref={anchorRef} className="relative h-9 w-[220px]">
        <UserPlus
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--lux-muted)]"
        />
        <input
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="Collaborator email"
          className="h-9 w-full rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] pl-8 pr-2 text-xs font-semibold text-[var(--lux-text)] outline-none transition placeholder:text-[var(--lux-muted)] focus:border-[var(--lux-primary)] focus:ring-2 focus:ring-[var(--lux-primary)]/15"
        />
      </div>
      {showSuggestions && suggestionsMenu && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] overflow-y-auto rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] p-1 shadow-[var(--lux-shadow)] lux-scrollbar"
          style={{
            top: suggestionsMenu.top,
            left: suggestionsMenu.left,
            width: suggestionsMenu.width,
            maxHeight: suggestionsMenu.maxHeight,
          }}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onEmailChange(suggestion.email)}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left transition hover:bg-[var(--lux-overlay)]"
            >
              <Avatar
                firstName={suggestion.firstName}
                lastName={suggestion.lastName}
                name={collaborationUserName(suggestion)}
                size="xs"
              />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--lux-text)]">
                  {collaborationUserName(suggestion)}
                </span>
                <span className="block truncate text-[11px] text-[var(--lux-muted)]">{suggestion.email}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
      <button
        type="submit"
        disabled={!trimmedEmail || loading}
        className="grid h-9 w-9 place-items-center rounded-md bg-[var(--lux-primary)] text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Add collaborator"
      >
        {loading ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
      </button>
    </form>
  )
}
