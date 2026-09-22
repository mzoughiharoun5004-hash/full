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
  const lastSavedRef = useRef(JSON.stringify(document))
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

    lastSavedRef.current = JSON.stringify(baselineDocument)
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
      if (!activeSave || !(await activeSave)) return false
      return saveNowRef.current()
    }

    const submittedJson = JSON.stringify(submittedDocument)
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
          lastSavedRef.current = submittedJson
          const nextVersion = courseDocumentVersion(response.data)
          versionRef.current = nextVersion
          setSavedVersion(nextVersion)
          onSavedRef.current?.(response.data)
          return true
        })
      activeSaveRef.current = request
      saved = await request
      lastSavedRef.current = submittedJson

      const latestJson = JSON.stringify(latestDocumentRef.current)
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

    if (saved && JSON.stringify(latestDocumentRef.current) !== lastSavedRef.current) {
      return saveNowRef.current()
    }
    return saved
  }, [enabled, scenarioId])

  const resetConflict = useCallback(() => {
    conflictReloadingRef.current = false
  }, [])

  const syncSavedDocument = useCallback((savedDoc: CourseDocument) => {
    const nextVersion = courseDocumentVersion(savedDoc)
    lastSavedRef.current = JSON.stringify(savedDoc)
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
    const nextJson = JSON.stringify(document)
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
