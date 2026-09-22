import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Users, UserX } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { ScenarioShare } from '@/types'
import { collaborationUserName } from './collaborationHelpers'

export function CollaboratorAccessControl({
  shares,
  revokingShareId,
  onRevokeShare,
}: {
  shares: ScenarioShare[]
  revokingShareId?: string
  onRevokeShare: (shareId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelPosition, setPanelPosition] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button || typeof window === 'undefined') return

    const rect = button.getBoundingClientRect()
    const viewportPadding = 8
    const width = 320
    const top = rect.bottom + 6
    const left = Math.min(
      Math.max(viewportPadding, rect.right - width),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    )

    setPanelPosition({
      top,
      left,
      width,
      maxHeight: Math.min(360, Math.max(180, window.innerHeight - top - viewportPadding)),
    })
  }, [])

  useEffect(() => {
    if (!open) return

    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, updatePanelPosition])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] px-2.5 text-xs font-semibold text-[var(--lux-muted)] transition hover:bg-[var(--lux-overlay)] hover:text-[var(--lux-text)]"
      >
        <Users size={14} />
        Access
      </button>
      {open && panelPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[120] rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] p-2 shadow-[var(--lux-shadow)]"
          style={{
            top: panelPosition.top,
            left: panelPosition.left,
            width: panelPosition.width,
          }}
        >
          <div className="px-2 py-1">
            <p className="text-xs font-bold text-[var(--lux-text-strong)]">Collaborators</p>
            <p className="mt-0.5 text-[11px] text-[var(--lux-muted)]">{shares.length} with access</p>
          </div>
          <div
            className="mt-2 space-y-1 overflow-y-auto pr-1 lux-scrollbar"
            style={{ maxHeight: panelPosition.maxHeight }}
          >
            {shares.map((share) => (
              <div key={share.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 hover:bg-[var(--lux-overlay)]">
                <Avatar
                  firstName={share.user.firstName}
                  lastName={share.user.lastName}
                  name={collaborationUserName(share.user)}
                  size="xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[var(--lux-text)]">
                    {collaborationUserName(share.user)}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--lux-muted)]">{share.user.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRevokeShare(share.id)}
                  disabled={Boolean(revokingShareId)}
                  className="grid h-8 w-8 place-items-center rounded-md text-[var(--lux-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Revoke ${collaborationUserName(share.user)}`}
                >
                  {revokingShareId === share.id ? <RefreshCw size={14} className="animate-spin" /> : <UserX size={14} />}
                </button>
              </div>
            ))}
            {!shares.length && (
              <p className="px-2 py-5 text-center text-sm text-[var(--lux-muted)]">No collaborators yet.</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
