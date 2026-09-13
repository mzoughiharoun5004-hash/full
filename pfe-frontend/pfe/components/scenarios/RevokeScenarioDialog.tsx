'use client'

import { useState, type FormEvent } from 'react'
import { XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface RevokeScenarioDialogProps {
  open: boolean
  loading?: boolean
  courseTitle?: string
  onClose: () => void
  onConfirm: (comment?: string) => void
}

export function RevokeScenarioDialog({
  open,
  loading = false,
  courseTitle,
  onClose,
  onConfirm,
}: RevokeScenarioDialogProps) {
  const [comment, setComment] = useState('')
  const trimmedComment = comment.trim()

  const closeDialog = () => {
    setComment('')
    onClose()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onConfirm(trimmedComment || undefined)
  }

  return (
    <Modal open={open} onClose={loading ? () => undefined : closeDialog} title="Revoke course" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          {courseTitle && (
            <p className="mb-2 truncate text-sm font-semibold text-[var(--lux-text)]">{courseTitle}</p>
          )}
          <p className="text-sm text-[var(--lux-muted)]">
            Add an optional comment for the owner and collaborators.
          </p>
        </div>

        <textarea
          autoFocus
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          maxLength={4000}
          disabled={loading}
          aria-label="Revoke comment"
          placeholder="Reason for revoking this course..."
          className="w-full resize-none rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-2 text-sm text-[var(--lux-text)] outline-none transition placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={closeDialog} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="sm" loading={loading}>
            <XCircle size={14} className="mr-1" />
            OK
          </Button>
        </div>
      </form>
    </Modal>
  )
}
