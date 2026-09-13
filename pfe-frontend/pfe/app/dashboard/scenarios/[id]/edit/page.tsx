'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { scenariosApi } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import { InlineScenarioCourseEditor } from './_components/inline-course-editor/InlineScenarioCourseEditor'
import { useAuth } from '@/context/AuthContext'
import { ScenarioRoomProvider } from '@/context/SocketContext'
import {
  canUserEditScenario,
  isApprovedCollaboratorViewOnly,
  userHasScenarioEditShare,
} from '@/lib/scenarioActions'
import type { Scenario } from '@/types'

interface Ctx {
  id: string
}

export default function ScenarioEditPage({ params }: { params: Promise<Ctx> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const viewMode = searchParams.get('mode') === 'view'

  const { data: scenario, isLoading } = useQuery<Scenario>({
    queryKey: ['scenario', id],
    queryFn: () => scenariosApi.getOne(id).then((response) => response.data),
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  const scenarioOwnerId = scenario?.author?.id ?? scenario?.ownerId
  const isOwner = String(scenarioOwnerId ?? '') === String(user?.id ?? '')
  const hasShare = Boolean(
    scenario?.shares?.some((share) => String(share.user?.id ?? '') === String(user?.id ?? '')),
  )
  const hasEditShare = userHasScenarioEditShare(scenario?.shares, user?.id)
  const canEditScenario = canUserEditScenario({
    isOwner,
    hasEditShare,
    status: scenario?.status,
  })
  const approvedCollaboratorViewOnly = isApprovedCollaboratorViewOnly({
    isOwner,
    hasEditShare,
    status: scenario?.status,
  })
  const readOnly = Boolean(
    scenario && (viewMode || !canEditScenario),
  )
  return (
    <div className="min-h-screen">
      <ScenarioRoomProvider scenarioId={id}>
        <InlineScenarioCourseEditor
          mode="edit"
          scenarioId={id}
          scenario={scenario}
          readOnly={readOnly}
          viewOnlyMessage={
            approvedCollaboratorViewOnly
              ? 'approvedCollaborator'
              : hasShare && !isOwner && !canEditScenario
                ? 'collaborator'
                : undefined
          }
          canAccessComments={canEditScenario}
        />
      </ScenarioRoomProvider>
    </div>
  )
}
