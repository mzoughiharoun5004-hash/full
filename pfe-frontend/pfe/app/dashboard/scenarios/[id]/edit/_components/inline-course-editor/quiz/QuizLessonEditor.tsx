import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { CourseLesson, CourseQuizQuestion } from '@/types'
import {
  createQuizQuestion,
  normalizeQuizQuestion,
  normalizeQuizQuestionType,
  quizQuestionDescriptions,
  quizQuestionLabels,
  quizQuestionTypes,
  uid,
  type CanonicalQuizQuestionType,
  type SaveStatus,
} from '../courseEditorModel'
import { QuizQuestionEditor } from './QuizQuestionEditor'
import { QuizQuestionTypeIcon } from './QuizQuestionTypeIcon'
import type { QuizData } from './quizTypes'

export function QuizLessonEditor({
  lesson,
  readOnly,
  saveStatus,
  onFinish,
  onUpdateLesson,
}: {
  lesson: CourseLesson
  readOnly: boolean
  saveStatus: SaveStatus
  onFinish: () => void
  onUpdateLesson: (updater: (lesson: CourseLesson) => CourseLesson) => void
}) {
  const questions = useMemo(() => lesson.quiz?.questions?.map(normalizeQuizQuestion) ?? [], [lesson.quiz?.questions])
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(questions[0]?.id ?? null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const activeQuestion = questions.find((question) => question.id === selectedQuestionId) ?? questions[0]
  const activeQuestionId = activeQuestion?.id ?? null
  const activeIndex = activeQuestion ? questions.findIndex((question) => question.id === activeQuestion.id) : -1

  const updateQuiz = (updater: (quiz: QuizData) => QuizData) => {
    if (readOnly) return
    onUpdateLesson((current) => {
      const currentQuiz: QuizData = {
        passingScore: current.quiz?.passingScore ?? 80,
        attempts: current.quiz?.attempts ?? 1,
        randomizeQuestions: current.quiz?.randomizeQuestions ?? false,
        randomizeAnswers: current.quiz?.randomizeAnswers ?? false,
        showFeedback: current.quiz?.showFeedback ?? true,
        timeLimitMinutes: current.quiz?.timeLimitMinutes,
        questions: current.quiz?.questions ?? [],
      }
      const nextQuiz = updater(currentQuiz)
      return {
        ...current,
        type: 'quiz',
        blocks: [],
        quiz: {
          ...nextQuiz,
          questions: nextQuiz.questions.map(normalizeQuizQuestion),
        },
      }
    })
  }

  const addQuestion = (type: CanonicalQuizQuestionType) => {
    const question = createQuizQuestion(type)
    updateQuiz((quiz) => {
      const insertAt = activeQuestion ? questions.findIndex((item) => item.id === activeQuestion.id) + 1 : quiz.questions.length
      const nextQuestions = [...quiz.questions]
      nextQuestions.splice(Math.max(0, insertAt), 0, question)
      return { ...quiz, questions: nextQuestions }
    })
    setSelectedQuestionId(question.id)
    setAddMenuOpen(false)
  }

  const updateQuestion = (questionId: string, updater: (question: CourseQuizQuestion) => CourseQuizQuestion) => {
    updateQuiz((quiz) => ({
      ...quiz,
      questions: quiz.questions.map((question) => (
        question.id === questionId ? normalizeQuizQuestion(updater(normalizeQuizQuestion(question))) : question
      )),
    }))
  }

  const moveQuestion = (questionId: string, direction: -1 | 1) => {
    updateQuiz((quiz) => {
      const nextQuestions = [...quiz.questions]
      const index = nextQuestions.findIndex((question) => question.id === questionId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= nextQuestions.length) return quiz
      const [question] = nextQuestions.splice(index, 1)
      nextQuestions.splice(nextIndex, 0, question)
      return { ...quiz, questions: nextQuestions }
    })
  }

  const duplicateQuestion = (question: CourseQuizQuestion) => {
    const duplicate: CourseQuizQuestion = {
      ...question,
      id: uid('question'),
      text: `${question.text || 'Question'} copy`,
      options: question.options.map((option) => ({ ...option, id: uid('option') })),
    }
    updateQuiz((quiz) => {
      const index = quiz.questions.findIndex((item) => item.id === question.id)
      const nextQuestions = [...quiz.questions]
      nextQuestions.splice(Math.max(0, index + 1), 0, duplicate)
      return { ...quiz, questions: nextQuestions }
    })
    setSelectedQuestionId(duplicate.id)
  }

  const deleteQuestion = (questionId: string) => {
    const deletedIndex = questions.findIndex((question) => question.id === questionId)
    const nextQuestions = questions.filter((question) => question.id !== questionId)
    const nextActiveQuestionId = activeQuestionId === questionId
      ? nextQuestions[Math.min(deletedIndex, nextQuestions.length - 1)]?.id ?? null
      : activeQuestionId

    updateQuiz((quiz) => {
      return { ...quiz, questions: quiz.questions.filter((question) => question.id !== questionId) }
    })
    setSelectedQuestionId(nextActiveQuestionId)
  }

  return (
    <section className="border-t-[3px] border-[var(--lux-line)] px-4 pb-14 pt-8">
      <div className="mx-auto grid max-w-[1180px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-hidden">
          <div className="flex flex-shrink-0 items-center justify-between gap-3 px-2 py-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">Questions</p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setAddMenuOpen((current) => !current)}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-md text-[var(--lux-text-strong)] transition',
                  addMenuOpen
                    ? 'bg-[var(--lux-primary-hover)]'
                    : 'bg-[var(--lux-primary)] hover:bg-[var(--lux-primary-hover)]',
                )}
                aria-expanded={addMenuOpen}
                aria-label={addMenuOpen ? 'Close question type picker' : 'Add question'}
                title={addMenuOpen ? 'Close' : 'Add question'}
              >
                <Plus size={17} className={cn('transition-transform', addMenuOpen && 'rotate-45')} />
              </button>
            )}
          </div>

          {addMenuOpen && !readOnly && (
            <div className="mt-2 flex-shrink-0 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 shadow-sm">
              <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
                Choose Type
              </p>
              <div className="mt-1 grid gap-1">
                {quizQuestionTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addQuestion(type)}
                    className="flex w-full items-start gap-2.5 rounded-md border border-transparent px-2.5 py-2.5 text-left transition hover:border-[var(--lux-line)] hover:bg-[var(--lux-overlay-hover)]"
                  >
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--lux-overlay)] text-[var(--lux-primary)]">
                      <QuizQuestionTypeIcon type={type} size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-5 text-[var(--lux-text-strong)]">{quizQuestionLabels[type]}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-[var(--lux-muted)]">{quizQuestionDescriptions[type]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 lux-scrollbar">
            {questions.map((question, index) => {
              const type = normalizeQuizQuestionType(question.type)
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setSelectedQuestionId(question.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition',
                    question.id === activeQuestion?.id
                      ? 'border-[var(--lux-primary)] bg-[var(--lux-overlay-hover)] text-[var(--lux-text-strong)]'
                      : 'border-transparent text-[var(--lux-muted)] hover:border-[var(--lux-line)] hover:text-[var(--lux-text-strong)]',
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[var(--lux-elevated)]">
                    <QuizQuestionTypeIcon type={type} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold uppercase tracking-wide">Question {index + 1}</span>
                    <span className="mt-0.5 block truncate text-sm">{question.text || quizQuestionLabels[type]}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {!questions.length && (
            <div className="rounded-md border border-dashed border-[var(--lux-line)] p-4 text-center text-sm text-[var(--lux-muted)]">
              No questions yet.
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {activeQuestion ? (
            <QuizQuestionEditor
              question={activeQuestion}
              questionNumber={activeIndex + 1}
              questionCount={questions.length}
              readOnly={readOnly}
              onUpdate={(updater) => updateQuestion(activeQuestion.id, updater)}
              onMoveUp={() => moveQuestion(activeQuestion.id, -1)}
              onMoveDown={() => moveQuestion(activeQuestion.id, 1)}
              onDuplicate={() => duplicateQuestion(activeQuestion)}
              onDelete={() => deleteQuestion(activeQuestion.id)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface)] p-10 text-center">
              <p className="text-lg font-bold text-[var(--lux-text-strong)]">Add your first question</p>
              {!readOnly && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {quizQuestionTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addQuestion(type)}
                      className="flex items-center gap-3 rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-4 py-3 text-left text-sm font-bold text-[var(--lux-text-strong)] transition hover:border-[var(--lux-primary)]"
                    >
                      <QuizQuestionTypeIcon type={type} size={17} />
                      {quizQuestionLabels[type]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!readOnly && (
            <div className="mt-6 flex justify-center">
              <Button size="lg" className="min-w-[160px] px-10" onClick={onFinish} disabled={saveStatus === 'saving'}>
                <Check size={16} className="mr-1" />
                Finish
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
