import { useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Copy, LibraryBig, MoreHorizontal, Trash2, UploadCloud, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getApiErrorMessage, mediaApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { CourseQuizQuestion, CourseQuizQuestionOption, MediaAsset } from '@/types'
import {
  createQuizQuestion,
  normalizeQuizQuestion,
  normalizeQuizQuestionType,
  quizQuestionLabels,
  quizQuestionTypes,
  uid,
  type CanonicalQuizQuestionType,
} from '../courseEditorModel'
import { MediaPicker } from '../../MediaPicker'
import { QuizAnswerEditor } from './QuizAnswerEditor'
import { QuizQuestionTypeIcon } from './QuizQuestionTypeIcon'
import { inputClass, textareaClass, selectClass } from '../shared/editorStyles'
import { uploadedAssetUrl, mediaPickerAssetUrl } from '../shared/mediaHelpers'
import { Field } from '../shared/uiPrimitives'

export function QuizQuestionEditor({
  question,
  questionNumber,
  questionCount,
  readOnly,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: {
  question: CourseQuizQuestion
  questionNumber: number
  questionCount: number
  readOnly: boolean
  onUpdate: (updater: (question: CourseQuizQuestion) => CourseQuizQuestion) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const type = normalizeQuizQuestionType(question.type)
  const [menuOpen, setMenuOpen] = useState(false)
  const questionImageInputRef = useRef<HTMLInputElement | null>(null)
  const [questionImageUploading, setQuestionImageUploading] = useState(false)
  const [questionMediaPickerOpen, setQuestionMediaPickerOpen] = useState(false)
  const questionImageUrl = question.imageUrl ? uploadedAssetUrl(question.imageUrl) : ''

  const patchQuestion = (patch: Partial<CourseQuizQuestion>) => {
    onUpdate((current) => normalizeQuizQuestion({ ...current, ...patch }))
  }

  const applyQuestionImageFile = async (file: File) => {
    if (readOnly || questionImageUploading) return
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file.')
      return
    }

    setQuestionImageUploading(true)
    try {
      const response = await mediaApi.upload(file)
      patchQuestion({ imageUrl: uploadedAssetUrl(response.data.url) })
      toast.success('Question image uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setQuestionImageUploading(false)
    }
  }

  const applyQuestionImageAsset = (asset: MediaAsset) => {
    patchQuestion({ imageUrl: mediaPickerAssetUrl(asset) })
    setQuestionMediaPickerOpen(false)
  }

  const updateOption = (optionId: string, patch: Partial<CourseQuizQuestionOption>) => {
    onUpdate((current) => ({
      ...current,
      options: current.options.map((option) => option.id === optionId ? { ...option, ...patch } : option),
    }))
  }

  const addOption = () => {
    const option: CourseQuizQuestionOption =
      type === 'matching'
        ? { id: uid('match'), text: '', match: '', isCorrect: true }
        : type === 'fill_blank'
          ? { id: uid('answer'), text: '', isCorrect: true }
          : { id: uid('option'), text: '', isCorrect: false }
    patchQuestion({ options: [...question.options, option] })
  }

  const removeOption = (optionId: string) => {
    patchQuestion({ options: question.options.filter((option) => option.id !== optionId) })
  }

  const markChoiceCorrect = (optionId: string, checked: boolean) => {
    if (type === 'multiple_choice') {
      patchQuestion({
        options: question.options.map((option) => ({ ...option, isCorrect: option.id === optionId })),
      })
      return
    }
    patchQuestion({
      options: question.options.map((option) => option.id === optionId ? { ...option, isCorrect: checked } : option),
    })
  }

  const changeType = (nextType: CanonicalQuizQuestionType) => {
    const template = createQuizQuestion(nextType)
    onUpdate((current) => normalizeQuizQuestion({
      ...template,
      id: current.id,
      text: current.text,
      imageUrl: current.imageUrl,
      points: current.points,
      feedbackMode: current.feedbackMode,
      feedback: current.feedback,
      correctFeedback: current.correctFeedback,
      incorrectFeedback: current.incorrectFeedback,
    }))
  }

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] shadow-[var(--lux-shadow)]">
      <header className="flex flex-col gap-3 border-b border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--lux-primary)] text-[var(--lux-text-strong)]">
            <QuizQuestionTypeIcon type={type} size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">Question {questionNumber} of {questionCount}</p>
            <p className="truncate text-base font-bold text-[var(--lux-text-strong)]">{quizQuestionLabels[type]}</p>
          </div>
        </div>
        {!readOnly && (
          <div className="relative flex items-center gap-2">
            <button type="button" onClick={onMoveUp} disabled={questionNumber <= 1} className="rounded-md border border-[var(--lux-line)] px-3 py-2 text-xs font-bold text-[var(--lux-muted)] disabled:opacity-35">Up</button>
            <button type="button" onClick={onMoveDown} disabled={questionNumber >= questionCount} className="rounded-md border border-[var(--lux-line)] px-3 py-2 text-xs font-bold text-[var(--lux-muted)] disabled:opacity-35">Down</button>
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="grid h-9 w-9 place-items-center rounded-md border border-[var(--lux-line)] text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)]"
              aria-label="Question actions"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-10 w-44 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-1 shadow-[var(--lux-shadow)]">
                <button type="button" onClick={() => { onDuplicate(); setMenuOpen(false) }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[var(--lux-text)] hover:bg-[var(--lux-overlay-hover)]"><Copy size={14} /> Duplicate</button>
                <button type="button" onClick={() => { onDelete(); setMenuOpen(false) }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={14} /> Delete</button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="space-y-6 p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <Field label="Question type">
            <select
              value={type}
              onChange={(event) => changeType(event.target.value as CanonicalQuizQuestionType)}
              className={selectClass}
              disabled={readOnly}
            >
              {quizQuestionTypes.map((questionType) => (
                <option key={questionType} value={questionType}>{quizQuestionLabels[questionType]}</option>
              ))}
            </select>
          </Field>
          <Field label="Points">
            <input
              type="number"
              min={1}
              value={question.points}
              onChange={(event) => patchQuestion({ points: Math.max(1, Number(event.target.value) || 1) })}
              className={inputClass}
              readOnly={readOnly}
            />
          </Field>
        </div>

        <Field label="Question">
          <textarea
            value={question.text}
            onChange={(event) => patchQuestion({ text: event.target.value })}
            placeholder="Enter a question title here..."
            rows={3}
            className={textareaClass}
            readOnly={readOnly}
          />
        </Field>

        <Field label="Question image">
          <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
            {questionImageUrl ? (
              <div className="overflow-hidden rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={questionImageUrl} alt="" className="max-h-64 w-full object-contain" />
              </div>
            ) : (
              <div className="grid min-h-36 place-items-center rounded-md border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface)] text-sm font-semibold text-[var(--lux-muted)]">
                No question image
              </div>
            )}

            {!readOnly && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={questionImageUploading}
                  onClick={() => questionImageInputRef.current?.click()}
                >
                  <UploadCloud size={14} />
                  Upload
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setQuestionMediaPickerOpen(true)}
                >
                  <LibraryBig size={14} />
                  Media library
                </Button>
                {question.imageUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => patchQuestion({ imageUrl: '' })}
                  >
                    <X size={14} />
                    Remove
                  </Button>
                )}
                <input
                  ref={questionImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void applyQuestionImageFile(file)
                    event.currentTarget.value = ''
                  }}
                />
              </div>
            )}
            <input
              value={question.imageUrl ?? ''}
              onChange={(event) => patchQuestion({ imageUrl: event.target.value })}
              placeholder="Image URL"
              className={cn(inputClass, 'mt-3 w-full')}
              readOnly={readOnly}
            />
          </div>
        </Field>

        <QuizAnswerEditor
          question={question}
          type={type}
          readOnly={readOnly}
          onUpdateOption={updateOption}
          onMarkChoiceCorrect={markChoiceCorrect}
          onAddOption={addOption}
          onRemoveOption={removeOption}
        />

        <div className="grid gap-4 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4 sm:grid-cols-2">
          <Field label="Feedback mode">
            <select
              value={question.feedbackMode ?? 'any_response'}
              onChange={(event) => patchQuestion({ feedbackMode: event.target.value === 'correct_incorrect' ? 'correct_incorrect' : 'any_response' })}
              className={selectClass}
              disabled={readOnly}
            >
              <option value="any_response">Any response</option>
              <option value="correct_incorrect">Correct / Incorrect</option>
            </select>
          </Field>
          {type === 'fill_blank' && (
            <label className="flex items-center gap-2 self-end text-sm font-semibold text-[var(--lux-text)]">
              <input
                type="checkbox"
                checked={Boolean(question.caseSensitive)}
                onChange={(event) => patchQuestion({ caseSensitive: event.target.checked })}
                disabled={readOnly}
              />
              Case sensitive
            </label>
          )}
          {(question.feedbackMode ?? 'any_response') === 'any_response' ? (
            <div className="sm:col-span-2">
              <Field label="Feedback">
                <textarea
                  value={question.feedback ?? ''}
                  onChange={(event) => patchQuestion({ feedback: event.target.value })}
                  rows={3}
                  className={textareaClass}
                  readOnly={readOnly}
                />
              </Field>
            </div>
          ) : (
            <>
              <Field label="Correct feedback">
                <textarea
                  value={question.correctFeedback ?? ''}
                  onChange={(event) => patchQuestion({ correctFeedback: event.target.value })}
                  rows={3}
                  className={textareaClass}
                  readOnly={readOnly}
                />
              </Field>
              <Field label="Incorrect feedback">
                <textarea
                  value={question.incorrectFeedback ?? ''}
                  onChange={(event) => patchQuestion({ incorrectFeedback: event.target.value })}
                  rows={3}
                  className={textareaClass}
                  readOnly={readOnly}
                />
              </Field>
            </>
          )}
        </div>
      </div>
      {questionMediaPickerOpen && !readOnly && (
        <MediaPicker
          open={questionMediaPickerOpen}
          onClose={() => setQuestionMediaPickerOpen(false)}
          acceptedTypes={['IMAGE']}
          onSelect={applyQuestionImageAsset}
        />
      )}
    </article>
  )
}
