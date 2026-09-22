import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { getApiErrorMessage, scenariosApi, usersApi } from '@/lib/api'
import type { useAuth } from '@/context/AuthContext'
import type { Scenario, ScenarioShare, User } from '@/types'
import type { ScenarioRoom } from '../shared/editorTypes'

interface UseCollaboratorSharingOptions {
  scenario: Scenario | undefined
  user: ReturnType<typeof useAuth>['user']
  isScenarioOwner: boolean
  persistedScenarioId: string | undefined
  broadcastScenarioEdit: ScenarioRoom['broadcastScenarioEdit']
  qc: QueryClient
}

export function useCollaboratorSharing({
  scenario,
  user,
  isScenarioOwner,
  persistedScenarioId,
  broadcastScenarioEdit,
  qc,
}: UseCollaboratorSharingOptions) {
  const [collaboratorEmail, setCollaboratorEmail] = useState('')

  const trimmedCollaboratorEmail = collaboratorEmail.trim()
  // Defer the query key so fast typing doesn't fire a request per keystroke;
  // React schedules the update at low priority and coalesces rapid changes.
  const deferredCollaboratorEmail = useDeferredValue(trimmedCollaboratorEmail)
  const { data: collaboratorSuggestions = [] } = useQuery<User[]>({
    queryKey: ['user-search', deferredCollaboratorEmail],
    enabled: Boolean(isScenarioOwner && deferredCollaboratorEmail.length >= 2),
    queryFn: () => usersApi.search(deferredCollaboratorEmail).then((response) => response.data),
    staleTime: 30_000,
  })
  const { data: loadedShares } = useQuery<ScenarioShare[]>({
    queryKey: ['shares', persistedScenarioId],
    enabled: Boolean(isScenarioOwner && persistedScenarioId),
    queryFn: () => scenariosApi.getShares(persistedScenarioId as string).then((response) => response.data),
  })
  const scenarioShares = useMemo(
    () => loadedShares ?? scenario?.shares ?? [],
    [loadedShares, scenario?.shares],
  )
  const hasCurrentUserShare = scenarioShares.some(
    (share) => String(share.user?.id ?? '') === String(user?.id ?? ''),
  )
  const collaboratorSuggestionOptions = useMemo(() => {
    const currentUserId = String(user?.id ?? '')
    const sharedUserIds = new Set(
      scenarioShares.map((share) => String(share.user?.id ?? '')),
    )
    return collaboratorSuggestions.filter((suggestion) => {
      const suggestionId = String(suggestion.id ?? '')
      return suggestionId !== currentUserId && !sharedUserIds.has(suggestionId)
    })
  }, [collaboratorSuggestions, scenarioShares, user?.id])

  const addCollaboratorMutation = useMutation({
    mutationFn: () => {
      if (!persistedScenarioId || !trimmedCollaboratorEmail) {
        return Promise.reject(new Error('Enter a collaborator email'))
      }
      return scenariosApi.share(persistedScenarioId, {
        email: trimmedCollaboratorEmail,
      })
    },
    onSuccess: () => {
      toast.success('Collaborator added')
      setCollaboratorEmail('')
      if (persistedScenarioId) {
        qc.invalidateQueries({ queryKey: ['scenario', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['shares', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenarios'] })
        broadcastScenarioEdit({
          scenarioId: persistedScenarioId,
          entityType: 'scenario',
          action: 'update',
        })
      }
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to add collaborator')),
  })

  const revokeShareMutation = useMutation({
    mutationFn: (shareId: string) => {
      if (!persistedScenarioId) {
        return Promise.reject(new Error('Course is not saved yet'))
      }
      return scenariosApi.revokeShare(persistedScenarioId, shareId)
    },
    onSuccess: (_response, shareId) => {
      toast.success('Collaborator access revoked')
      if (persistedScenarioId) {
        qc.setQueryData<ScenarioShare[]>(['shares', persistedScenarioId], (current) =>
          current?.filter((share) => share.id !== shareId) ?? current,
        )
        qc.invalidateQueries({ queryKey: ['shares', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenario', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenarios'] })
        broadcastScenarioEdit({
          scenarioId: persistedScenarioId,
          entityType: 'scenario',
          action: 'update',
        })
      }
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to revoke access')),
  })

  return {
    collaboratorEmail,
    setCollaboratorEmail,
    collaboratorSuggestionOptions,
    scenarioShares,
    hasCurrentUserShare,
    addCollaboratorMutation,
    revokeShareMutation,
  }
}
