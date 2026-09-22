import { useEffect } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { scenariosApi } from '@/lib/api'
import type { ScenarioComment } from '@/types'
import type { ScenarioRoom } from '../shared/editorTypes'

interface UseCourseCommentsOptions {
  persistedScenarioId: string | undefined
  canAccessComments: boolean
  lastEdit: ScenarioRoom['lastEdit']
  qc: QueryClient
}

export function useCourseComments({
  persistedScenarioId,
  canAccessComments,
  lastEdit,
  qc,
}: UseCourseCommentsOptions) {
  const { data: comments = [] } = useQuery<ScenarioComment[]>({
    queryKey: ['scenario-comments', persistedScenarioId],
    enabled: Boolean(persistedScenarioId && canAccessComments),
    queryFn: () => scenariosApi.getComments(persistedScenarioId as string).then((response) => response.data),
  })

  useEffect(() => {
    if (lastEdit?.entityType !== 'comment' || !persistedScenarioId) return

    qc.invalidateQueries({ queryKey: ['scenario-comments', persistedScenarioId] })
    qc.invalidateQueries({ queryKey: ['scenario-activity', persistedScenarioId] })
  }, [lastEdit, persistedScenarioId, qc])

  return comments
}
