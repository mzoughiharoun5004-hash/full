import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { MessageCircle, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { getApiErrorMessage, scenariosApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { CourseLesson, ScenarioComment } from '@/types'
import { collaborationUserName, commentTargetLabel } from './collaborationHelpers'
import { textareaClass } from '../shared/editorStyles'
import { IconButton } from '../shared/uiPrimitives'

export function CourseCommentsRail({
  scenarioId,
  comments,
  readOnly,
  isOpen,
  lessons,
  activeLessonId,
  currentUserId,
  onClose,
  onOpenLesson,
  onCommentChange,
}: {
  scenarioId: string
  comments: ScenarioComment[]
  readOnly: boolean
  isOpen: boolean
  lessons: CourseLesson[]
  activeLessonId?: string
  currentUserId?: string | number
  onClose: () => void
  onOpenLesson: (lessonId: string) => void
  onCommentChange: (commentId: string, action: 'create' | 'update') => void
}) {
  const qc = useQueryClient()
  const [commentBody, setCommentBody] = useState('')
  const [targetId, setTargetId] = useState(activeLessonId ?? 'course')
  const [showResolved, setShowResolved] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  // Follow the lesson being viewed (adjusting state during render, rather than in
  // an effect, avoids an extra render pass).
  const [lastActiveLessonId, setLastActiveLessonId] = useState(activeLessonId)
  if (lastActiveLessonId !== activeLessonId) {
    setLastActiveLessonId(activeLessonId)
    if (activeLessonId) setTargetId(activeLessonId)
  }

  const createComment = useMutation({
    mutationFn: () => scenariosApi.createComment(scenarioId, {
      targetType: targetId === 'course' ? 'course' : 'lesson',
      targetId: targetId === 'course' ? undefined : targetId,
      body: commentBody,
    }),
    onSuccess: (response) => {
      const createdComment = response.data as ScenarioComment
      setCommentBody('')
      qc.invalidateQueries({ queryKey: ['scenario-comments', scenarioId] })
      qc.invalidateQueries({ queryKey: ['scenario-activity', scenarioId] })
      onCommentChange(createdComment.id, 'create')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to add comment')),
  })

  const updateComment = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      scenariosApi.updateComment(commentId, { body }),
    onSuccess: (response) => {
      const updatedComment = response.data as ScenarioComment
      setEditingCommentId(null)
      qc.invalidateQueries({ queryKey: ['scenario-comments', scenarioId] })
      qc.invalidateQueries({ queryKey: ['scenario-activity', scenarioId] })
      onCommentChange(updatedComment.id, 'update')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to update comment')),
  })

  const resolveComment = useMutation({
    mutationFn: (commentId: string) => scenariosApi.resolveComment(scenarioId, commentId),
    onSuccess: (response) => {
      const updatedComment = response.data as ScenarioComment
      qc.invalidateQueries({ queryKey: ['scenario-comments', scenarioId] })
      qc.invalidateQueries({ queryKey: ['scenario-activity', scenarioId] })
      onCommentChange(updatedComment.id, 'update')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to resolve comment')),
  })

  const openCount = comments.filter((comment) => comment.status === 'open').length
  const visibleComments = comments.filter((comment) => showResolved ? comment.status === 'resolved' : comment.status === 'open')
  const activeLesson = lessons.find((lesson) => lesson.id === activeLessonId)

  return (
    <>
      {isOpen && <button type="button" aria-label="Close comments" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden" />}
      <aside className={cn(
        'fixed bottom-0 left-0 top-10 z-50 flex w-full max-w-[380px] flex-col border-r border-[var(--lux-line)] bg-[var(--lux-surface)] shadow-[var(--lux-shadow)] transition-transform duration-200',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
      <div className="flex h-14 items-center justify-between border-b border-[var(--lux-line)] px-4">
        <div>
          <p className="text-sm font-bold text-[var(--lux-text-strong)]">Comments</p>
          <p className="text-[11px] text-[var(--lux-muted)]">{openCount} open{activeLesson ? ` · viewing ${activeLesson.title}` : ''}</p>
        </div>
        <IconButton label="Close comments" onClick={onClose}><X size={16} /></IconButton>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lux-scrollbar">
        <div className="space-y-4">
          {!readOnly && (
            <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
              <label className="mb-2 block text-xs font-semibold text-[var(--lux-muted)]" htmlFor="comment-target">Comment on</label>
              <select
                id="comment-target"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className="mb-3 w-full rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--lux-text)] outline-none focus:border-[var(--lux-primary)]"
              >
                <option value="course">Entire course</option>
                {lessons.map((lesson, index) => <option key={lesson.id} value={lesson.id}>Lesson {index + 1}: {lesson.title || 'Untitled lesson'}</option>)}
              </select>
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                className={textareaClass}
                rows={3}
                placeholder="Add a course comment..."
              />
              <Button size="sm" className="mt-2" onClick={() => createComment.mutate()} disabled={!commentBody.trim() || createComment.isPending} loading={createComment.isPending}>
                <MessageCircle size={13} className="mr-1" />
                Comment
              </Button>
            </div>
          )}
          <div className="flex rounded-md bg-[var(--lux-overlay)] p-0.5 text-xs font-semibold">
            <button type="button" onClick={() => setShowResolved(false)} className={cn('flex-1 rounded px-2 py-1.5', !showResolved && 'bg-[var(--lux-surface)] text-[var(--lux-text)] shadow-sm')}>Open ({openCount})</button>
            <button type="button" onClick={() => setShowResolved(true)} className={cn('flex-1 rounded px-2 py-1.5', showResolved && 'bg-[var(--lux-surface)] text-[var(--lux-text)] shadow-sm')}>Resolved</button>
          </div>
          {visibleComments.map((comment) => (
            <div key={comment.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar firstName={comment.author.firstName} lastName={comment.author.lastName} name={collaborationUserName(comment.author)} size="xs" />
                <span className="min-w-0 truncate text-xs font-semibold text-[var(--lux-text)]">{collaborationUserName(comment.author)}</span>
                <span className={cn(
                  'ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  comment.status === 'resolved'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]',
                )}>
                  {comment.status}
                </span>
              </div>
              {comment.targetType === 'lesson' && comment.targetId && lessons.some((lesson) => lesson.id === comment.targetId) ? (
                <button type="button" onClick={() => onOpenLesson(comment.targetId as string)} className="mt-2 text-left text-[11px] font-semibold uppercase text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]">
                  {commentTargetLabel(comment, lessons)}
                </button>
              ) : <p className="mt-2 text-[11px] font-semibold uppercase text-[var(--lux-muted-soft)]">{commentTargetLabel(comment, lessons)}</p>}
              {editingCommentId === comment.id ? (
                <div className="mt-2">
                  <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} className={textareaClass} rows={3} />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => updateComment.mutate({ commentId: comment.id, body: editDraft })} disabled={!editDraft.trim()} loading={updateComment.isPending}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{comment.body}</p>}
              <p className="mt-2 text-[11px] text-[var(--lux-muted-soft)]">{new Date(comment.createdAt).toLocaleString()}</p>
              {!readOnly && editingCommentId !== comment.id && (
                <div className="mt-3 flex items-center gap-3">
                  {String(comment.author.id) === String(currentUserId) && <button type="button" onClick={() => { setEditingCommentId(comment.id); setEditDraft(comment.body) }} className="text-xs font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]">Edit</button>}
                  {comment.status === 'open' && <button type="button" onClick={() => resolveComment.mutate(comment.id)} disabled={resolveComment.isPending} className="text-xs font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]">Resolve</button>}
                </div>
              )}
            </div>
          ))}
          {!visibleComments.length && <p className="py-6 text-center text-sm text-[var(--lux-muted)]">{showResolved ? 'No resolved comments yet.' : 'No open comments yet.'}</p>}
        </div>
      </div>
      </aside>
    </>
  )
}
