import { useEffect, useMemo, useRef, useState } from 'react'
import { scenariosApi } from '@/lib/api'
import type { ScenarioDocument } from '@/types'
import { scenarioDocumentStorageKey } from './scenarioDocumentFactory'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'offline' | 'error'

interface UseScenarioAutosaveOptions {
  scenarioId: string
  document: ScenarioDocument
  enabled?: boolean
  onSaved?: (document: ScenarioDocument) => void
  onRemoteEdit?: () => void
}

export function useScenarioAutosave({
  scenarioId,
  document,
  enabled = true,
  onSaved,
  onRemoteEdit,
}: UseScenarioAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const lastSavedJsonRef = useRef(JSON.stringify(document))
  const saveSeqRef = useRef(0)
  const onSavedRef = useRef(onSaved)
  const onRemoteEditRef = useRef(onRemoteEdit)

  useEffect(() => {
    onSavedRef.current = onSaved
    onRemoteEditRef.current = onRemoteEdit
  }, [onSaved, onRemoteEdit])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    // Keep a local draft before the debounce completes so a refresh or network
    // loss does not discard edits that have not reached the API yet.
    const payload = JSON.stringify({
      document,
      savedAt: new Date().toISOString(),
    })
    window.localStorage.setItem(scenarioDocumentStorageKey(scenarioId), payload)
  }, [document, enabled, scenarioId])

  useEffect(() => {
    if (!enabled) return
    const nextJson = JSON.stringify(document)
    if (nextJson === lastSavedJsonRef.current) return

    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unsaved')
    const seq = saveSeqRef.current + 1
    saveSeqRef.current = seq

    const timeout = window.setTimeout(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setStatus('offline')
        return
      }

      setStatus('saving')
      try {
        const nextDocument = {
          ...document,
          metadata: {
            ...document.metadata,
            updatedAt: new Date().toISOString(),
          },
        }
        const response = await scenariosApi.updateScenarioDocument(scenarioId, nextDocument)
        // Ignore stale responses from superseded saves; the latest document is
        // the only one allowed to clear dirty/error state.
        if (seq !== saveSeqRef.current) return

        const savedDocument = response.data
        lastSavedJsonRef.current = JSON.stringify(savedDocument)
        setStatus('saved')
        setLastSavedAt(new Date())
        window.localStorage.removeItem(scenarioDocumentStorageKey(scenarioId))
        onSavedRef.current?.(savedDocument)
        onRemoteEditRef.current?.()
      } catch {
        if (seq === saveSeqRef.current) setStatus('error')
      }
    }, 850)

    return () => window.clearTimeout(timeout)
  }, [document, enabled, scenarioId])

  const label = useMemo(() => {
    if (status === 'saving') return 'Saving...'
    if (status === 'unsaved') return 'Unsaved'
    if (status === 'offline') return 'Offline changes'
    if (status === 'error') return 'Save failed'
    return lastSavedAt ? 'Saved just now' : 'Saved'
  }, [lastSavedAt, status])

  return {
    status,
    label,
    isDirty: status !== 'saved',
  }
}
