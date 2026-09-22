import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, type QueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { getApiErrorMessage, scenariosApi } from '@/lib/api'
import type { CourseDocument, Scenario } from '@/types'
import { authorNameFrom, normalizeCourseDocument, type SaveStatus } from '../courseEditorModel'
import { useCourseDocumentAutosave } from '../useCourseDocumentAutosave'
import type { InlineScenarioCourseEditorProps, ScenarioRoom } from '../shared/editorTypes'

interface UseCourseSaveOptions {
  mode: InlineScenarioCourseEditorProps['mode']
  readOnly: boolean
  viewOnlyMessage: InlineScenarioCourseEditorProps['viewOnlyMessage']
  persistedScenarioId: string | undefined
  setPersistedScenarioId: Dispatch<SetStateAction<string | undefined>>
  createdBaselineDocument: CourseDocument | null
  setCreatedBaselineDocument: Dispatch<SetStateAction<CourseDocument | null>>
  document: CourseDocument
  setDocument: Dispatch<SetStateAction<CourseDocument>>
  titleCommitted: boolean
  documentHydrated: boolean
  normalizedLoadedDocument: CourseDocument | null
  authorName: ReturnType<typeof authorNameFrom>
  broadcastScenarioEdit: ScenarioRoom['broadcastScenarioEdit']
  lastEdit: ScenarioRoom['lastEdit']
  qc: QueryClient
}

export function useCourseSave({
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
}: UseCourseSaveOptions) {
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)

  const createScenarioMutation = useMutation({
    mutationFn: (nextDocument: CourseDocument) =>
      scenariosApi.create({
        title: nextDocument.title,
        description: nextDocument.description,
        template: 'BLANK',
        courseDocument: nextDocument,
      }),
    onSuccess: (response, submittedDocument) => {
      const created = response.data as Scenario
      setPersistedScenarioId(created.id)
      setCreatedBaselineDocument(created.courseDocument ?? submittedDocument)
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', `/dashboard/scenarios/${created.id}/edit`)
      }
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not create course'))
    },
  })

  const [savingProgress, setSavingProgress] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const autosave = useCourseDocumentAutosave({
    scenarioId: persistedScenarioId,
    document,
    enabled: !readOnly && titleCommitted && documentHydrated && !!persistedScenarioId,
    baselineKey: persistedScenarioId,
    baselineDocument: mode === 'edit' ? normalizedLoadedDocument : createdBaselineDocument,
    onSaved: (savedDocument) => {
      setDocument((current) => ({
        ...current,
        metadata: {
          ...current.metadata,
          version: savedDocument.metadata?.version ?? current.metadata?.version,
        },
      }))
      qc.setQueryData(['course-document', persistedScenarioId], savedDocument)
      qc.invalidateQueries({ queryKey: ['scenario-activity', persistedScenarioId] })
      if (persistedScenarioId) {
        broadcastScenarioEdit({
          scenarioId: persistedScenarioId,
          entityType: 'course',
          action: 'update',
          entityId: savedDocument.id,
        })
      }
      setSavingProgress('saved')
      toast.success('Auto-saved', {
        duration: 2000,
      })
    },
    onError: () => {
      setSavingProgress('error')
    },
  })

  const handleAiApplied = useCallback((appliedDoc: CourseDocument) => {
    const normalized = normalizeCourseDocument(appliedDoc, authorName)
    setDocument(normalized)
    autosave.syncSavedDocument(normalized)
    if (persistedScenarioId) {
      qc.setQueryData(['course-document', persistedScenarioId], normalized)
      qc.invalidateQueries({ queryKey: ['scenario', persistedScenarioId] })
      qc.invalidateQueries({ queryKey: ['scenario-activity', persistedScenarioId] })
      broadcastScenarioEdit({
        scenarioId: persistedScenarioId,
        entityType: 'course',
        action: 'update',
        entityId: normalized.id,
      })
    }
  }, [authorName, autosave, broadcastScenarioEdit, persistedScenarioId, qc, setDocument])

  const flushUnsavedBeforeAiPropose = useCallback(async () => {
    const baseline = await autosave.flush()
    if (!baseline) throw new Error('Save the latest course changes before asking AI to edit.')
    return baseline
  }, [autosave])

  const saveStatus: SaveStatus = readOnly
    ? 'saved'
    : createScenarioMutation.isPending
      ? 'saving'
      : createScenarioMutation.isError && !persistedScenarioId
        ? 'error'
        : autosave.status === 'saving'
          ? 'saving'
          : autosave.status === 'error'
            ? 'error'
            : savingProgress === 'saved'
              ? 'saved'
              : autosave.status
  const saveLabel = readOnly
    ? viewOnlyMessage === 'approvedCollaborator'
      ? 'View only'
      : viewOnlyMessage === 'collaborator'
        ? 'View only'
      : 'Review only'
    : createScenarioMutation.isPending
      ? 'Saving...'
      : createScenarioMutation.isError && !persistedScenarioId
        ? 'Course creation failed - retry'
      : autosave.label

  const recoverSave = useCallback(() => {
    if (saveStatus === 'conflict') {
      setConflictDialogOpen(true)
      return
    }

    if (!persistedScenarioId) {
      createScenarioMutation.mutate(document)
      return
    }
    void autosave.retry()
  }, [autosave, createScenarioMutation, document, persistedScenarioId, saveStatus])

  const confirmConflictReload = useCallback(() => {
    // Reloading unmounts everything, so there's nothing left to guard —
    // the autosave hook's own conflictReloadingRef exists for the gap
    // between this click and the reload actually happening.
    setConflictDialogOpen(false)
    window.location.reload()
  }, [])

  const cancelConflictReload = useCallback(() => {
    setConflictDialogOpen(false)
    autosave.resetConflict()
  }, [autosave])

  // New: Memoize conflict details for display
  const conflictDetails = useMemo(() => {
    if (!normalizedLoadedDocument || !lastEdit) return null
    const lastEditUser = [
      lastEdit.user?.firstName,
      lastEdit.user?.lastName,
    ].filter(Boolean).join(' ') || lastEdit.user?.email || 'unknown user'

    return {
      lastEditTime: lastEdit.sentAt
        ? new Date(lastEdit.sentAt).toLocaleString()
        : 'unknown',
      lastEditUser,
      lastEditAction: lastEdit.action,
    }
  }, [normalizedLoadedDocument, lastEdit])

  return {
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
  }
}
