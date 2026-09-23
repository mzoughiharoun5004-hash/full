'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Plus, Search, Film, Edit2, Trash2, Copy, Archive, Send, CheckCircle, XCircle, Eye, Layers } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { scenariosApi, type PaginatedScenarios, type ScenarioListParams } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { RevokeScenarioDialog } from '@/components/scenarios/RevokeScenarioDialog'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { formatDate, formatUserName, truncate } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/context/LanguageContext'
import {
  canUserEditScenario,
  isApprovedCollaboratorViewOnly,
  isApprovedScenarioStatus,
  scenarioPrimaryHref,
  scenarioViewHref,
  userHasScenarioEditShare,
} from '@/lib/scenarioActions'
import type { Scenario, ScenarioStatus } from '@/types'
import type { TranslationKey } from '@/lib/translations'

type ScenarioFilter = ScenarioStatus | 'ALL' | 'MY'

const filterConfig: { labelKey: TranslationKey; value: ScenarioFilter }[] = [
  { labelKey: 'scenarios_filter_all', value: 'ALL' },
  { labelKey: 'scenarios_filter_my', value: 'MY' },
  { labelKey: 'scenarios_filter_draft', value: 'BROUILLON' },
  { labelKey: 'scenarios_filter_review', value: 'EN_COURS_VALIDATION' },
  { labelKey: 'scenarios_filter_approved', value: 'APPROUVE' },
  { labelKey: 'scenarios_filter_archived', value: 'ARCHIVE' },
]

function buildScenarioListParams(
  filter: ScenarioFilter,
  search: string,
  page: number,
  limit: number,
): ScenarioListParams {
  const params: ScenarioListParams = { page, limit }
  const trimmedSearch = search.trim()
  if (trimmedSearch) params.search = trimmedSearch

  if (filter === 'MY') {
    params.mine = true
  } else if (filter === 'APPROUVE') {
    params.statuses = ['APPROUVE', 'EXPORTE']
  } else if (filter !== 'ALL') {
    params.status = filter
  }

  return params
}

function getCourseModulesDisplayCount(scenario: Scenario): number {
  const lessons = scenario.courseDocument?.lessons
  if (Array.isArray(lessons) && lessons.length > 0) {
    const lessonCount = lessons.filter((lesson) => lesson.type === 'lesson').length
    const quizCount = lessons.filter((lesson) => lesson.type === 'quiz').length
    return lessonCount + quizCount
  }

  const pages = scenario.courseDocument?.pages
  if (Array.isArray(pages) && pages.length > 0) {
    const lessonCount = pages.filter((page) => page.type === 'lesson').length
    const quizCount = pages.filter((page) => page.type === 'quiz').length
    return lessonCount + quizCount
  }

  return scenario.modules?.length ?? 0
}

export default function ScenariosPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ScenarioFilter>('ALL')
  const [page, setPage] = useState(1)
  const [scenarioPendingRevoke, setScenarioPendingRevoke] = useState<Scenario | null>(null)
  const [scenarioPendingDelete, setScenarioPendingDelete] = useState<Scenario | null>(null)
  const [scenarioPendingEditDowngrade, setScenarioPendingEditDowngrade] = useState<
    { scenario: Scenario; href: string } | null
  >(null)
  const itemsPerPage = 9
  const qc = useQueryClient()
  const { user, isAdmin } = useAuth()
  const { t } = useTranslation()

  const statusFilters = useMemo(
    () => filterConfig.map((item) => ({ label: t(item.labelKey), value: item.value })),
    [t],
  )

  const debouncedSearch = useDebouncedValue(search, 350)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['scenarios', isAdmin ? 'admin' : 'mine', page, itemsPerPage, statusFilter, debouncedSearch],
    queryFn: () => {
      const params = buildScenarioListParams(statusFilter, debouncedSearch, page, itemsPerPage)
      return (isAdmin ? scenariosApi.getAllAdmin(params) : scenariosApi.getAll(params)).then(
        (r) => r.data,
      )
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const scenarios = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage))

  const { mutate: deleteScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.delete(id),
    onSuccess: () => {
      toast.success(t('scenarios_deleted'))
      setPage((currentPage) => Math.min(
        currentPage,
        Math.max(1, Math.ceil(Math.max(0, total - 1) / itemsPerPage)),
      ))
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: () => toast.error(t('scenarios_delete_error')),
  })

  const { mutate: duplicateScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.duplicate(id),
    onSuccess: () => {
      toast.success(t('scenarios_duplicated'))
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: () => toast.error(t('scenarios_duplicate_error')),
  })

  const { mutate: submitScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.submit(id),
    onSuccess: () => {
      toast.success(t('scenarios_submitted'))
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: () => toast.error(t('scenarios_submit_error')),
  })

  const { mutate: approveScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.approve(id),
    onSuccess: () => {
      toast.success(t('scenarios_approved'))
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  const { mutate: rejectScenario, isPending: rejectingScenario } = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      scenariosApi.reject(id, { comment }),
    onSuccess: () => {
      toast.success(t('scenarios_returned_draft'))
      setScenarioPendingRevoke(null)
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: () => toast.error(t('scenarios_revoke_error')),
  })

  const { mutate: archiveScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.archive(id),
    onSuccess: () => {
      toast.success(t('scenarios_archived'))
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: () => toast.error(t('scenarios_archive_error')),
  })

  const confirmEditDowngrade = async () => {
    const pending = scenarioPendingEditDowngrade
    if (!pending) return
    setScenarioPendingEditDowngrade(null)
    const { scenario, href } = pending

    qc.setQueriesData<PaginatedScenarios>(
      { queryKey: ['scenarios'] },
      (oldData) => {
        if (!oldData) return oldData
        return {
          ...oldData,
          items: oldData.items.map((item) =>
            item.id === scenario.id
              ? { ...item, status: 'BROUILLON', statut: 'BROUILLON' }
              : item,
          ),
        }
      },
    )

    try {
      await scenariosApi.update(scenario.id, { status: 'BROUILLON' })
      qc.invalidateQueries({ queryKey: ['scenarios'] })
      window.location.href = href
    } catch (error) {
      toast.error(t('scenarios_status_update_error'))
      console.error(error)
    }
  }

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <PageHeader
        eyebrow={t('scenarios_eyebrow')}
        title={t('scenarios_title')}
        description={t('scenarios_count_in_view', { total })}
        actions={
          <Link
            href="/dashboard/scenarios/new"
            className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[var(--lux-primary)] px-4 text-xs font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all hover:bg-[var(--lux-primary-hover)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] active:scale-[0.98]"
          >
            <Plus size={15} />
            {t('scenarios_new')}
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            placeholder={t('scenarios_search_placeholder')}
            icon={<Search size={14} />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            id="scenario-search"
          />
        </div>
        <SegmentedControl
          items={statusFilters}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
          ariaLabel={t('scenarios_title')}
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : scenarios.length === 0 ? (
        <EmptyState
          icon={<Film size={24} />}
          title={search || statusFilter !== 'ALL' ? t('scenarios_empty_filtered') : t('scenarios_empty_title')}
          description={t('scenarios_empty_desc')}
          action={
            <Link
              href="/dashboard/scenarios/new"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--lux-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--lux-primary-hover)] transition-all"
            >
              <Plus size={14} />
              {t('scenarios_new')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <div
            className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}
          >
            {scenarios.map((scenario: Scenario) => {
              const scenarioOwnerId =
                scenario.author?.id ??
                scenario.ownerId ??
                scenario.user?.id ??
                (scenario as { userId?: string | number }).userId
              const isOwner = scenarioOwnerId != null && String(scenarioOwnerId) === String(user?.id ?? '')
              const isCollaborator = Boolean(
                scenario.shares?.some((share) => {
                  const shareAny = share as unknown as {
                    user?: { id?: string | number }
                    sharedWith?: { id?: string | number }
                    sharedWithId?: string | number
                  }
                  const shareUserId = shareAny.sharedWith?.id ?? shareAny.sharedWithId ?? shareAny.user?.id
                  return String(shareUserId ?? '') === String(user?.id ?? '')
                }),
              )
              const hasEditShare = userHasScenarioEditShare(scenario.shares, user?.id)
              const scenarioStatus = String(scenario.status ?? scenario.statut ?? '').toUpperCase() as ScenarioStatus
              const isApprovedOwner = isOwner && isApprovedScenarioStatus(scenarioStatus)
              const approvedCollaboratorViewOnly = isApprovedCollaboratorViewOnly({
                isOwner,
                hasEditShare,
                status: scenarioStatus,
              })
              const canEditScenario = canUserEditScenario({
                isOwner,
                hasEditShare,
                status: scenarioStatus,
              })
              const primaryActionLabel = canEditScenario
                ? t('scenarios_edit')
                : approvedCollaboratorViewOnly || isCollaborator || !isAdmin
                  ? t('scenarios_view')
                  : t('scenarios_review')
              const primaryHref = scenarioPrimaryHref(scenario.id, {
                canEdit: canEditScenario,
                isApprovedOwner,
              })
              const ownerName = scenario.ownerName?.trim() || formatUserName(
                scenario.author,
                scenario.ownerId ? `User #${scenario.ownerId}` : 'Unknown owner',
              )
              const collaboratorNames = (scenario.shares ?? [])
                .map((share) => formatUserName(share.user, share.user?.email ?? 'Collaborator'))
                .filter(Boolean)
              const collaboratorSummary = collaboratorNames.length
                ? `${collaboratorNames.slice(0, 3).join(', ')}${collaboratorNames.length > 3 ? ` +${collaboratorNames.length - 3}` : ''}`
                : ''
              const moduleCount = getCourseModulesDisplayCount(scenario)

              return (
              <Card key={scenario.id} variant="glass" className="group flex flex-col transition-all duration-300 hover:-translate-y-1">
                <div className="p-5 flex-1 flex flex-col">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--lux-primary)]/20 bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)] group-hover:scale-105 transition-transform">
                      <Film size={18} />
                    </div>
                    <StatusBadge status={scenarioStatus} />
                  </div>

                  <h3 className="font-bold text-sm text-[var(--lux-text-strong)] mb-1.5 leading-snug group-hover:text-[var(--lux-primary-muted)] transition-colors">
                    {scenario.titre ?? scenario.title}
                  </h3>
                  {scenario.description && (
                    <p className="text-xs text-[var(--lux-muted-soft)] mb-3 leading-relaxed">
                      {truncate(scenario.description, 90)}
                    </p>
                  )}
                  <p className="text-xs font-medium text-[var(--lux-muted)] mb-2">
                    {t('scenarios_author', { name: ownerName })}
                  </p>
                  {isCollaborator && !isOwner && (
                    <span className="inline-block text-[11px] font-bold text-[var(--lux-primary-muted)] bg-[var(--lux-primary-soft)] px-2 py-0.5 rounded-md mb-2 w-max">
                      {approvedCollaboratorViewOnly ? t('scenarios_shared_view_only') : t('scenarios_collaborator_badge')}
                    </span>
                  )}
                  {collaboratorSummary && (
                    <p className="text-xs text-[var(--lux-muted-soft)] mb-3">
                      {t('scenarios_shared_with', { names: collaboratorSummary })}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-[var(--lux-line)]/50 text-xs text-[var(--lux-muted-soft)] font-medium">
                    <span>{formatDate(scenario.dateCreation ?? scenario.createdAt)}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] bg-[var(--lux-surface-soft)] px-2 py-0.5 rounded-md border border-[var(--lux-line)]/70">
                      <Layers size={11} className="text-[var(--lux-primary-muted)]" />
                      {moduleCount === 1 ? t('scenarios_modules', { n: moduleCount }) : t('scenarios_modules_plural', { n: moduleCount })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 border-t border-[var(--lux-line)]/70 bg-[var(--lux-surface-soft)]/50 px-4 py-2.5">
                  <Link
                    href={primaryHref}
                    className="inline-flex h-8.5 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--lux-primary-soft)] px-3 text-xs font-bold text-[var(--lux-primary-muted)] transition-all hover:bg-[var(--lux-primary)] hover:text-white"
                    onClick={(event) => {
                      if (!isApprovedOwner) return
                      event.preventDefault()
                      setScenarioPendingEditDowngrade({ scenario, href: primaryHref })
                    }}
                  >
                    {canEditScenario ? <Edit2 size={13} /> : <Eye size={13} />}
                    {primaryActionLabel}
                  </Link>
                  {isApprovedOwner && (
                    <Link
                      href={scenarioViewHref(scenario.id)}
                      className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-[var(--lux-line)] px-2.5 text-xs font-semibold text-[var(--lux-muted)] transition-colors hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]"
                    >
                      <Eye size={13} />
                      {t('scenarios_view')}
                    </Link>
                  )}
                  {canEditScenario && (
                    <button
                      type="button"
                      onClick={() => duplicateScenario(scenario.id)}
                      title={t('scenarios_tooltip_duplicate')}
                      className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                  {canEditScenario && scenarioStatus === 'BROUILLON' && (
                    <button
                      type="button"
                      onClick={() => submitScenario(scenario.id)}
                      title={t('scenarios_tooltip_submit')}
                      className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)]"
                    >
                      <Send size={14} />
                    </button>
                  )}
                  {isAdmin && !isCollaborator && scenarioStatus === 'EN_COURS_VALIDATION' && (
                    <>
                      <button
                        type="button"
                        onClick={() => approveScenario(scenario.id)}
                        title={t('scenarios_tooltip_approve')}
                        className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)]"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setScenarioPendingRevoke(scenario)}
                        title={t('scenarios_tooltip_reject')}
                        className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-red-500/12 hover:text-red-400"
                      >
                        <XCircle size={14} />
                      </button>
                    </>
                  )}
                  {canEditScenario && scenarioStatus !== 'ARCHIVE' && (
                    <button
                      type="button"
                      onClick={() => archiveScenario(scenario.id)}
                      title={t('scenarios_tooltip_archive')}
                      className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-gold-soft)] hover:text-[var(--lux-gold)]"
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  {canEditScenario && (
                    <button
                      type="button"
                      onClick={() => setScenarioPendingDelete(scenario)}
                      title={t('scenarios_tooltip_delete')}
                      className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-red-500/12 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </Card>
              )
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
              >
                {t('scenarios_prev')}
              </Button>
              <span className="text-xs font-bold text-[var(--lux-muted)]">
                {t('scenarios_page_of', { page, total: totalPages })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || isFetching}
              >
                {t('scenarios_next')}
              </Button>
            </div>
          )}
        </div>
      )}

      {scenarioPendingRevoke && (
        <RevokeScenarioDialog
          open
          loading={rejectingScenario}
          courseTitle={scenarioPendingRevoke.title ?? scenarioPendingRevoke.titre}
          onClose={() => setScenarioPendingRevoke(null)}
          onConfirm={(comment) => {
            rejectScenario({ id: scenarioPendingRevoke.id, comment })
          }}
        />
      )}

      <ConfirmDialog
        open={scenarioPendingEditDowngrade !== null}
        title={t('scenarios_move_draft_title')}
        description={t('scenarios_move_draft_desc')}
        confirmLabel={t('scenarios_move_draft_confirm')}
        variant="warning"
        onConfirm={() => void confirmEditDowngrade()}
        onCancel={() => setScenarioPendingEditDowngrade(null)}
      />

      <ConfirmDialog
        open={scenarioPendingDelete !== null}
        title={
          scenarioPendingDelete
            ? `${t('scenarios_delete_confirm')} "${scenarioPendingDelete.title ?? scenarioPendingDelete.titre}"?`
            : ''
        }
        description={t('scenarios_delete_desc')}
        confirmLabel={t('scenarios_delete_confirm')}
        onConfirm={() => {
          if (scenarioPendingDelete) deleteScenario(scenarioPendingDelete.id)
          setScenarioPendingDelete(null)
        }}
        onCancel={() => setScenarioPendingDelete(null)}
      />
    </div>
  )
}
