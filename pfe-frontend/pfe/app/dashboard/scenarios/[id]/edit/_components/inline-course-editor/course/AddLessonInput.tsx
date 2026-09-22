import { useState, type RefObject } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { CourseLesson } from '@/types'
import { inputClass } from '../shared/editorStyles'

export function AddLessonInput({
  inputRef,
  sectionId,
  defaultLessonType,
  onAddLesson,
  onOpenLesson,
}: {
  inputRef?: RefObject<HTMLInputElement | null>
  sectionId: string
  defaultLessonType: CourseLesson['type']
  onAddLesson: (title: string, sectionId: string, type?: CourseLesson['type']) => string | null
  onOpenLesson: (lessonId: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [lessonType, setLessonType] = useState<CourseLesson['type']>(defaultLessonType)

  // Follow the default when the parent changes it (adjusting state during render,
  // rather than in an effect, avoids an extra render pass).
  const [lastDefaultLessonType, setLastDefaultLessonType] = useState(defaultLessonType)
  if (lastDefaultLessonType !== defaultLessonType) {
    setLastDefaultLessonType(defaultLessonType)
    setLessonType(defaultLessonType)
  }

  const commit = () => {
    if (!draft.trim()) {
      setError('Please enter a lesson title.')
      inputRef?.current?.focus()
      return
    }
    const lessonId = onAddLesson(draft, sectionId, lessonType)
    if (lessonId) {
      setDraft('')
      setError('')
      onOpenLesson(lessonId)
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">Add course item</p>
        <div className="flex rounded-md bg-[var(--lux-overlay)] p-0.5 text-xs font-semibold">
          {(['lesson', 'quiz'] as const).map((type) => (
            <button key={type} type="button" onClick={() => setLessonType(type)} className={cn('rounded px-2.5 py-1.5 capitalize', lessonType === type && 'bg-[var(--lux-surface)] text-[var(--lux-text)] shadow-sm')}>
              {type === 'quiz' ? 'Quiz' : 'Lesson'}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setError('') }}
          onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
          placeholder={lessonType === 'quiz' ? 'e.g. Module 1 knowledge check' : 'e.g. Understanding the core concept'}
          className={cn(inputClass, 'min-w-0 flex-1')}
        />
        <Button size="sm" onClick={commit} disabled={!draft.trim()}>
          <Plus size={15} />
          <span className="hidden sm:inline">Add & edit</span>
        </Button>
      </div>
      <p className="mt-2 text-xs text-[var(--lux-muted)]">Choose an item type, name it, then continue directly into the editor.</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
