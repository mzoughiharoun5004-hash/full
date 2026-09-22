import type { CourseLesson } from '@/types'
import { PercentageInput } from '../course/PercentageInput'
import { inputClass, selectClass } from '../shared/editorStyles'
import { Field } from '../shared/uiPrimitives'

export function QuizSettingsPanel({
  lesson,
  onUpdateLesson,
}: {
  lesson: CourseLesson
  onUpdateLesson: (updater: (lesson: CourseLesson) => CourseLesson) => void
}) {
  const quiz = lesson.quiz ?? { passingScore: 80, attempts: 1, showFeedback: true, randomizeQuestions: false, randomizeAnswers: false, questions: [] }
  const updateQuiz = (patch: Partial<typeof quiz>) => onUpdateLesson((current) => ({ ...current, quiz: { ...quiz, ...patch } }))

  return (
    <section className="mt-5 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
      <h2 className="text-sm font-semibold uppercase text-[var(--lux-muted-soft)]">Quiz Settings</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Passing score (%)">
          <PercentageInput value={quiz.passingScore} onCommit={(passingScore) => updateQuiz({ passingScore })} />
        </Field>
        <Field label="Question order">
          <select value={quiz.randomizeQuestions ? 'randomized' : 'fixed'} onChange={(e) => updateQuiz({ randomizeQuestions: e.target.value === 'randomized' })} className={selectClass}>
            <option value="fixed">Fixed</option>
            <option value="randomized">Randomized</option>
          </select>
        </Field>
        <Field label="Show feedback">
          <select value={String(lesson.metadata?.feedbackTiming ?? 'immediate')} onChange={(e) => onUpdateLesson((current) => ({ ...current, metadata: { ...current.metadata, feedbackTiming: e.target.value } }))} className={selectClass}>
            <option value="immediate">Immediately after each answer</option>
            <option value="end">At end of quiz</option>
            <option value="never">Never</option>
          </select>
        </Field>
        <Field label="Allow retry">
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <select value={quiz.attempts && quiz.attempts > 1 ? 'max' : quiz.attempts === 0 ? 'no' : 'yes'} onChange={(e) => updateQuiz({ attempts: e.target.value === 'no' ? 0 : e.target.value === 'yes' ? 1 : 3 })} className={selectClass}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="max">Max attempts</option>
            </select>
            <input type="number" min={0} value={quiz.attempts ?? 1} onChange={(e) => updateQuiz({ attempts: Number(e.target.value) })} className={inputClass} />
          </div>
        </Field>
        <Field label="Time limit">
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <select value={quiz.timeLimitMinutes ? 'minutes' : 'none'} onChange={(e) => updateQuiz({ timeLimitMinutes: e.target.value === 'none' ? undefined : 10 })} className={selectClass}>
              <option value="none">None</option>
              <option value="minutes">Minutes</option>
            </select>
            <input type="number" value={quiz.timeLimitMinutes ?? ''} onChange={(e) => updateQuiz({ timeLimitMinutes: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} />
          </div>
        </Field>
      </div>
    </section>
  )
}
