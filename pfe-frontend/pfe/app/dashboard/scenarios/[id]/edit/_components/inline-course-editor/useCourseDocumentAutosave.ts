import { useCallback, useEffect, useRef, useState } from 'react'
import { scenariosApi } from '@/lib/api'
import type { CourseDocument } from '@/types'
import type { SaveStatus } from './courseEditorModel'

interface UseCourseDocumentAutosaveOptions {
  scenarioId?: string
  document: CourseDocument
  enabled: boolean
  baselineKey?: string
  baselineDocument?: CourseDocument | null
  onSaved?: (document: CourseDocument) => void
  onError?: (error: unknown) => void
}

export function useCourseDocumentAutosave({
  scenarioId,
  document,
  enabled,
  baselineKey,
  baselineDocument,
  onSaved,
}: UseCourseDocumentAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const lastSavedRef = useRef(serializeForDirtyCheck(document))
  const latestDocumentRef = useRef(document)
  const queuedDocumentRef = useRef<CourseDocument | null>(null)
  const inFlightRef = useRef(false)
  const activeSaveRef = useRef<Promise<boolean> | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false)
  const lastBaselineKeyRef = useRef<string | undefined>(undefined)
  const baselineInitializedRef = useRef(false)
  // Blocks the debounce effect from queuing new autosaves while a save
  // conflict (409) is unresolved — i.e. between the conflict dialog opening
  // and the user either reloading or explicitly dismissing it via resetConflict.
  const conflictReloadingRef = useRef(false)
  const [savedVersion, setSavedVersion] = useState<number>(() =>
    courseDocumentVersion(baselineDocument ?? document),
  )
  const versionRef = useRef(courseDocumentVersion(baselineDocument ?? document))
  const onSavedRef = useRef(onSaved)

  useEffect(() => {
    latestDocumentRef.current = document
    onSavedRef.current = onSaved
  }, [document, onSaved])

  useEffect(() => {
    if (baselineKey !== lastBaselineKeyRef.current) {
      lastBaselineKeyRef.current = baselineKey
      baselineInitializedRef.current = false
      queuedDocumentRef.current = null
      setStatus('saved')
    }

    // For an existing course, wait for the server document before recording
    // the autosave baseline. Otherwise an older local default (version 1)
    // can trigger a false optimistic-lock conflict as soon as the document
    // finishes loading.
    if (!baselineKey || !baselineDocument || baselineInitializedRef.current) return

    lastSavedRef.current = serializeForDirtyCheck(baselineDocument)
    const baselineVersion = courseDocumentVersion(baselineDocument)
    versionRef.current = baselineVersion
    setSavedVersion(baselineVersion)
    baselineInitializedRef.current = true
  }, [baselineDocument, baselineKey, document])

  const saveNow = useCallback(async () => {
    if (!scenarioId || !enabled) return false

    const submittedDocument = queuedDocumentRef.current ?? latestDocumentRef.current
    queuedDocumentRef.current = null

    if (inFlightRef.current) {
      queuedDocumentRef.current = latestDocumentRef.current
      const activeSave = activeSaveRef.current
      try {
        if (!activeSave || !(await activeSave)) return false
      } catch {
        // The save that was already in flight failed (network error, 409
        // conflict, etc). Without this catch, that rejection propagated
        // straight out of saveNow() as an unhandled promise rejection, so
        // callers like the "Finish" button's onFinish() never got to run
        // their `else` branch — clicking Finish just silently did nothing.
        return false
      }
      return saveNowRef.current()
    }

    const submittedJson = serializeForDirtyCheck(submittedDocument)
    if (submittedJson === lastSavedRef.current) {
      setStatus('saved')
      return true
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    inFlightRef.current = true
    setStatus('saving')
    let saved = false

    try {
      const request = scenariosApi
        .updateCourseDocument(scenarioId, submittedDocument, versionRef.current)
        .then((response) => {
          const nextVersion = courseDocumentVersion(response.data)
          // Record the saved content without the version field so version
          // bumps (which React state also reflects via onSaved's setDocument)
          // never create a false mismatch and re-arm the debounce effect.
          lastSavedRef.current = serializeForDirtyCheck(submittedDocument)
          versionRef.current = nextVersion
          setSavedVersion(nextVersion)
          onSavedRef.current?.(response.data)
          return true
        })
      activeSaveRef.current = request
      saved = await request

      const latestJson = serializeForDirtyCheck(latestDocumentRef.current)
      if (latestJson === lastSavedRef.current && !queuedDocumentRef.current) {
        setStatus('saved')
      } else {
        queuedDocumentRef.current = latestDocumentRef.current
        setStatus('dirty')
      }
    } catch (error) {
      queuedDocumentRef.current = latestDocumentRef.current
      const conflict = isConflictError(error)
      if (conflict) conflictReloadingRef.current = true
      setStatus(conflict ? 'conflict' : 'error')
    } finally {
      inFlightRef.current = false
      activeSaveRef.current = null
    }

    if (saved && serializeForDirtyCheck(latestDocumentRef.current) !== lastSavedRef.current) {
      return saveNowRef.current()
    }
    return saved
  }, [enabled, scenarioId])

  const resetConflict = useCallback(() => {
    conflictReloadingRef.current = false
  }, [])

  const syncSavedDocument = useCallback((savedDoc: CourseDocument) => {
    const nextVersion = courseDocumentVersion(savedDoc)
    lastSavedRef.current = serializeForDirtyCheck(savedDoc)
    versionRef.current = nextVersion
    setSavedVersion(nextVersion)
    latestDocumentRef.current = savedDoc
    queuedDocumentRef.current = null
    setStatus('saved')
  }, [])

  const flush = useCallback(async (): Promise<{
    document: CourseDocument
    version: number
  } | null> => {
    const saved = await saveNowRef.current()
    if (!saved) return null
    return {
      document: latestDocumentRef.current,
      version: versionRef.current,
    }
  }, [])

  useEffect(() => {
    saveNowRef.current = saveNow
  }, [saveNow])

  useEffect(() => {
    if (!scenarioId || !enabled || conflictReloadingRef.current) return
    const nextJson = serializeForDirtyCheck(document)
    if (nextJson === lastSavedRef.current) return

    queuedDocumentRef.current = document
    setStatus('dirty')
    const timeout = window.setTimeout(() => {
      saveTimerRef.current = null
      void saveNowRef.current()
    }, 650)
    saveTimerRef.current = timeout

    return () => {
      window.clearTimeout(timeout)
      if (saveTimerRef.current === timeout) saveTimerRef.current = null
    }
  }, [document, enabled, scenarioId])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
  }, [])

  return {
    status,
    label:
      status === 'saving'
        ? 'Saving...'
        : status === 'conflict'
          ? 'Changed elsewhere - reload'
        : status === 'error'
          ? 'Save failed - retry'
          : status === 'dirty'
            ? 'Saving...'
            : 'Saved',
    retry: saveNow,
    resetConflict,
    savedVersion,
    flush,
    syncSavedDocument,
  }
}

function courseDocumentVersion(document: CourseDocument): number {
  const version = Number(document.metadata?.version)
  return Number.isInteger(version) && version > 0 ? version : 1
}

function isConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const response = (error as { response?: { status?: number } }).response
  return response?.status === 409
}

/**
 * Serialize a document for dirty-checking, intentionally omitting
 * `metadata.version`. The version is a backend-assigned optimistic-lock
 * counter tracked in `versionRef`/`savedVersion`; it must never cause the
 * debounce effect to fire a spurious save after `onSaved` bumps it in React
 * state.
 */
function serializeForDirtyCheck(document: CourseDocument): string {
  if (!document.metadata) return JSON.stringify(document)
  const { version: _version, ...restMetadata } = document.metadata as Record<string, unknown>
  return JSON.stringify({ ...document, metadata: restMetadata })
}
