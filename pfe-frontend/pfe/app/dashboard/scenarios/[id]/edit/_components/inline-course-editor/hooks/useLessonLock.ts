import { useEffect } from 'react'
import type { useAuth } from '@/context/AuthContext'
import { lessonLockId } from '../collaboration/collaborationHelpers'
import type { EditorViewState, ScenarioRoom } from '../shared/editorTypes'

interface UseLessonLockOptions {
  view: EditorViewState
  readOnly: boolean
  persistedScenarioId: string | undefined
  user: ReturnType<typeof useAuth>['user']
  locks: ScenarioRoom['locks']
  lockElement: ScenarioRoom['lockElement']
  unlockElement: ScenarioRoom['unlockElement']
}

export function useLessonLock({
  view,
  readOnly,
  persistedScenarioId,
  user,
  locks,
  lockElement,
  unlockElement,
}: UseLessonLockOptions) {
  const currentLock = view.type === 'lesson'
    ? locks.find((lock) => lock.elementId === lessonLockId(view.lessonId))
    : undefined
  const lockedByOther = Boolean(currentLock && String(currentLock.user.id) !== String(user?.id ?? ''))

  useEffect(() => {
    if (readOnly || !persistedScenarioId || view.type !== 'lesson') return
    const elementId = lessonLockId(view.lessonId)

    lockElement({ scenarioId: persistedScenarioId, elementId, elementType: 'lesson' })
    return () => {
      unlockElement({ scenarioId: persistedScenarioId, elementId, elementType: 'lesson' })
    }
  }, [lockElement, persistedScenarioId, readOnly, unlockElement, view])

  return { currentLock, lockedByOther }
}
