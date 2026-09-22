import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { CourseDocument, CourseLesson } from '@/types'
import {
  authorNameFrom,
  createLesson,
  getScormSettings,
  setLessonKind,
  syncCourseDocument,
} from '../courseEditorModel'
import type { EditorViewState } from '../shared/editorTypes'
import type { useCourseSave } from './useCourseSave'

interface UseDocumentActionsOptions {
  readOnly: boolean
  lockedByOther: boolean
  document: CourseDocument
  setDocument: Dispatch<SetStateAction<CourseDocument>>
  view: EditorViewState
  setView: Dispatch<SetStateAction<EditorViewState>>
  titleDraft: string
  setTitleError: Dispatch<SetStateAction<string>>
  setTitleCommitted: Dispatch<SetStateAction<boolean>>
  titleInputRef: RefObject<HTMLInputElement | null>
  createScenarioMutation: ReturnType<typeof useCourseSave>['createScenarioMutation']
  persistedScenarioId: string | undefined
  authorName: ReturnType<typeof authorNameFrom>
}

export function useDocumentActions({
  readOnly,
  lockedByOther,
  document,
  setDocument,
  view,
  setView,
  titleDraft,
  setTitleError,
  setTitleCommitted,
  titleInputRef,
  createScenarioMutation,
  persistedScenarioId,
  authorName,
}: UseDocumentActionsOptions) {
  const updateDocument = useCallback((updater: (current: CourseDocument) => CourseDocument) => {
    if (readOnly || lockedByOther) return
    setDocument((current) => syncCourseDocument(updater(current)))
  }, [lockedByOther, readOnly, setDocument])

  const updatePreviewDocument = useCallback((updater: (current: CourseDocument) => CourseDocument) => {
    setDocument((current) => syncCourseDocument(updater(current)))
  }, [setDocument])

  const commitCourseTitle = useCallback(() => {
    if (readOnly || createScenarioMutation.isPending) return
    const nextTitle = titleDraft.trim()
    if (!nextTitle) {
      setTitleError('A course title is required.')
      titleInputRef.current?.focus()
      return
    }

    setTitleError('')
    const nextDocument = syncCourseDocument({
      ...document,
      title: nextTitle,
      metadata: {
        ...document.metadata,
        authorName: document.metadata?.authorName || authorName,
        scorm: {
          ...getScormSettings(document),
          lmsTitle: nextTitle,
        },
      },
    })

    setDocument(nextDocument)
    setTitleCommitted(true)

    if (!persistedScenarioId) {
      createScenarioMutation.mutate(nextDocument)
    }
  }, [
    authorName,
    createScenarioMutation,
    document,
    persistedScenarioId,
    readOnly,
    setDocument,
    setTitleCommitted,
    setTitleError,
    titleDraft,
    titleInputRef,
  ])

  const addLesson = useCallback((title: string, sectionId: string, type: CourseLesson['type'] = 'lesson') => {
    const nextTitle = title.trim()
    if (!nextTitle) return null
    const lesson = type === 'quiz'
      ? setLessonKind(createLesson(nextTitle), 'quiz')
      : createLesson(nextTitle)
    updateDocument((current) => {
      const sections = (current.sections ?? []).map((section) =>
        section.id === sectionId
          ? { ...section, lessonIds: [...section.lessonIds, lesson.id] }
          : section,
      )
      return {
        ...current,
        lessons: [...(current.lessons ?? []), lesson],
        sections,
      }
    })
    return lesson.id
  }, [updateDocument])

  const updateLesson = useCallback((lessonId: string, updater: (lesson: CourseLesson) => CourseLesson) => {
    updateDocument((current) => ({
      ...current,
      lessons: (current.lessons ?? []).map((lesson) =>
        lesson.id === lessonId ? updater(lesson) : lesson,
      ),
    }))
  }, [updateDocument])

  const removeLesson = useCallback((lessonId: string) => {
    updateDocument((current) => ({
      ...current,
      lessons: (current.lessons ?? []).filter((lesson) => lesson.id !== lessonId),
    }))
    if (view.type === 'lesson' && view.lessonId === lessonId) {
      setView({ type: 'structure' })
    }
  }, [setView, updateDocument, view])

  return {
    updateDocument,
    updatePreviewDocument,
    commitCourseTitle,
    addLesson,
    updateLesson,
    removeLesson,
  }
}
