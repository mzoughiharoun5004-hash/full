import type { CourseBlock } from '@/types'

export function PreviewQuestionBlock({ block }: { block: CourseBlock }) {
  const options = block.items ?? []
  return (
    <section className="pt-5">
      <h3 className="text-2xl font-bold">{block.title || block.knowledgeCheck?.question || 'Question'}</h3>
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 grid gap-2">
        {(options.length ? options : block.knowledgeCheck?.options?.map((option) => ({ id: option.id, title: option.text, content: option.isCorrect ? 'true' : 'false' })) ?? []).map((item) => (
          <button key={item.id} type="button" className="flex items-center gap-3 rounded-lg bg-[var(--lux-surface)] px-3 py-3 text-left text-sm text-[var(--lux-text-strong)] transition">
            <span className="h-3 w-3 rounded-full bg-[var(--lux-primary-muted)]" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
