import type { MouseEvent } from 'react'
import type { ScenarioShare, ScenarioStatus } from '@/types'

export const approvedOwnerEditMessage =
  'This course is approved. Editing it will move it back to Draft so your changes can be reviewed again. Continue?'

export const approvedCollaboratorViewOnlyMessage =
  'This course is approved. You have view-only access as a collaborator.'

export function isApprovedScenarioStatus(status?: ScenarioStatus | string | null) {
  return status === 'APPROUVE' || status === 'EXPORTE'
}

export function userHasScenarioEditShare(
  shares: ScenarioShare[] | undefined,
  userId?: string | number | null,
): boolean {
  return Boolean(
    shares?.some(
      (share) =>
        String(share.user?.id ?? '') === String(userId ?? '') &&
        (share.permission === 'EDIT' || share.canEditContent || share.canEditStructure),
    ),
  )
}

/** Owners keep edit rights (with re-validation). Collaborators lose edit once approved. */
export function canUserEditScenario(options: {
  isOwner: boolean
  hasEditShare: boolean
  status?: ScenarioStatus | string | null
}): boolean {
  if (options.isOwner) return true
  if (!options.hasEditShare) return false
  return !isApprovedScenarioStatus(options.status)
}

export function isApprovedCollaboratorViewOnly(options: {
  isOwner: boolean
  hasEditShare: boolean
  status?: ScenarioStatus | string | null
}): boolean {
  return (
    !options.isOwner &&
    options.hasEditShare &&
    isApprovedScenarioStatus(options.status)
  )
}

export function scenarioPrimaryHref(
  id: string,
  options: {
    canEdit: boolean
    isApprovedOwner: boolean
  },
): string {
  if (options.canEdit || options.isApprovedOwner) {
    return scenarioEditHref(id)
  }
  return scenarioViewHref(id)
}

export function confirmApprovedOwnerEdit(event: MouseEvent<HTMLElement>) {
  if (!window.confirm(approvedOwnerEditMessage)) {
    event.preventDefault()
  }
}

export function scenarioEditHref(id: string) {
  return `/dashboard/scenarios/${id}/edit`
}

export function scenarioViewHref(id: string) {
  return `/dashboard/scenarios/${id}/edit?mode=view`
}
