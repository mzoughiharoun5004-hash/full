import { useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { textareaClass } from '../shared/editorStyles'

export function ReviewDecisionPanel({
  approving,
  revoking,
  onApprove,
  onRevoke,
}: {
  approving: boolean
  revoking: boolean
  onApprove: () => void
  onRevoke: (comment?: string) => void
}) {
  const [revokeComment, setRevokeComment] = useState('')
  const trimmedRevokeComment = revokeComment.trim()

  return (
    <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4">
      <div className="grid gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--lux-text)]">Review decision</p>
          <p className="mt-1 text-xs text-[var(--lux-muted)]">Approve this course or revoke it back to draft.</p>
        </div>
        <textarea
          value={revokeComment}
          onChange={(event) => setRevokeComment(event.target.value)}
          className={textareaClass}
          rows={3}
          placeholder="Optional rejection comment..."
          disabled={approving || revoking}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onApprove} loading={approving} disabled={revoking}>
            <CheckCircle size={14} className="mr-1" />
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onRevoke(trimmedRevokeComment || undefined)} loading={revoking} disabled={approving}>
            <XCircle size={14} className="mr-1" />
            Revoke
          </Button>
        </div>
      </div>
    </div>
  )
}
