'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, Edit2, Eye, Tag, UserRound } from 'lucide-react'
import { scenariosApi } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/Badge'
import { formatDate, formatUserName } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import {
  canUserEditScenario,
  confirmApprovedOwnerEdit,
  isApprovedCollaboratorViewOnly,
  isApprovedScenarioStatus,
  scenarioPrimaryHref,
  scenarioViewHref,
  userHasScenarioEditShare,
} from '@/lib/scenarioActions'
import type { Scenario } from '@/types'

interface Ctx { id: string }

export default function ScenarioDetailPage({ params }: { params: Promise<Ctx> }) {
  const { id } = use(params)
  const { user, isAdmin } = useAuth()
  
  const { data: scenario, isLoading } = useQuery<Scenario>({
    queryKey: ['scenario', id],
    queryFn: () => scenariosApi.getOne(id).then(r => r.data),
  })

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner /></div>
  }

  if (!scenario) {
    return <div className="text-center py-24 text-slate-500">Scenario not found</div>
  }

  const scenarioOwnerId = scenario.author?.id ?? scenario.ownerId
  const isOwner = String(scenarioOwnerId ?? '') === String(user?.id ?? '')
  const hasShare = Boolean(
    scenario.shares?.some((share) => String(share.user?.id ?? '') === String(user?.id ?? '')),
  )
  const hasEditShare = userHasScenarioEditShare(scenario.shares, user?.id)
  const isApprovedOwner = isOwner && isApprovedScenarioStatus(scenario.status)
  const approvedCollaboratorViewOnly = isApprovedCollaboratorViewOnly({
    isOwner,
    hasEditShare,
    status: scenario.status,
  })
  const canEditScenario = canUserEditScenario({
    isOwner,
    hasEditShare,
    status: scenario.status,
  })
  const primaryActionLabel = canEditScenario
    ? 'Edit'
    : approvedCollaboratorViewOnly || hasShare || !isAdmin
      ? 'View'
      : 'Review'
  const primaryHref = scenarioPrimaryHref(scenario.id, {
    canEdit: canEditScenario,
    isApprovedOwner,
  })
  const ownerName = scenario.ownerName?.trim() || formatUserName(
    scenario.author,
    scenario.ownerId ? `User #${scenario.ownerId}` : 'Unknown owner',
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/scenarios" className="p-1.5 rounded-lg hover:bg-white/8 text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100 truncate">{scenario.title ?? scenario.titre}</h1>
            <StatusBadge status={scenario.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Created on {formatDate(scenario.createdAt ?? scenario.dateCreation)}
          </p>
        </div>
        <div className="flex gap-2">
          {isApprovedOwner && (
            <Link href={scenarioViewHref(scenario.id)}>
              <Button variant="secondary" className="gap-1.5">
                <Eye size={14} />
                View
              </Button>
            </Link>
          )}
          <Link
            href={primaryHref}
            onClick={isApprovedOwner ? confirmApprovedOwnerEdit : undefined}
          >
            <Button variant="secondary" className="gap-1.5">
              {canEditScenario ? <Edit2 size={14} /> : <Eye size={14} />}
              {primaryActionLabel}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-200">About this scenario</h3>
            </CardHeader>
            <CardBody className="space-y-4 text-sm text-slate-300">
              {scenario.description ? (
                <p className="whitespace-pre-wrap">{scenario.description}</p>
              ) : (
                <p className="text-slate-500 italic">No description provided.</p>
              )}
            </CardBody>
          </Card>
          
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-200">Content Structure</h3>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                {scenario.modules?.map((mod, i) => (
                  <div key={mod.id} className="border border-white/10 rounded-lg p-3 bg-white/5">
                    <div className="font-medium text-slate-200 text-sm mb-2">Module {i + 1}: {mod.title}</div>
                    <div className="space-y-2 pl-4 border-l border-white/10">
                      {mod.sequences?.map(seq => (
                        <div key={seq.id} className="text-xs text-slate-400">
                          <span className="text-slate-300">{seq.title}</span> — {seq.activities?.length ?? 0} activities
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(!scenario.modules || scenario.modules.length === 0) && (
                  <p className="text-xs text-slate-500 text-center py-4">No modules added yet.</p>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-200">Details</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <UserRound size={14} className="text-slate-400" />
                </div>
                <div>
                  <div className="text-slate-500 text-xs">Owner</div>
                  <div className="text-slate-200">{ownerName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <Tag size={14} className="text-slate-400" />
                </div>
                <div>
                  <div className="text-slate-500 text-xs">Template</div>
                  <div className="text-slate-200 capitalize">{(scenario.template ?? 'Blank').toLowerCase()}</div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
