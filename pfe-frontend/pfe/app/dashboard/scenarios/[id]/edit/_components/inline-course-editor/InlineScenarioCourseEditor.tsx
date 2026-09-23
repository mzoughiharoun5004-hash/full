'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Check, Eye, SlidersHorizontal } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { approvedCollaboratorViewOnlyMessage } from '@/lib/scenarioActions'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/context/LanguageContext'
import { useScenarioRoom } from '@/context/SocketContext'
import type { CourseDocument } from '@/types'
import {
  authorNameFrom,
  createEmptyCourseDocument,
  getCourseReadiness,
  normalizeCourseDocument,
} from './courseEditorModel'
import { AiCourseCreationWizard, AiCourseEditControl } from './AiCourseControls'
import { CollaboratorAccessControl } from './collaboration/CollaboratorAccessControl'
import { CollaboratorInviteControl } from './collaboration/CollaboratorInviteControl'
import { CourseCommentsRail } from './collaboration/CourseCommentsRail'
import { TopSaveBar } from './collaboration/TopSaveBar'
import { ReviewDecisionPanel } from './course/ReviewDecisionPanel'
import { StructurePage } from './course/StructurePage'
import { useCollaboratorSharing } from './hooks/useCollaboratorSharing'
import { useCourseComments } from './hooks/useCourseComments'
import { useCourseSave } from './hooks/useCourseSave'
import { useDocumentActions } from './hooks/useDocumentActions'
import { useLessonLock } from './hooks/useLessonLock'
import { useReviewActions } from './hooks/useReviewActions'
import { LessonEditor } from './lesson/LessonEditor'
import { CoursePreview } from './preview/CoursePreview'
import type { EditorViewState, InlineScenarioCourseEditorProps } from './shared/editorTypes'

export function InlineScenarioCourseEditor({
  mode,
  scenarioId,
  scenario,
  readOnly = false,
  viewOnlyMessage,
  canAccessComments: canAccessCommentsProp = false,
  initialPreviewOpen = false,
  loadedDocument,
}: InlineScenarioCourseEditorProps) {
  const loadedDoc = loadedDocument ?? null
  const { user, isAdmin } = useAuth()
  const { t } = useTranslation()
  const room = useScenarioRoom()
  const {
    collaborators,
    locks,
    lastEdit,
    broadcastScenarioEdit,
    lockElement,
    unlockElement,
  } = room
  const qc = useQueryClient()
  const authorName = authorNameFrom(user)
  const [persistedScenarioId, setPersistedScenarioId] = useState<string | undefined>(scenarioId)
  const [createdBaselineDocument, setCreatedBaselineDocument] = useState<CourseDocument | null>(null)
  const [document, setDocument] = useState<CourseDocument>(() => createEmptyCourseDocument('', authorName))
  const readiness = useMemo(() => getCourseReadiness(document), [document])
  const [titleCommitted, setTitleCommitted] = useState(mode === 'edit')
  const [documentHydrated, setDocumentHydrated] = useState(mode === 'create')
  const [titleDraft, setTitleDraft] = useState('')
  const [titleError, setTitleError] = useState('')
  const [view, setView] = useState<EditorViewState>({ type: 'structure' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(initialPreviewOpen)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const lessonInputRef = useRef<HTMLInputElement | null>(null)
  const hydratedDocumentIdRef = useRef<string | null>(null)
  const scenarioOwnerId =
    scenario?.ownerId ??
    scenario?.author?.id ??
    scenario?.user?.id ??
    (scenario as { userId?: string | number } | undefined)?.userId
  const isScenarioOwner = Boolean(
    user?.id && scenarioOwnerId != null && String(scenarioOwnerId) === String(user.id),
  )

  const scenarioStatus = (scenario?.statut ?? scenario?.status)?.toLowerCase()
  const canAccessComments = canAccessCommentsProp
    && !readOnly
    && (isScenarioOwner
      ? scenarioStatus !== 'archived'
      : !isAdmin && ['brouillon', 'en_cours_validation'].includes(scenarioStatus ?? ''))

  const normalizedLoadedDocument = useMemo(
    () => loadedDoc ? normalizeCourseDocument(loadedDoc, authorName) : null,
    [authorName, loadedDoc],
  )

  const comments = useCourseComments({
    persistedScenarioId,
    canAccessComments,
    lastEdit,
    qc,
  })

  const {
    collaboratorEmail,
    setCollaboratorEmail,
    collaboratorSuggestionOptions,
    scenarioShares,
    hasCurrentUserShare,
    addCollaboratorMutation,
    revokeShareMutation,
  } = useCollaboratorSharing({
    scenario,
    user,
    isScenarioOwner,
    persistedScenarioId,
    broadcastScenarioEdit,
    qc,
  })

  useEffect(() => {
    if (mode !== 'edit' || !normalizedLoadedDocument || hydratedDocumentIdRef.current === normalizedLoadedDocument.id) return
    hydratedDocumentIdRef.current = normalizedLoadedDocument.id
    setDocument(normalizedLoadedDocument)
    setTitleDraft(normalizedLoadedDocument.title)
    setTitleCommitted(true)
    setDocumentHydrated(true)
  }, [mode, normalizedLoadedDocument])

  const scrollCourseToTop = useCallback(() => {
    if (typeof window === 'undefined') return

    window.requestAnimationFrame(() => {
      const scrollContainer = editorRootRef.current?.closest('main')
      scrollContainer?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }, [])

  useEffect(() => {
    if (readOnly) return
    if (!titleCommitted) {
      titleInputRef.current?.focus()
    } else if (document.lessons?.length === 0 && view.type === 'structure') {
      window.setTimeout(() => lessonInputRef.current?.focus(), 80)
    }
  }, [document.lessons?.length, readOnly, titleCommitted, view.type])

  const {
    createScenarioMutation,
    autosave,
    handleAiApplied,
    flushUnsavedBeforeAiPropose,
    saveStatus,
    saveLabel,
    conflictDialogOpen,
    conflictDetails,
    recoverSave,
    confirmConflictReload,
    cancelConflictReload,
  } = useCourseSave({
    mode,
    readOnly,
    viewOnlyMessage,
    persistedScenarioId,
    setPersistedScenarioId,
    createdBaselineDocument,
    setCreatedBaselineDocument,
    document,
    setDocument,
    titleCommitted,
    documentHydrated,
    normalizedLoadedDocument,
    authorName,
    broadcastScenarioEdit,
    lastEdit,
    qc,
  })

  const viewOnlyBannerText =
    viewOnlyMessage === 'approvedCollaborator'
      ? approvedCollaboratorViewOnlyMessage
      : viewOnlyMessage === 'collaborator'
        ? t('editor_view_only_collaborator')
      : t('editor_view_only')
  const canInviteCollaborators = Boolean(isScenarioOwner && persistedScenarioId && !readOnly)
  const canManageCollaborators = Boolean(isScenarioOwner && persistedScenarioId)

  const { canReviewScenario, approveMutation, revokeMutation } = useReviewActions({
    scenario,
    isAdmin,
    hasCurrentUserShare,
    persistedScenarioId,
    qc,
  })

  const { currentLock, lockedByOther } = useLessonLock({
    view,
    readOnly,
    persistedScenarioId,
    user,
    locks,
    lockElement,
    unlockElement,
  })

  const {
    updateDocument,
    updatePreviewDocument,
    commitCourseTitle,
    addLesson,
    updateLesson,
    removeLesson,
  } = useDocumentActions({
    readOnly,
    lockedByOther,
    document,
    setDocument,
    view,
    setView,
    titleDraft,
    setTitleError,
    setTitleCommitted,
    titleInputRef,
    createScenarioMutation,
    persistedScenarioId,
    authorName,
  })

  const selectedLesson = view.type === 'lesson'
    ? document.lessons?.find((lesson) => lesson.id === view.lessonId) ?? null
    : null
  const showCommentsRail = Boolean(persistedScenarioId && canAccessComments)
  const viewScrollKey = view.type === 'lesson' ? `lesson:${view.lessonId}` : 'course'

  useEffect(() => {
    scrollCourseToTop()
  }, [persistedScenarioId, scrollCourseToTop, viewScrollKey])

  useEffect(() => {
    if (mode !== 'edit' || !document.id || view.type !== 'structure') return

    scrollCourseToTop()
  }, [document.id, mode, scrollCourseToTop, view.type])

  return (
    <div ref={editorRootRef} className="rise-editor min-h-full bg-[var(--lux-bg)] font-sans text-[var(--lux-text)]">
      {showCommentsRail && (
        <CourseCommentsRail
          scenarioId={persistedScenarioId as string}
          comments={comments}
          readOnly={readOnly}
          isOpen={commentsOpen}
          lessons={document.lessons ?? []}
          activeLessonId={selectedLesson?.id}
          currentUserId={user?.id}
          onClose={() => setCommentsOpen(false)}
          onOpenLesson={(lessonId) => {
            setSettingsOpen(false)
            setCommentsOpen(false)
            setView({ type: 'lesson', lessonId })
          }}
          onCommentChange={(commentId, action) => {
            broadcastScenarioEdit({
              scenarioId: persistedScenarioId as string,
              entityType: 'comment',
              entityId: commentId,
              action,
            })
          }}
        />
      )}
      <TopSaveBar
        status={saveStatus}
        label={saveLabel}
        onRetry={recoverSave}
        showRetry={saveStatus === 'error' || saveStatus === 'conflict'}
        collaborators={collaborators}
        openComments={comments.filter((comment) => comment.status === 'open').length}
        canOpenComments={showCommentsRail}
        commentsOpen={commentsOpen}
        onToggleComments={() => setCommentsOpen((current) => !current)}
      />
      <ConfirmDialog
        open={conflictDialogOpen}
        title={t('editor_conflict_title')}
        description={conflictDetails ? (
          <div className="space-y-2 text-sm">
            <p>{t('editor_conflict_body')}</p>
            <p className="text-[10px] text-slate-500">
              Last saved: {conflictDetails.lastEditTime} by {conflictDetails.lastEditUser}
            </p>
            {conflictDetails.lastEditAction && (
              <p className="text-[10px] text-slate-400">Action: {conflictDetails.lastEditAction}</p>
            )}
          </div>
        ) : (
          t('editor_conflict_body')
        )}
        confirmLabel={t('editor_conflict_reload')}
        cancelLabel={t('editor_conflict_keep')}
        onConfirm={confirmConflictReload}
        onCancel={cancelConflictReload}
      />
      {readOnly && (
        <div className="border-b border-[var(--lux-line)] bg-[var(--lux-primary-soft)] px-4 py-2.5 text-center text-xs font-medium text-[var(--lux-text)]">
          {viewOnlyBannerText}
        </div>
      )}

      <div className={cn(showCommentsRail && commentsOpen && 'lg:pl-[340px]')}>
        {view.type === 'structure' ? (
        <main className="min-h-[calc(100vh-2.5rem)] bg-[var(--lux-bg)] px-4 pb-6 sm:px-8">
          <div className="sticky top-10 z-30 -mx-4 mb-5 border-b border-[var(--lux-line)] bg-[var(--lux-bg)]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
            <div className="mx-auto flex w-full max-w-[952px] items-center justify-between gap-3 overflow-x-auto lux-scrollbar">
              <Link
                href="/dashboard/scenarios"
                className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)]"
              >
                <ArrowLeft size={16} />
                {t('editor_back_courses')}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle compact className="h-9 w-9 rounded-md" />
                {titleCommitted && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
                      <Eye size={14} className="mr-1" />
                      {t('editor_preview')}
                    </Button>
                    {!readOnly && (
                      <>
                        {canInviteCollaborators && (
                          <CollaboratorInviteControl
                            email={collaboratorEmail}
                            suggestions={collaboratorSuggestionOptions}
                            loading={addCollaboratorMutation.isPending}
                            onEmailChange={setCollaboratorEmail}
                            onSubmit={() => addCollaboratorMutation.mutate()}
                          />
                        )}
                        {canManageCollaborators && (
                          <CollaboratorAccessControl
                            shares={scenarioShares}
                            revokingShareId={revokeShareMutation.isPending ? revokeShareMutation.variables : undefined}
                            onRevokeShare={(shareId) => revokeShareMutation.mutate(shareId)}
                          />
                        )}
                        <Button size="sm" variant="secondary" onClick={() => setSettingsOpen((current) => !current)}>
                          <SlidersHorizontal size={14} className="mr-1" />
                          {t('editor_course_settings')}
                        </Button>
                        {persistedScenarioId && (
                          <AiCourseEditControl
                            scenarioId={persistedScenarioId}
                            document={document}
                            scope={{ type: 'course' }}
                            courseDocumentVersion={autosave.savedVersion}
                            onApplied={handleAiApplied}
                            onBeforePropose={flushUnsavedBeforeAiPropose}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {!titleCommitted ? (
            <section className="mx-auto mt-8 max-w-[952px] px-0 py-8 sm:mt-12 sm:py-12">
              {mode === 'create' && !readOnly && (
                <div className="mb-8">
                  <AiCourseCreationWizard
                    onCreated={(created) => window.location.assign(`/dashboard/scenarios/${created.id}/edit`)}
                  />
                </div>
              )}
              <p className="sr-only">New course</p>
              <div className="flex items-start gap-3">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(event) => {
                    setTitleDraft(event.target.value)
                    setTitleError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitCourseTitle()
                  }}
                  placeholder={t('editor_title_placeholder')}
                  className="min-w-0 flex-1 bg-transparent text-[44px] font-bold leading-tight text-[var(--lux-text-strong)] outline-none placeholder:text-[var(--lux-muted-soft)] sm:text-[52px]"
                />
                <button
                  type="button"
                  onClick={commitCourseTitle}
                  className="mt-2 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-[var(--lux-primary)] text-[var(--lux-text-strong)] shadow-sm hover:bg-[var(--lux-primary-hover)]"
                  aria-label={t('editor_confirm_title')}
                >
                  <Check size={18} />
                </button>
              </div>
              {titleError && <p className="mt-3 text-sm font-medium text-red-600">{titleError}</p>}
            </section>
          ) : (
            <StructurePage
              document={document}
              authorName={authorName}
              lessonInputRef={lessonInputRef}
              settingsOpen={settingsOpen}
              scenarioId={persistedScenarioId}
              readOnly={readOnly}
              readiness={readiness}
              onUpdateDocument={updateDocument}
              onEditTitle={() => {
                setTitleDraft(document.title)
                setTitleCommitted(false)
              }}
              onAddLesson={addLesson}
              onUpdateLesson={updateLesson}
              onRemoveLesson={removeLesson}
              onOpenCourseSettings={() => setSettingsOpen(true)}
              onOpenLesson={(lessonId) => {
                setSettingsOpen(false)
                setView({ type: 'lesson', lessonId })
              }}
              onSaveBeforeExport={autosave.retry}
              reviewActions={canReviewScenario ? (
                <ReviewDecisionPanel
                  approving={approveMutation.isPending}
                  revoking={revokeMutation.isPending}
                  onApprove={() => approveMutation.mutate()}
                  onRevoke={(comment) => revokeMutation.mutate(comment)}
                />
              ) : null}
            />
          )}
        </main>
      ) : selectedLesson ? (
        <LessonEditor
          key={selectedLesson.id}
          document={document}
          lesson={selectedLesson}
          lessonOrder={(document.lessons ?? []).findIndex((lesson) => lesson.id === selectedLesson.id) + 1}
          lessonCount={document.lessons?.length ?? 0}
          settingsOpen={settingsOpen}
          readOnly={readOnly || lockedByOther}
          lock={currentLock}
          saveStatus={saveStatus}
          onFinish={async () => {
            const saved = await autosave.retry()
            if (saved) {
              setSettingsOpen(false)
              setView({ type: 'structure' })
            } else {
              toast.error(t('editor_save_before_return'))
            }
          }}
          onBack={() => {
            setSettingsOpen(false)
            setView({ type: 'structure' })
          }}
          onOpenLesson={(lessonId) => {
            setSettingsOpen(false)
            setView({ type: 'lesson', lessonId })
          }}
          onUpdateDocument={updateDocument}
          onUpdateLesson={(updater) => updateLesson(selectedLesson.id, updater)}
          aiScenarioId={!readOnly && persistedScenarioId ? persistedScenarioId : undefined}
          courseDocumentVersion={autosave.savedVersion}
          onAiApplied={handleAiApplied}
          onBeforeAiPropose={flushUnsavedBeforeAiPropose}
        />
      ) : null}
      </div>

      {previewOpen && (
        <CoursePreview
          document={document}
          scenarioId={persistedScenarioId}
          onClose={() => setPreviewOpen(false)}
          onUpdateDocument={updatePreviewDocument}
          onSaveBeforeExport={autosave.retry}
        />
      )}
    </div>
  )
}
