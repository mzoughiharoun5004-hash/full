'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { scenariosApi } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import { InlineScenarioCourseEditor } from './_components/inline-course-editor/InlineScenarioCourseEditor'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/context/LanguageContext'
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
  const { t } = useTranslation()
  const viewMode = searchParams.get('mode') === 'view'

  const { data: scenario, isLoading, isError, refetch } = useQuery<Scenario>({
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

  if (isError || !scenario) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-bold">{t('editor_load_error_title')}</h1>
        <p className="max-w-md text-sm text-[var(--lux-muted)]">
          {t('editor_load_error_body')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg bg-[var(--lux-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          {t('editor_load_error_retry')}
        </button>
      </div>
    )
  }

  const scenarioOwnerId =
    scenario?.author?.id ??
    scenario?.ownerId ??
    scenario?.user?.id ??
    (scenario as { userId?: string | number } | undefined)?.userId
  const isOwner = scenarioOwnerId != null && String(scenarioOwnerId) === String(user?.id ?? '')
  const hasShare = Boolean(
    scenario?.shares?.some((share) => {
      const shareAny = share as unknown as {
        user?: { id?: string | number }
        sharedWith?: { id?: string | number }
        sharedWithId?: string | number
      }
      const shareUserId = shareAny.sharedWith?.id ?? shareAny.sharedWithId ?? shareAny.user?.id
      return String(shareUserId ?? '') === String(user?.id ?? '')
    }),
  )
  const hasEditShare = userHasScenarioEditShare(scenario?.shares, user?.id)
  const scenarioStatus = scenario?.status ?? scenario?.statut
  const canEditScenario = canUserEditScenario({
    isOwner,
    hasEditShare,
    status: scenarioStatus,
  })
  const approvedCollaboratorViewOnly = isApprovedCollaboratorViewOnly({
    isOwner,
    hasEditShare,
    status: scenarioStatus,
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
          loadedDocument={scenario.courseDocument}
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
