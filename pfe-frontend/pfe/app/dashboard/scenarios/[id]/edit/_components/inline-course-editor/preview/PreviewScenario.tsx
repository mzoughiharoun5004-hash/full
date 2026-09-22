import type { CoursePage, BranchingNode } from '@/types'

export function PreviewScenario({ page }: { page: CoursePage }) {
  const nodes = page.scenario?.nodes ?? []
  const startNode = nodes.find((node) => node.id === page.scenario?.startNodeId) ?? nodes[0]

  if (!startNode) {
    return <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">No scenario nodes yet.</p>
  }

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <PreviewScenarioNode node={startNode} />
    </section>
  )
}

function PreviewScenarioNode({ node }: { node: BranchingNode }) {
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">Branching scenario</p>
      <h3 className="mt-1 text-2xl font-bold">{node.speaker || 'Scenario'}</h3>
      <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-[var(--lux-muted)]">{node.text}</p>
      {node.choices.length > 0 && (
        <div className="mt-5 grid gap-3">
          {node.choices.map((choice) => (
            <button key={choice.id} type="button" className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-4 py-3 text-left text-sm text-[var(--lux-text-strong)] transition hover:border-[var(--lux-primary-muted)]">
              {choice.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
