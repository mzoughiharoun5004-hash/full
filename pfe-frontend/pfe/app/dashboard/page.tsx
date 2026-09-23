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
import { useTranslation } from '@/context/LanguageContext'
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
import type { Scenario, ScenarioStatus } from '@/types'

const pipelineStatusKeys = [
  { status: 'BROUILLON',           color: 'var(--lux-gold)',        labelKey: 'dashboard_pipeline_draft'    },
  { status: 'EN_COURS_VALIDATION', color: 'var(--lux-info)',        labelKey: 'dashboard_pipeline_review'   },
  { status: 'APPROVED',            color: 'var(--lux-primary)',     labelKey: 'dashboard_pipeline_approved' },
  { status: 'ARCHIVE',             color: 'var(--lux-muted-soft)', labelKey: 'dashboard_pipeline_archived' },
] as const

function scenarioStatusOf(scenario: Scenario): ScenarioStatus {
  return String(scenario.status ?? scenario.statut ?? '').toUpperCase() as ScenarioStatus
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const { t } = useTranslation()

  const { data: analyticsData, isLoading: loadingAnalytics } = useQuery({
    queryKey: ['analytics-dashboard', isAdmin ? 'admin' : 'me'],
    queryFn: () => analyticsApi.getDashboard().then((response) => normalizeAnalyticsDashboard(response.data)),
    enabled: isAdmin,
  })

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
  const approvedCount = platformScenarios.filter((scenario) => isApprovedScenarioStatus(scenarioStatusOf(scenario))).length
  const reviewCount = platformScenarios.filter((scenario) => scenarioStatusOf(scenario) === 'EN_COURS_VALIDATION').length
  const draftCount = platformScenarios.filter((scenario) => scenarioStatusOf(scenario) === 'BROUILLON').length
  const loadingCards = loadingMyScenarios || (isAdmin && (loadingPlatformScenarios || loadingAnalytics))

  const pipeline = pipelineStatusKeys.map((item) => ({
    ...item,
    label: t(item.labelKey),
    value: platformScenarios.filter((scenario) => {
      const status = scenarioStatusOf(scenario)
      if (item.status === 'APPROVED') return isApprovedScenarioStatus(status)
      return status === item.status
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
        eyebrow={t('dashboard_eyebrow')}
        title={firstName ? t('dashboard_title_greeting', { name: firstName }) : t('dashboard_title_default')}
        description={t('dashboard_description')}
        actions={
          <Link
            href="/dashboard/scenarios/new"
            className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[var(--lux-primary)] px-4 text-xs font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all hover:bg-[var(--lux-primary-hover)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] active:scale-[0.98]"
          >
            <Plus size={15} />
            {t('topbar_new_scenario')}
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
            title={isAdmin ? t('dashboard_metric_approved_admin') : t('dashboard_metric_approved')}
            value={approvedCount}
            description={t('dashboard_metric_approved_desc')}
            iconVariant="primary"
            trend={{ value: t('dashboard_metric_approved_trend'), label: t('dashboard_metric_approved_trend_label'), isPositive: true }}
          />
          <MetricCard
            icon={BookOpen}
            title={t('dashboard_metric_mine')}
            value={myOwnedScenarios.length}
            description={t('dashboard_metric_mine_desc')}
            iconVariant="info"
          />
          <MetricCard
            icon={Clock3}
            title={t('dashboard_metric_review')}
            value={reviewCount}
            description={t('dashboard_metric_review_desc')}
            iconVariant="gold"
          />
          <MetricCard
            icon={isAdmin ? Users : Sparkles}
            title={isAdmin ? t('dashboard_metric_users') : t('dashboard_metric_drafts')}
            value={isAdmin ? (analyticsData?.totalUsers ?? '-') : draftCount}
            description={isAdmin ? t('dashboard_metric_users_desc') : t('dashboard_metric_drafts_desc')}
            iconVariant="violet"
          />
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Card variant="glass">
          <CardHeader>
            <div>
              <h2 className="text-sm font-bold text-[var(--lux-text-strong)]">{t('dashboard_recent_title')}</h2>
              <p className="mt-0.5 text-xs text-[var(--lux-muted-soft)]">{t('dashboard_recent_subtitle')}</p>
            </div>
            <Link
              href="/dashboard/scenarios"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--lux-primary-muted)] transition-colors hover:text-[var(--lux-text-strong)] group"
            >
              {t('dashboard_view_all')}
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
                <p className="text-sm font-bold text-[var(--lux-text-strong)]">{t('dashboard_no_scenarios')}</p>
                <p className="mt-1 text-xs text-[var(--lux-muted-soft)]">{t('dashboard_no_scenarios_desc')}</p>
                <Link
                  href="/dashboard/scenarios/new"
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--lux-primary-soft)] px-3 text-xs font-bold text-[var(--lux-primary-muted)] hover:bg-[var(--lux-primary)] hover:text-white transition-all"
                >
                  <Plus size={14} /> {t('dashboard_create_scenario')}
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--lux-line)]/60">
                {recentScenarios.map((scenario) => {
                  const scenarioOwnerId = scenario.author?.id ?? scenario.ownerId
                  const isOwner = String(scenarioOwnerId ?? '') === String(user?.id ?? '')
                  const hasEditShare = userHasScenarioEditShare(scenario.shares, user?.id)
                  const scenarioStatus = scenarioStatusOf(scenario)
                  const isApprovedOwner = isOwner && isApprovedScenarioStatus(scenarioStatus)
                  const approvedCollaboratorViewOnly = isApprovedCollaboratorViewOnly({ isOwner, hasEditShare, status: scenarioStatus })
                  const canEditScenario = canUserEditScenario({ isOwner, hasEditShare, status: scenarioStatus })
                  const actionLabel = canEditScenario
                    ? t('dashboard_action_edit')
                    : approvedCollaboratorViewOnly || !isAdmin
                      ? t('dashboard_action_view')
                      : t('dashboard_action_review')
                  const primaryHref = scenarioPrimaryHref(scenario.id, { canEdit: canEditScenario, isApprovedOwner })
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
                            <span>{t('dashboard_updated', { date: formatDate(scenario.updatedAt ?? scenario.dateCreation ?? scenario.createdAt) })}</span>
                            {collaboratorNames.length > 0 && (
                              <span>• {collaboratorNames.length === 1
                                ? t('dashboard_collaborator', { n: collaboratorNames.length })
                                : t('dashboard_collaborators', { n: collaboratorNames.length })
                              }</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pl-13 sm:justify-end sm:pl-0">
                        <StatusBadge status={scenarioStatus} />
                        <Link
                          href={primaryHref}
                          onClick={async (event) => {
                            if (!isApprovedOwner) return
                            event.preventDefault()
                            if (!window.confirm(approvedOwnerEditMessage)) return
                            try {
                              await scenariosApi.update(scenario.id, { statut: 'brouillon' })
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
              <h2 className="text-sm font-bold text-[var(--lux-text-strong)]">{t('dashboard_pipeline_title')}</h2>
              <p className="mt-0.5 text-xs text-[var(--lux-muted-soft)]">
                {isAdmin ? t('dashboard_pipeline_subtitle_admin') : t('dashboard_pipeline_subtitle_user')}
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-[var(--lux-surface-soft)] p-0.5 border border-[var(--lux-line)]">
              {pipeline.map((item) => (
                item.value > 0 && (
                  <span
                    key={item.labelKey}
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(item.value / pipelineTotal) * 100}%`, backgroundColor: item.color }}
                    title={`${item.label}: ${item.value}`}
                  />
                )
              ))}
            </div>

            <div className="divide-y divide-[var(--lux-line)]/60">
              {pipeline.map((item) => {
                const percentage = Math.round((item.value / pipelineTotal) * 100)
                return (
                  <div key={item.labelKey} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
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
              {t('dashboard_manage_scenarios')}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </CardBody>
        </Card>
      </section>
    </div>
  )
}
