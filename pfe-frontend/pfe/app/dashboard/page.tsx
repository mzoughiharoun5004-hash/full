'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Film,
  Plus,
  Users,
  Sparkles,
} from 'lucide-react'
import { analyticsApi, scenariosApi } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { MetricCard } from '@/components/ui/MetricCard'
import { formatDate, formatUserName } from '@/lib/utils'
import { normalizeAnalyticsDashboard } from '@/lib/analytics'
import {
  approvedOwnerEditMessage,
  canUserEditScenario,
  isApprovedCollaboratorViewOnly,
  isApprovedScenarioStatus,
  scenarioPrimaryHref,
  userHasScenarioEditShare,
} from '@/lib/scenarioActions'
import type { Scenario } from '@/types'

const pipelineMeta = [
  { label: 'Draft', status: 'BROUILLON', color: 'var(--lux-gold)' },
  { label: 'In review', status: 'EN_COURS_VALIDATION', color: 'var(--lux-info)' },
  { label: 'Approved', status: 'APPROVED', color: 'var(--lux-primary)' },
  { label: 'Archived', status: 'ARCHIVE', color: 'var(--lux-muted-soft)' },
] as const

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()

  const { data: analyticsData, isLoading: loadingAnalytics } = useQuery({
    queryKey: ['analytics-dashboard', isAdmin ? 'admin' : 'me'],
    queryFn: () => analyticsApi.getDashboard().then((response) => normalizeAnalyticsDashboard(response.data)),
    enabled: isAdmin,
  })

  // These two queries back the dashboard's aggregate counts (approved/review/
  // draft, "My scenarios", the pipeline breakdown). There's no dedicated
  // stats/count endpoint, so this fetches a capped page of scenarios and
  // counts client-side. `limit: 100` is the backend's own max page size
  // (see ScenarioService.findAllPaginated's safeLimit) — on a platform with
  // more than 100 scenarios in a given visibility bucket, these counts will
  // undercount. Swap this for a real aggregate/stats endpoint if one is
  // ever added.
  const { data: platformScenariosData, isLoading: loadingPlatformScenarios } = useQuery<Scenario[]>({
    queryKey: ['scenarios-platform-overview'],
    queryFn: () => scenariosApi.getAllAdmin({ limit: 100 }).then((response) => response.data.items),
    enabled: isAdmin,
  })

  const { data: myScenariosData, isLoading: loadingMyScenarios } = useQuery<Scenario[]>({
    queryKey: ['scenarios-my-overview', user?.id ?? 'me'],
    queryFn: () => scenariosApi.getAll({ limit: 100 }).then((response) => response.data.items),
    enabled: Boolean(user?.id),
  })

  const myScenarios: Scenario[] = myScenariosData ?? []
  const platformScenarios: Scenario[] = isAdmin ? (platformScenariosData ?? []) : myScenarios
  const myOwnedScenarios = myScenarios.filter((scenario) => {
    const ownerId = scenario.author?.id ?? scenario.ownerId
    return String(ownerId ?? '') === String(user?.id ?? '')
  })
  const approvedCount = platformScenarios.filter((scenario) => isApprovedScenarioStatus(scenario.status)).length
  const reviewCount = platformScenarios.filter((scenario) => scenario.status === 'EN_COURS_VALIDATION').length
  const draftCount = platformScenarios.filter((scenario) => scenario.status === 'BROUILLON').length
  const loadingCards =
    loadingMyScenarios || (isAdmin && (loadingPlatformScenarios || loadingAnalytics))

  const pipeline = pipelineMeta.map((item) => ({
    ...item,
    value: platformScenarios.filter((scenario) => {
      if (item.status === 'APPROVED') return isApprovedScenarioStatus(scenario.status)
      return scenario.status === item.status
    }).length,
  }))
  const pipelineTotal = Math.max(1, pipeline.reduce((total, item) => total + item.value, 0))

  const recentScenarios = [...myScenarios]
    .sort((a, b) => {
      const aDate = new Date(a.updatedAt ?? a.dateCreation ?? a.createdAt).getTime()
      const bDate = new Date(b.updatedAt ?? b.dateCreation ?? b.createdAt).getTime()
      return bDate - aDate
    })
    .slice(0, 6)

  const firstName = user?.firstName?.trim()

  return (
    <div className="space-y-6 fade-up">
      <PageHeader
        eyebrow="Workspace Overview"
        title={firstName ? `Welcome back, ${firstName}` : 'Overview'}
        description="Track course activity, review status, and continue your latest scenario authoring."
        actions={
          <Link
            href="/dashboard/scenarios/new"
            className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[var(--lux-primary)] px-4 text-xs font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all hover:bg-[var(--lux-primary-hover)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] active:scale-[0.98]"
          >
            <Plus size={15} />
            New scenario
          </Link>
        }
      />

      {loadingCards ? (
        <div className="flex min-h-36 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Film}
            title={isAdmin ? 'Approved on platform' : 'Approved scenarios'}
            value={approvedCount}
            description="Ready for delivery & export"
            iconVariant="primary"
            trend={{ value: 'Live', label: 'In production', isPositive: true }}
          />
          <MetricCard
            icon={BookOpen}
            title="My scenarios"
            value={myOwnedScenarios.length}
            description="Created by you"
            iconVariant="info"
          />
          <MetricCard
            icon={Clock3}
            title="In review"
            value={reviewCount}
            description="Awaiting feedback or approval"
            iconVariant="gold"
          />
          <MetricCard
            icon={isAdmin ? Users : Sparkles}
            title={isAdmin ? 'Platform users' : 'Draft scenarios'}
            value={isAdmin ? (analyticsData?.totalUsers ?? '-') : draftCount}
            description={isAdmin ? 'Active workspace accounts' : 'Work in progress'}
            iconVariant="violet"
          />
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Card variant="glass">
          <CardHeader>
            <div>
              <h2 className="text-sm font-bold text-[var(--lux-text-strong)]">Recent scenarios</h2>
              <p className="mt-0.5 text-xs text-[var(--lux-muted-soft)]">Your latest authoring activity</p>
            </div>
            <Link
              href="/dashboard/scenarios"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--lux-primary-muted)] transition-colors hover:text-[var(--lux-text-strong)] group"
            >
              View all
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {loadingMyScenarios ? (
              <div className="flex min-h-48 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : recentScenarios.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-sm font-bold text-[var(--lux-text-strong)]">No scenarios yet</p>
                <p className="mt-1 text-xs text-[var(--lux-muted-soft)]">Create a scenario to start your workspace activity.</p>
                <Link
                  href="/dashboard/scenarios/new"
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--lux-primary-soft)] px-3 text-xs font-bold text-[var(--lux-primary-muted)] hover:bg-[var(--lux-primary)] hover:text-white transition-all"
                >
                  <Plus size={14} /> Create scenario
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--lux-line)]/60">
                {recentScenarios.map((scenario) => {
                  const scenarioOwnerId = scenario.author?.id ?? scenario.ownerId
                  const isOwner = String(scenarioOwnerId ?? '') === String(user?.id ?? '')
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
                  const actionLabel = canEditScenario
                    ? 'Edit'
                    : approvedCollaboratorViewOnly || !isAdmin
                      ? 'View'
                      : 'Review'
                  const primaryHref = scenarioPrimaryHref(scenario.id, {
                    canEdit: canEditScenario,
                    isApprovedOwner,
                  })
                  const collaboratorNames = (scenario.shares ?? [])
                    .map((share) => formatUserName(share.user, ''))
                    .filter(Boolean)

                  return (
                    <article
                      key={scenario.id}
                      className="group grid gap-3 px-5 py-4 transition-colors hover:bg-[var(--lux-overlay-hover)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="flex min-w-0 items-start gap-3.5">
                        <span className="mt-0.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl border border-[var(--lux-primary)]/20 bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)] transition-transform group-hover:scale-105">
                          <Film size={17} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--lux-text-strong)] group-hover:text-[var(--lux-primary-muted)] transition-colors">
                            {scenario.titre ?? scenario.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-[var(--lux-muted-soft)]">
                            <span>Updated {formatDate(scenario.updatedAt ?? scenario.dateCreation ?? scenario.createdAt)}</span>
                            {collaboratorNames.length > 0 && (
                              <span>• {collaboratorNames.length} collaborator{collaboratorNames.length === 1 ? '' : 's'}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pl-13 sm:justify-end sm:pl-0">
                        <StatusBadge status={scenario.status} />
                        <Link
                          href={primaryHref}
                          onClick={async (event) => {
                            if (!isApprovedOwner) return

                            event.preventDefault()
                            if (!window.confirm(approvedOwnerEditMessage)) return

                            try {
                              await scenariosApi.update(scenario.id, { statut: 'BROUILLON' })
                              window.location.href = primaryHref
                            } catch {
                              window.alert('Unable to move this scenario back to draft.')
                            }
                          }}
                          className="inline-flex h-8 items-center rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 text-xs font-bold text-[var(--lux-text)] transition-all hover:border-[var(--lux-primary)]/40 hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)]"
                        >
                          {actionLabel}
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <div>
              <h2 className="text-sm font-bold text-[var(--lux-text-strong)]">Scenario pipeline</h2>
              <p className="mt-0.5 text-xs text-[var(--lux-muted-soft)]">
                {isAdmin ? 'Platform status mix' : 'Your current status mix'}
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-[var(--lux-surface-soft)] p-0.5 border border-[var(--lux-line)]">
              {pipeline.map((item) => (
                item.value > 0 && (
                  <span
                    key={item.label}
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(item.value / pipelineTotal) * 100}%`,
                      backgroundColor: item.color,
                    }}
                    title={`${item.label}: ${item.value}`}
                  />
                )
              ))}
            </div>

            <div className="divide-y divide-[var(--lux-line)]/60">
              {pipeline.map((item) => {
                const percentage = Math.round((item.value / pipelineTotal) * 100)
                return (
                  <div key={item.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full shadow-xs" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-xs font-semibold text-[var(--lux-text)]">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--lux-muted-soft)] font-medium">{percentage}%</span>
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-[var(--lux-overlay)] px-1.5 text-xs font-extrabold text-[var(--lux-text-strong)]">
                        {item.value}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <Link
              href="/dashboard/scenarios"
              className="inline-flex h-9.5 w-full items-center justify-center gap-2 rounded-xl border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-xs font-bold text-[var(--lux-text-strong)] transition-all hover:border-[var(--lux-primary)]/40 hover:bg-[var(--lux-elevated)] group"
            >
              Manage scenarios
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </CardBody>
        </Card>
      </section>
    </div>
  )
}
