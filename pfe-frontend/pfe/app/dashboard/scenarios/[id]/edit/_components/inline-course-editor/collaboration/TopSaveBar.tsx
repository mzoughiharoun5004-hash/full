import { MessageCircle } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { CollaborationUser } from '@/context/SocketContext'
import type { SaveStatus } from '../courseEditorModel'
import { UsersIcon } from './UsersIcon'
import { collaborationUserName } from './collaborationHelpers'

export function TopSaveBar({
  status,
  label,
  showRetry,
  onRetry,
  collaborators,
  openComments,
  canOpenComments,
  commentsOpen,
  onToggleComments,
}: {
  status: SaveStatus
  label: string
  showRetry: boolean
  onRetry: () => void
  collaborators: CollaborationUser[]
  openComments: number
  canOpenComments: boolean
  commentsOpen: boolean
  onToggleComments: () => void
}) {
  return (
    <div className="sticky top-0 z-30 flex h-10 items-center justify-between border-b border-[var(--lux-line)] bg-[var(--lux-surface)]/95 px-4 backdrop-blur">
      <div className="inline-flex items-center gap-3 rounded-full px-2 py-1 text-xs font-semibold text-[var(--lux-muted)]">
        <span className="flex -space-x-2">
          {collaborators.slice(0, 4).map((collaborator) => (
            <Avatar
              key={String(collaborator.id)}
              firstName={collaborator.firstName}
              lastName={collaborator.lastName}
              name={collaborationUserName(collaborator)}
              size="xs"
              className="ring-2 ring-[var(--lux-surface)]"
            />
          ))}
          {!collaborators.length && <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--lux-overlay)]"><UsersIcon /></span>}
        </span>
        <span>{collaborators.length} online</span>
        {canOpenComments && (
          <button
            type="button"
            onClick={onToggleComments}
            aria-pressed={commentsOpen}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--lux-primary-soft)] px-2 py-0.5 text-[10px] text-[var(--lux-primary-muted)] transition hover:bg-[var(--lux-primary)]/15"
          >
            <MessageCircle size={12} />
            {openComments} open
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={showRetry ? onRetry : undefined}
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          status === 'error'
            ? 'bg-red-50 text-red-600 hover:text-red-700'
            : status === 'conflict'
              ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15'
            : status === 'saving'
              ? 'bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]'
              : 'bg-[var(--lux-overlay)] text-[var(--lux-muted)]',
        )}
      >
        {label}
      </button>
    </div>
  )
}
