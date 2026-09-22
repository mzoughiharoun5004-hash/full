import { useCallback } from 'react'
import { useMutation, type QueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { getApiErrorMessage, scenariosApi } from '@/lib/api'
import type { Scenario } from '@/types'

interface UseReviewActionsOptions {
  scenario: Scenario | undefined
  isAdmin: boolean | undefined
  hasCurrentUserShare: boolean
  persistedScenarioId: string | undefined
  qc: QueryClient
}

export function useReviewActions({
  scenario,
  isAdmin,
  hasCurrentUserShare,
  persistedScenarioId,
  qc,
}: UseReviewActionsOptions) {
  const canReviewScenario = Boolean(
    isAdmin &&
      !hasCurrentUserShare &&
      persistedScenarioId &&
      scenario?.status === 'EN_COURS_VALIDATION',
  )

  const invalidateScenario = useCallback(() => {
    if (!persistedScenarioId) return
    qc.invalidateQueries({ queryKey: ['scenario', persistedScenarioId] })
    qc.invalidateQueries({ queryKey: ['scenarios'] })
  }, [persistedScenarioId, qc])

  const approveMutation = useMutation({
    mutationFn: () => scenariosApi.approve(persistedScenarioId as string),
    onSuccess: () => {
      toast.success('Scenario approved')
      invalidateScenario()
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to approve scenario'))
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (reviewComment?: string) => scenariosApi.reject(persistedScenarioId as string, { comment: reviewComment }),
    onSuccess: () => {
      toast.success('Scenario revoked')
      invalidateScenario()
      if (persistedScenarioId) {
        qc.invalidateQueries({ queryKey: ['scenario-comments', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenario-activity', persistedScenarioId] })
      }
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to revoke scenario'))
    },
  })

  return { canReviewScenario, approveMutation, revokeMutation }
}
