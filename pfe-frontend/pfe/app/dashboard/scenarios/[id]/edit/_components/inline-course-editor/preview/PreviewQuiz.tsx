import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CoursePage, CourseQuizQuestion } from '@/types'
import {
  normalizeQuizQuestion,
  normalizeQuizQuestionType,
  type CanonicalQuizQuestionType,
} from '../courseEditorModel'
import { inputClass, selectClass } from '../shared/editorStyles'
import { uploadedAssetUrl } from '../shared/mediaHelpers'

type QuizPreviewAnswer = string | string[] | Record<string, string>

type QuizPreviewResult = {
  answered: boolean
  correct: boolean
  points: number
  feedback: string
}

export function PreviewQuiz({ page, accentColor }: { page: CoursePage; accentColor: string }) {
  const questions = useMemo(() => (page.quiz?.questions ?? []).map(normalizeQuizQuestion), [page.quiz?.questions])
  const [answers, setAnswers] = useState<Record<string, QuizPreviewAnswer>>({})
  const [results, setResults] = useState<Record<string, QuizPreviewResult>>({})
  const [submitted, setSubmitted] = useState(false)
  const possibleScore = questions.reduce((total, question) => total + quizQuestionPoints(question), 0)
  const earnedScore = Object.values(results).reduce((total, result) => total + result.points, 0)
  const percent = possibleScore ? Math.round((earnedScore / possibleScore) * 100) : 0
  const passingScore = page.quiz?.passingScore ?? 80
  const allVerified = questions.length > 0 && questions.every((question) => results[question.id])

  const updateAnswer = (questionId: string, answer: QuizPreviewAnswer) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }))
    setSubmitted(false)
  }

  const verifyQuestion = (question: CourseQuizQuestion) => {
    const result = evaluatePreviewQuizQuestion(question, answers[question.id])
    setResults((current) => ({ ...current, [question.id]: result }))
  }

  const submitQuiz = () => {
    const nextResults = questions.reduce<Record<string, QuizPreviewResult>>((acc, question) => {
      acc[question.id] = evaluatePreviewQuizQuestion(question, answers[question.id])
      return acc
    }, {})
    setResults(nextResults)
    setSubmitted(true)
  }

  if (!questions.length) return <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">No quiz questions yet.</p>

  return (
    <div className="space-y-4">
      {questions.map((question, index) => {
        const type = normalizeQuizQuestionType(question.type)
        const result = results[question.id]
        return (
          <div key={question.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: accentColor }}>Question {index + 1}</p>
            <h3 className="mt-2 text-xl font-bold">{question.text}</h3>
            {question.imageUrl && (
              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadedAssetUrl(question.imageUrl)} alt="" className="max-h-80 w-full object-contain" />
              </div>
            )}
            <div className="mt-4 space-y-2">
              {renderPreviewQuizAnswer({
                question,
                type,
                answer: answers[question.id],
                onChange: (answer) => updateAnswer(question.id, answer),
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => verifyQuestion(question)}
                className="inline-flex rounded-full px-4 py-2 text-sm font-bold text-white"
                style={{ background: accentColor }}
              >
                Verify
              </button>
              <span className="text-xs font-semibold text-[var(--lux-muted)]">{quizQuestionPoints(question)} point{quizQuestionPoints(question) === 1 ? '' : 's'}</span>
            </div>
            {result && (
              <div className={cn(
                'mt-4 rounded-lg border px-4 py-3 text-sm',
                result.correct
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/35 bg-red-500/10 text-red-200',
              )}>
                <p className="font-bold">{result.correct ? 'Correct' : result.answered ? 'Incorrect' : 'Incomplete'}</p>
                {result.feedback && <p className="mt-1 text-[var(--lux-text)]">{result.feedback}</p>}
              </div>
            )}
          </div>
        )
      })}

      <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--lux-text-strong)]">Score {earnedScore} / {possibleScore}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--lux-muted)]">{allVerified ? `${percent}% ${percent >= passingScore ? 'passed' : 'not passed'}` : 'Verify questions or submit to complete.'}</p>
          </div>
          <button type="button" onClick={submitQuiz} className="inline-flex rounded-full px-4 py-2 text-sm font-bold text-white" style={{ background: accentColor }}>
            Submit quiz
          </button>
        </div>
        {submitted && (
          <div className="mt-4 rounded-lg bg-[var(--lux-surface-soft)] px-4 py-3 text-sm text-[var(--lux-text)]">
            {percent >= passingScore ? 'Completion status: Passed' : 'Completion status: Failed'}
          </div>
        )}
      </div>
    </div>
  )
}

function renderPreviewQuizAnswer({
  question,
  type,
  answer,
  onChange,
}: {
  question: CourseQuizQuestion
  type: CanonicalQuizQuestionType
  answer: QuizPreviewAnswer | undefined
  onChange: (answer: QuizPreviewAnswer) => void
}) {
  if (type === 'fill_blank') {
    return (
      <input
        value={typeof answer === 'string' ? answer : ''}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    )
  }

  if (type === 'matching') {
    const selected = isRecordAnswer(answer) ? answer : {}
    const matches = question.options.map((option) => option.match || '').filter(Boolean)
    return question.options.map((option) => (
      <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <span className="font-semibold text-[var(--lux-text-strong)]">{option.text}</span>
        <select
          value={selected[option.id] ?? ''}
          onChange={(event) => onChange({ ...selected, [option.id]: event.target.value })}
          className={selectClass}
        >
          <option value="">Choose match</option>
          {matches.map((match) => <option key={`${option.id}-${match}`} value={match}>{match}</option>)}
        </select>
      </div>
    ))
  }

  const selectedIds = Array.isArray(answer) ? answer : []
  const selectedId = typeof answer === 'string' ? answer : ''

  return question.options.map((option) => (
    <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-3 text-sm transition hover:border-[var(--lux-primary-muted)]">
      <input
        type={type === 'multiple_response' ? 'checkbox' : 'radio'}
        name={`preview-${question.id}`}
        checked={type === 'multiple_response' ? selectedIds.includes(option.id) : selectedId === option.id}
        onChange={(event) => {
          if (type === 'multiple_response') {
            const nextIds = event.target.checked
              ? [...selectedIds, option.id]
              : selectedIds.filter((id) => id !== option.id)
            onChange(nextIds)
            return
          }
          onChange(option.id)
        }}
      />
      <span>{option.text}</span>
    </label>
  ))
}

function evaluatePreviewQuizQuestion(question: CourseQuizQuestion, answer: QuizPreviewAnswer | undefined): QuizPreviewResult {
  const normalized = normalizeQuizQuestion(question)
  const type = normalizeQuizQuestionType(normalized.type)
  const points = quizQuestionPoints(normalized)
  let answered = false
  let correct = false

  if (type === 'multiple_choice') {
    const selectedId = typeof answer === 'string' ? answer : ''
    const selected = normalized.options.find((option) => option.id === selectedId)
    answered = Boolean(selected)
    correct = Boolean(selected?.isCorrect)
  } else if (type === 'multiple_response') {
    const selectedIds = new Set(Array.isArray(answer) ? answer : [])
    const correctIds = normalized.options.filter((option) => option.isCorrect).map((option) => option.id)
    answered = selectedIds.size > 0
    correct = answered && selectedIds.size === correctIds.length && correctIds.every((id) => selectedIds.has(id))
  } else if (type === 'fill_blank') {
    const response = typeof answer === 'string' ? answer : ''
    const normalize = (value: string) => normalized.caseSensitive ? value.trim() : value.trim().toLocaleLowerCase()
    answered = Boolean(response.trim())
    correct = answered && normalized.options.some((option) => normalize(option.text) === normalize(response))
  } else {
    const selected = isRecordAnswer(answer) ? answer : {}
    answered = normalized.options.length > 0 && normalized.options.every((option) => Boolean(selected[option.id]))
    correct = answered && normalized.options.every((option) => selected[option.id] === (option.match ?? ''))
  }

  return {
    answered,
    correct,
    points: correct ? points : 0,
    feedback: previewQuizFeedback(normalized, correct),
  }
}

function previewQuizFeedback(question: CourseQuizQuestion, correct: boolean) {
  if ((question.feedbackMode ?? 'any_response') === 'any_response') {
    return question.feedback ?? ''
  }
  return correct ? question.correctFeedback ?? 'Correct.' : question.incorrectFeedback ?? 'Incorrect.'
}

function quizQuestionPoints(question: CourseQuizQuestion) {
  const points = Number(question.points)
  return Number.isFinite(points) && points > 0 ? points : 1
}

function isRecordAnswer(answer: QuizPreviewAnswer | undefined): answer is Record<string, string> {
  return Boolean(answer) && typeof answer === 'object' && !Array.isArray(answer)
}
