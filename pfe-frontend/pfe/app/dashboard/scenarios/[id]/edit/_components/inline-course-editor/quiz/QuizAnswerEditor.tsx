import { Plus, Trash2 } from 'lucide-react'
import type { CourseQuizQuestion, CourseQuizQuestionOption } from '@/types'
import type { CanonicalQuizQuestionType } from '../courseEditorModel'
import { inputClass } from '../shared/editorStyles'

export function QuizAnswerEditor({
  question,
  type,
  readOnly,
  onUpdateOption,
  onMarkChoiceCorrect,
  onAddOption,
  onRemoveOption,
}: {
  question: CourseQuizQuestion
  type: CanonicalQuizQuestionType
  readOnly: boolean
  onUpdateOption: (optionId: string, patch: Partial<CourseQuizQuestionOption>) => void
  onMarkChoiceCorrect: (optionId: string, checked: boolean) => void
  onAddOption: () => void
  onRemoveOption: (optionId: string) => void
}) {
  const addLabel = type === 'matching' ? 'Add pair' : type === 'fill_blank' ? 'Add answer' : 'Add choice'

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
          {type === 'matching' ? 'Pairs' : type === 'fill_blank' ? 'Accepted answers' : 'Choices'}
        </p>
        {!readOnly && (
          <button type="button" onClick={onAddOption} className="inline-flex items-center gap-1 rounded-md border border-[var(--lux-line)] px-3 py-2 text-xs font-bold text-[var(--lux-text)] hover:bg-[var(--lux-overlay-hover)]">
            <Plus size={14} />
            {addLabel}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {question.options.map((option, index) => {
          if (type === 'matching') {
            return (
              <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_34px]">
                <input value={option.text} onChange={(event) => onUpdateOption(option.id, { text: event.target.value })} className={inputClass} placeholder={`Prompt ${index + 1}`} readOnly={readOnly} />
                <input value={option.match ?? ''} onChange={(event) => onUpdateOption(option.id, { match: event.target.value })} className={inputClass} placeholder={`Match ${index + 1}`} readOnly={readOnly} />
                {!readOnly && <button type="button" onClick={() => onRemoveOption(option.id)} className="grid h-9 w-9 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-red-500/10 hover:text-red-400" aria-label="Remove pair"><Trash2 size={15} /></button>}
              </div>
            )
          }

          if (type === 'fill_blank') {
            return (
              <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_34px]">
                <input value={option.text} onChange={(event) => onUpdateOption(option.id, { text: event.target.value, isCorrect: true })} className={inputClass} placeholder={`Answer ${index + 1}`} readOnly={readOnly} />
                {!readOnly && <button type="button" onClick={() => onRemoveOption(option.id)} className="grid h-9 w-9 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-red-500/10 hover:text-red-400" aria-label="Remove answer"><Trash2 size={15} /></button>}
              </div>
            )
          }

          return (
            <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_34px]">
              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--lux-text)]">
                <input
                  type={type === 'multiple_choice' ? 'radio' : 'checkbox'}
                  name={`correct-${question.id}`}
                  checked={Boolean(option.isCorrect)}
                  onChange={(event) => onMarkChoiceCorrect(option.id, event.target.checked)}
                  disabled={readOnly}
                />
                Correct
              </label>
              <input value={option.text} onChange={(event) => onUpdateOption(option.id, { text: event.target.value })} className={inputClass} placeholder={`Choice ${index + 1}`} readOnly={readOnly} />
              {!readOnly && <button type="button" onClick={() => onRemoveOption(option.id)} className="grid h-9 w-9 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-red-500/10 hover:text-red-400" aria-label="Remove choice"><Trash2 size={15} /></button>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
