import { useState, type ReactNode, type RefObject } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import type { CourseDocument, CourseLesson } from '@/types'
import {
  duplicateLesson,
  getCourseEstimatedMinutes,
  uid,
  type CourseReadiness,
} from '../courseEditorModel'
import { AddLessonInput } from './AddLessonInput'
import { CourseHeader } from './CourseHeader'
import { CourseReadinessPanel } from './CourseReadinessPanel'
import { CourseSetupPanel } from './CourseSetupPanel'
import { LessonStructureItem } from './LessonStructureItem'
import { ScormPanel } from './ScormPanel'
import { TitleBackgroundImageControl } from './TitleBackgroundImageControl'
import { updateCourseTheme } from '../shared/courseTheme'
import { inputClass } from '../shared/editorStyles'
import { uploadedAssetUrl } from '../shared/mediaHelpers'
import { InlineText, IconButton } from '../shared/uiPrimitives'

export function StructurePage({
  document,
  authorName,
  lessonInputRef,
  settingsOpen,
  scenarioId,
  readOnly,
  readiness,
  onUpdateDocument,
  onEditTitle,
  onAddLesson,
  onUpdateLesson,
  onRemoveLesson,
  onOpenLesson,
  onOpenCourseSettings,
  onSaveBeforeExport,
  reviewActions,
}: {
  document: CourseDocument
  authorName: string
  lessonInputRef: RefObject<HTMLInputElement | null>
  settingsOpen: boolean
  scenarioId?: string
  readOnly: boolean
  readiness: CourseReadiness
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
  onEditTitle: () => void
  onAddLesson: (title: string, sectionId: string, type?: CourseLesson['type']) => string | null
  onUpdateLesson: (lessonId: string, updater: (lesson: CourseLesson) => CourseLesson) => void
  onRemoveLesson: (lessonId: string) => void
  onOpenLesson: (lessonId: string) => void
  onOpenCourseSettings: () => void
  onSaveBeforeExport: () => Promise<boolean>
  reviewActions?: ReactNode
}) {
  const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    { type: 'section'; id: string; title: string } | { type: 'lesson'; id: string; title: string } | null
  >(null)
  const lessons = document.lessons ?? []
  const sections = document.sections ?? []
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
  const courseTitleBackgroundUrl = document.theme?.coverImageUrl ? uploadedAssetUrl(document.theme.coverImageUrl) : ''

  const reorderLesson = (targetSectionId: string, targetLessonId?: string) => {
    if (readOnly) return
    if (!draggedLessonId || draggedLessonId === targetLessonId) return
    onUpdateDocument((current) => {
      const nextSections = (current.sections ?? []).map((section) => ({
        ...section,
        lessonIds: section.lessonIds.filter((lessonId) => lessonId !== draggedLessonId),
      }))
      const targetSection = nextSections.find((section) => section.id === targetSectionId)
      if (!targetSection) return current
      const targetIndex = targetLessonId
        ? targetSection.lessonIds.indexOf(targetLessonId)
        : targetSection.lessonIds.length
      targetSection.lessonIds.splice(
        targetIndex < 0 ? targetSection.lessonIds.length : targetIndex,
        0,
        draggedLessonId,
      )
      return { ...current, sections: nextSections }
    })
    setDraggedLessonId(null)
  }

  const addSection = () => {
    onUpdateDocument((current) => ({
      ...current,
      sections: [
        ...(current.sections ?? []),
        { id: uid('section'), title: `Section ${(current.sections?.length ?? 0) + 1}`, lessonIds: [] },
      ],
    }))
  }

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    onUpdateDocument((current) => {
      const nextSections = [...(current.sections ?? [])]
      const index = nextSections.findIndex((section) => section.id === sectionId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= nextSections.length) return current
      const [section] = nextSections.splice(index, 1)
      nextSections.splice(nextIndex, 0, section)
      return { ...current, sections: nextSections }
    })
  }

  const removeSection = (sectionId: string) => {
    if (sections.length <= 1) return
    const section = sections.find((item) => item.id === sectionId)
    if (!section) return

    onUpdateDocument((current) => {
      const currentSections = current.sections ?? []
      const removedIndex = currentSections.findIndex((item) => item.id === sectionId)
      const targetIndex = removedIndex === 0 ? 1 : removedIndex - 1
      const targetId = currentSections[targetIndex]?.id
      return {
        ...current,
        sections: currentSections
          .filter((item) => item.id !== sectionId)
          .map((item) =>
            item.id === targetId
              ? { ...item, lessonIds: [...item.lessonIds, ...section.lessonIds] }
              : item,
          ),
      }
    })
  }

  const confirmPendingDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.type === 'section') {
      removeSection(pendingDelete.id)
    } else {
      onRemoveLesson(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  const duplicateCourseLesson = (lesson: CourseLesson, sectionId: string) => {
    const copy = duplicateLesson(lesson)
    onUpdateDocument((current) => ({
      ...current,
      lessons: [...(current.lessons ?? []), copy],
      sections: (current.sections ?? []).map((section) => {
        if (section.id !== sectionId) return section
        const lessonIndex = section.lessonIds.indexOf(lesson.id)
        const lessonIds = [...section.lessonIds]
        lessonIds.splice(lessonIndex < 0 ? lessonIds.length : lessonIndex + 1, 0, copy.id)
        return { ...section, lessonIds }
      }),
    }))
  }

  return (
    <div className="mx-auto w-full max-w-[952px] pb-10">
      {settingsOpen && (
        <div className="fade-up pt-6 sm:pt-8">
          <CourseSetupPanel
            document={document}
            readOnly={readOnly}
            onUpdateDocument={onUpdateDocument}
          />
          <ScormPanel
            document={document}
            scenarioId={scenarioId}
            readOnly={readOnly}
            readiness={readiness}
            onUpdateDocument={onUpdateDocument}
            onSaveBeforeExport={onSaveBeforeExport}
          />
        </div>
      )}

      <section className="fade-up pt-6 sm:pt-8">
        <CourseHeader
          document={document}
          authorName={authorName}
          readOnly={readOnly}
          courseTitleBackgroundUrl={courseTitleBackgroundUrl}
          onEditTitle={onEditTitle}
          onUpdateDocument={onUpdateDocument}
        />
        {!readOnly && (
          <TitleBackgroundImageControl
            label="Course title background"
            value={document.theme?.coverImageUrl ?? ''}
            onChange={(coverImageUrl) => onUpdateDocument((current) => updateCourseTheme(current, { coverImageUrl }))}
          />
        )}
      </section>

      <CourseReadinessPanel
        readiness={readiness}
        lessonCount={lessons.length}
        estimatedMinutes={getCourseEstimatedMinutes(document)}
        onOpenLesson={onOpenLesson}
        onOpenCourseSettings={onOpenCourseSettings}
      />

      <section className="mt-6 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
              Learning objectives
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--lux-text-strong)]">
              What should learners be able to do?
            </h2>
          </div>
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={onOpenCourseSettings}>
              Edit in course settings
            </Button>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {(document.objectives ?? []).length === 0 && (
            <p className="text-sm text-[var(--lux-muted)]">
              Add one or more measurable learning objectives for this course.
            </p>
          )}
          {(document.objectives ?? []).map((objective, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={objective}
                onChange={(event) => {
                  const value = event.target.value
                  onUpdateDocument((current) => {
                    const next = [...(current.objectives ?? [])]
                    next[index] = value
                    return { ...current, objectives: next }
                  })
                }}
                placeholder={`Objective ${index + 1}`}
                className={cn(inputClass, 'min-w-0 flex-1')}
                disabled={readOnly}
              />
              {!readOnly && (
                <IconButton
                  label={`Remove objective ${index + 1}`}
                  onClick={() =>
                    onUpdateDocument((current) => ({
                      ...current,
                      objectives: (current.objectives ?? []).filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onUpdateDocument((current) => ({ ...current, objectives: [...(current.objectives ?? []), ''] }))}
            >
              Add objective
            </Button>
          )}
        </div>
      </section>

      <section className="mt-14 sm:mt-16">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--lux-line)] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">Curriculum</p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--lux-text-strong)]">Course structure</h2>
          </div>
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={addSection}>
              <Plus size={15} />
              Add section
            </Button>
          )}
        </div>

        <div>
          {sections.map((section, sectionIndex) => {
            const sectionLessons = section.lessonIds
              .map((lessonId) => lessonsById.get(lessonId))
              .filter((lesson): lesson is CourseLesson => Boolean(lesson))

            return (
              <section key={section.id} className="border-b border-[var(--lux-line)] py-8">
                <header className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">
                    Section {sectionIndex + 1}
                  </span>
                  <InlineText
                    value={section.title}
                    className="min-w-0 flex-1 text-lg font-bold text-[var(--lux-text-strong)]"
                    readOnly={readOnly}
                    onCommit={(title) =>
                      title.trim() &&
                      onUpdateDocument((current) => ({
                        ...current,
                        sections: (current.sections ?? []).map((item) =>
                          item.id === section.id ? { ...item, title: title.trim() } : item,
                        ),
                      }))
                    }
                  />
                  <span className="text-xs text-[var(--lux-muted)]">
                    {sectionLessons.length} {sectionLessons.length === 1 ? 'item' : 'items'}
                  </span>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <IconButton label="Move section up" disabled={sectionIndex === 0} onClick={() => moveSection(section.id, -1)}>
                        <ChevronUp size={16} />
                      </IconButton>
                      <IconButton label="Move section down" disabled={sectionIndex === sections.length - 1} onClick={() => moveSection(section.id, 1)}>
                        <ChevronDown size={16} />
                      </IconButton>
                      <IconButton
                        label="Delete section"
                        disabled={sections.length <= 1}
                        onClick={() => setPendingDelete({ type: 'section', id: section.id, title: section.title })}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  )}
                </header>

                <div
                  className="divide-y divide-[var(--lux-line)]"
                  onDragOver={(event) => !readOnly && event.preventDefault()}
                  onDrop={() => sectionLessons.length === 0 && reorderLesson(section.id)}
                >
                  {sectionLessons.map((lesson) => (
                    <LessonStructureItem
                      key={lesson.id}
                      lesson={lesson}
                      draggable={!readOnly}
                      onDragStart={() => setDraggedLessonId(lesson.id)}
                      onDragEnd={() => setDraggedLessonId(null)}
                      onDragOver={(event) => !readOnly && event.preventDefault()}
                      onDrop={() => reorderLesson(section.id, lesson.id)}
                      readOnly={readOnly}
                      onUpdate={(updater) => onUpdateLesson(lesson.id, updater)}
                      onDuplicate={() => duplicateCourseLesson(lesson, section.id)}
                      onRemove={() => setPendingDelete({ type: 'lesson', id: lesson.id, title: lesson.title })}
                      onOpen={() => onOpenLesson(lesson.id)}
                    />
                  ))}
                  {!sectionLessons.length && (
                    <div className="py-5 text-sm text-[var(--lux-muted)]">
                      Drop a lesson here or add the first item below.
                    </div>
                  )}
                  {!readOnly && (
                    <AddLessonInput
                      inputRef={sectionIndex === sections.length - 1 ? lessonInputRef : undefined}
                      sectionId={section.id}
                      defaultLessonType="lesson"
                      onAddLesson={onAddLesson}
                      onOpenLesson={onOpenLesson}
                    />
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      {reviewActions && (
        <section className="mt-10">
          {reviewActions}
        </section>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.title}"?` : ''}
        description={
          pendingDelete?.type === 'section'
            ? 'Its lessons will be moved to another section.'
            : 'This cannot be undone.'
        }
        confirmLabel="Delete"
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
