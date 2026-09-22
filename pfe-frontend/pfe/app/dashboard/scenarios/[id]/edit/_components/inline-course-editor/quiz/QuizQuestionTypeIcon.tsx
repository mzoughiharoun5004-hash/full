import { CheckSquare, CircleDot, Columns3, TextCursorInput } from 'lucide-react'
import type { CanonicalQuizQuestionType } from '../courseEditorModel'

export function QuizQuestionTypeIcon({
  type,
  size,
  className,
}: {
  type: CanonicalQuizQuestionType
  size: number
  className?: string
}) {
  if (type === 'multiple_response') return <CheckSquare size={size} className={className} />
  if (type === 'fill_blank') return <TextCursorInput size={size} className={className} />
  if (type === 'matching') return <Columns3 size={size} className={className} />
  return <CircleDot size={size} className={className} />
}
