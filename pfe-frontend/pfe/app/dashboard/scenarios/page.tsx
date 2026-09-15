'use client'

import { useState } from 'react'
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
import {
  canUserEditScenario,
  isApprovedCollaboratorViewOnly,
  isApprovedScenarioStatus,
  scenarioPrimaryHref,
  scenarioViewHref,
  userHasScenarioEditShare,
} from '@/lib/scenarioActions'
import type { Scenario, ScenarioStatus } from '@/types'

type ScenarioFilter = ScenarioStatus | 'ALL' | 'MY'

const statusFilters: { label: string; value: ScenarioFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'My', value: 'MY' },
  { label: 'Draft', value: 'BROUILLON' },
  { label: 'Review', value: 'EN_COURS_VALIDATION' },
  { label: 'Approved', value: 'APPROUVE' },
  { label: 'Archived', value: 'ARCHIVE' },
]

/**
 * Maps the segmented-control filter + search box onto the server-side list
 * params. "Approved" spans both APPROUVE and EXPORTE (see
 * isApprovedScenarioStatus) so it has to go through `statuses`, not `status`.
 */
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

  // Debounced so typing doesn't fire a request per keystroke — the page
  // number still resets immediately (below) for a responsive-feeling UI.
  const debouncedSearch = useDebouncedValue(search, 350)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['scenarios', isAdmin ? 'admin' : 'mine', page, itemsPerPage, statusFilter, debouncedSearch],
    queryFn: () => {
      const params = buildScenarioListParams(statusFilter, debouncedSearch, page, itemsPerPage)
      return (isAdmin ? scenariosApi.getAllAdmin(params) : scenariosApi.getAll(params)).then(
        (r) => r.data,
      )
    },
    // Keeps showing the previous page's rows (instead of a full-page spinner)
    // while the next page/filter/search request is in flight.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const { mutate: deleteScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.delete(id),
    onSuccess: () => {
      toast.success('Scenario deleted')
      setPage((currentPage) => Math.min(
        currentPage,
        Math.max(1, Math.ceil(Math.max(0, total - 1) / itemsPerPage)),
      ))
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: () => toast.error('Failed to delete scenario'),
  })

  const { mutate: duplicateScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.duplicate(id),
    onSuccess: () => {
      toast.success('Scenario duplicated')
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  const { mutate: submitScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.submit(id),
    onSuccess: () => {
      toast.success('Scenario submitted for review')
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  const { mutate: approveScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.approve(id),
    onSuccess: () => {
      toast.success('Scenario approved')
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  const { mutate: rejectScenario, isPending: rejectingScenario } = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      scenariosApi.reject(id, { comment }),
    onSuccess: () => {
      toast.success('Scenario returned to draft')
      setScenarioPendingRevoke(null)
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  const { mutate: archiveScenario } = useMutation({
    mutationFn: (id: string) => scenariosApi.archive(id),
    onSuccess: () => {
      toast.success('Scenario archived')
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })

  const scenarios = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage))

  const confirmEditDowngrade = async () => {
    const pending = scenarioPendingEditDowngrade
    if (!pending) return
    setScenarioPendingEditDowngrade(null)
    const { scenario, href } = pending

    // Matches by queryKey prefix (['scenarios', ...]) rather than a single
    // exact key, since the key now also carries page/limit/filter/search —
    // this way the optimistic edit lands on whichever page/filter is
    // currently cached instead of silently no-op'ing.
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
      toast.error('Failed to update scenario status')
      console.error(error)
    }
  }

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <PageHeader
        eyebrow="Authoring Suite"
        title="Scenarios"
        description={`${total} scenario${total !== 1 ? 's' : ''} in the current view`}
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

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            placeholder="Search scenarios..."
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
          ariaLabel="Filter scenarios by status"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : scenarios.length === 0 ? (
        <EmptyState
          icon={<Film size={24} />}
          title="No scenarios found"
          description="Create your first scenario to get started"
          action={
            <Link
              href="/dashboard/scenarios/new"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--lux-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--lux-primary-hover)] transition-all"
            >
              <Plus size={14} />
              New scenario
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <div
            className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}
          >
            {scenarios.map((scenario: Scenario) => {
              const scenarioOwnerId = scenario.author?.id ?? scenario.ownerId
              const isOwner = String(scenarioOwnerId ?? '') === String(user?.id ?? '')
              const isCollaborator = Boolean(
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
                : approvedCollaboratorViewOnly || isCollaborator || !isAdmin
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
                    <StatusBadge status={scenario.status} />
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
                    Author: <span className="text-[var(--lux-text-strong)]">{ownerName}</span>
                  </p>
                  {isCollaborator && !isOwner && (
                    <span className="inline-block text-[11px] font-bold text-[var(--lux-primary-muted)] bg-[var(--lux-primary-soft)] px-2 py-0.5 rounded-md mb-2 w-max">
                      {approvedCollaboratorViewOnly ? 'Shared with you (View Only)' : 'Collaborator'}
                    </span>
                  )}
                  {collaboratorSummary && (
                    <p className="text-xs text-[var(--lux-muted-soft)] mb-3">
                      Shared with: {collaboratorSummary}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-[var(--lux-line)]/50 text-xs text-[var(--lux-muted-soft)] font-medium">
                    <span>{formatDate(scenario.dateCreation ?? scenario.createdAt)}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] bg-[var(--lux-surface-soft)] px-2 py-0.5 rounded-md border border-[var(--lux-line)]/70">
                      <Layers size={11} className="text-[var(--lux-primary-muted)]" />
                      {moduleCount} module{moduleCount !== 1 ? 's' : ''}
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
                      View
                    </Link>
                  )}
                  {canEditScenario && (
                    <button
                      type="button"
                      onClick={() => duplicateScenario(scenario.id)}
                      title="Duplicate"
                      className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                  {canEditScenario && scenario.status === 'BROUILLON' && (
                    <button
                      type="button"
                      onClick={() => submitScenario(scenario.id)}
                      title="Submit for review"
                      className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)]"
                    >
                      <Send size={14} />
                    </button>
                  )}
                  {isAdmin && !isCollaborator && scenario.status === 'EN_COURS_VALIDATION' && (
                    <>
                      <button
                        type="button"
                        onClick={() => approveScenario(scenario.id)}
                        title="Approve"
                        className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)]"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setScenarioPendingRevoke(scenario)}
                        title="Reject"
                        className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-red-500/12 hover:text-red-400"
                      >
                        <XCircle size={14} />
                      </button>
                    </>
                  )}
                  {canEditScenario && scenario.status !== 'ARCHIVE' && (
                    <button
                      type="button"
                      onClick={() => archiveScenario(scenario.id)}
                      title="Archive"
                      className="grid h-8.5 w-8.5 place-items-center rounded-lg text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-gold-soft)] hover:text-[var(--lux-gold)]"
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  {canEditScenario && (
                    <button
                      type="button"
                      onClick={() => setScenarioPendingDelete(scenario)}
                      title="Delete"
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
                Previous
              </Button>
              <span className="text-xs font-bold text-[var(--lux-muted)]">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || isFetching}
              >
                Next
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
        title="Move back to draft?"
        description="Editing this approved scenario will move it back to draft status."
        confirmLabel="Continue"
        variant="warning"
        onConfirm={() => void confirmEditDowngrade()}
        onCancel={() => setScenarioPendingEditDowngrade(null)}
      />

      <ConfirmDialog
        open={scenarioPendingDelete !== null}
        title={
          scenarioPendingDelete
            ? `Delete "${scenarioPendingDelete.title ?? scenarioPendingDelete.titre}"?`
            : ''
        }
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (scenarioPendingDelete) deleteScenario(scenarioPendingDelete.id)
          setScenarioPendingDelete(null)
        }}
        onCancel={() => setScenarioPendingDelete(null)}
      />
    </div>
  )
}
