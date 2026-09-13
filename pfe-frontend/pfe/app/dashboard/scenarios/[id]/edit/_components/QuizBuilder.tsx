'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { quizApi } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useSocket } from '@/context/SocketContext'
import type { Quiz, Question, QuestionType } from '@/types'

interface Props {
  scenarioId: string
  activityId: string
}

const emptyQuestion = (): Omit<Question, 'id'> => ({
  text: '',
  type: 'MCQ',
  options: ['', '', '', ''],
  correctAnswer: '',
  points: 1,
})

interface QuizDraft {
  questions: Omit<Question, 'id'>[]
  passingScore: number
  timeLimit: string
}

const toQuestionDraft = (question: Question): Omit<Question, 'id'> => ({
  text: question.text,
  type: question.type,
  options: question.options,
  correctAnswer: question.correctAnswer,
  points: question.points,
})

const createQuizDraft = (quiz?: Quiz | null): QuizDraft => ({
  questions: quiz?.questions?.length ? quiz.questions.map(toQuestionDraft) : [emptyQuestion()],
  passingScore: quiz?.passingScore ?? 70,
  timeLimit: quiz?.timeLimit ? String(quiz.timeLimit) : '',
})

export function QuizBuilder({ scenarioId, activityId }: Props) {
  const qc = useQueryClient()
  const { broadcastScenarioEdit } = useSocket()
  const [draftOverride, setDraftOverride] = useState<QuizDraft | null>(null)

  // TanStack Query v5 — no onSuccess in useQuery, use useEffect instead
  const { data: existing, isLoading } = useQuery<Quiz | null>({
    queryKey: ['quiz', activityId],
    queryFn: () => quizApi.getByActivity(activityId).then(r => r.data ?? null),
  })

  const existingDraft = useMemo(() => createQuizDraft(existing), [existing])
  const draft = draftOverride ?? existingDraft
  const updateDraft = (updater: (current: QuizDraft) => QuizDraft) => {
    setDraftOverride(current => updater(current ?? existingDraft))
  }

  const { mutate: saveQuiz, isPending: saving } = useMutation({
    mutationFn: () => {
      const payload = {
        questions: draft.questions,
        passingScore: draft.passingScore,
        timeLimit: draft.timeLimit ? Number(draft.timeLimit) : undefined,
      }
      return existing
        ? quizApi.update(existing.id, payload)
        : quizApi.create(activityId, payload)
    },
    onSuccess: () => {
      toast.success('Quiz saved!')
      qc.invalidateQueries({ queryKey: ['quiz', activityId] })
      broadcastScenarioEdit({
        scenarioId,
        entityType: 'quiz',
        entityId: activityId,
        action: existing ? 'update' : 'create',
      })
    },
    onError: () => toast.error('Failed to save quiz'),
  })

  const updateQ = (i: number, patch: Partial<Omit<Question, 'id'>>) =>
    updateDraft(current => ({
      ...current,
      questions: current.questions.map((q, idx) => idx === i ? { ...q, ...patch } : q),
    }))

  const updateOption = (qi: number, oi: number, val: string) =>
    updateDraft(current => ({
      ...current,
      questions: current.questions.map((q, idx) =>
        idx === qi ? {
          ...q,
          options: q.options.map((o, j) => j === oi ? val : o),
          correctAnswer:
            q.correctAnswer === q.options[oi] && q.correctAnswer !== ''
              ? val
              : q.correctAnswer,
        } : q
      ),
    }))

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="flex flex-col h-full overflow-y-auto lux-scrollbar">
      {/* Settings bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/7 bg-[#0d0f17]">
        <div className="w-36">
          <Input
            id="quiz-pass"
            label="Passing score %"
            type="number"
            min={0}
            max={100}
            value={String(draft.passingScore)}
            onChange={e => updateDraft(current => ({ ...current, passingScore: Number(e.target.value) }))}
          />
        </div>
        <div className="w-36">
          <Input
            id="quiz-time"
            label="Time limit (min)"
            type="number"
            min={1}
            value={draft.timeLimit}
            onChange={e => updateDraft(current => ({ ...current, timeLimit: e.target.value }))}
            placeholder="No limit"
          />
        </div>
        <div className="ml-auto pt-5">
          <Button size="sm" onClick={() => saveQuiz()} loading={saving}>
            Save quiz
          </Button>
        </div>
      </div>

      {/* Questions list */}
      <div className="flex-1 p-4 space-y-4">
        {draft.questions.map((q, qi) => (
          <div key={qi} className="border border-white/8 rounded-xl bg-[#111318] p-4 space-y-3">
            {/* Question header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Input
                  id={`q-${qi}-text`}
                  label={`Question ${qi + 1}`}
                  value={q.text}
                  placeholder="Enter question text…"
                  onChange={e => updateQ(qi, { text: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 pt-6 flex-shrink-0">
                {/* Type toggle */}
                <div className="flex gap-0.5 bg-white/5 border border-white/8 rounded-lg p-0.5">
                  {(['MCQ', 'TRUE_FALSE'] as QuestionType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => updateQ(qi, { type: t, correctAnswer: '' })}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                        q.type === t ? 'bg-[#0F6B4A] text-[#FFF8EC]' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {t === 'MCQ' ? 'MCQ' : 'T/F'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => updateDraft(current => ({
                    ...current,
                    questions: current.questions.filter((_, i) => i !== qi),
                  }))}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Answer options */}
            {q.type === 'MCQ' ? (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 font-medium uppercase">
                  Options — click ✓ to mark correct answer
                </p>
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      onClick={() => updateQ(qi, { correctAnswer: opt })}
                      className="flex-shrink-0 transition-colors hover:text-[#83BFA1]"
                    >
                      {q.correctAnswer === opt
                        ? <CheckCircle2 size={15} className="text-[#83BFA1]" />
                        : <Circle size={15} className="text-slate-600" />}
                    </button>
                    <input
                      value={opt}
                      onChange={e => updateOption(qi, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                      className="flex-1 bg-white/4 border border-white/8 rounded-lg text-slate-200 text-xs px-3 py-1.5 placeholder:text-slate-600 focus:outline-none focus:border-[#0F6B4A] transition-all"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                {['True', 'False'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => updateQ(qi, { correctAnswer: opt })}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                      q.correctAnswer === opt
                        ? 'border-[#0F6B4A] bg-[#0F6B4A]/18 text-[#83BFA1]'
                        : 'border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Points */}
            <div className="w-28">
              <Input
                id={`q-${qi}-pts`}
                label="Points"
                type="number"
                min={1}
                value={String(q.points ?? 1)}
                onChange={e => updateQ(qi, { points: Number(e.target.value) })}
              />
            </div>
          </div>
        ))}

        {/* Add question */}
        <button
          onClick={() => updateDraft(current => ({
            ...current,
            questions: [...current.questions, emptyQuestion()],
          }))}
          className="w-full border-2 border-dashed border-white/10 rounded-xl py-3 text-sm text-slate-500 hover:text-[#83BFA1] hover:border-[#0F6B4A]/40 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add question
        </button>
      </div>
    </div>
  )
}
