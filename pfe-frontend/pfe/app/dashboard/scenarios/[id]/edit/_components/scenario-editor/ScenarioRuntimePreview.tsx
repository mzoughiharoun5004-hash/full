'use client'

import { useMemo, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type {
  ScenarioChoice,
  ScenarioCondition,
  ScenarioDocument,
  ScenarioEffect,
  ScenarioFlowNode,
  ScenarioVariable,
} from '@/types'

interface ScenarioRuntimePreviewProps {
  document: ScenarioDocument
  onClose: () => void
}

interface RuntimeState {
  currentNodeId: string
  visitedNodeIds: string[]
  score: number
  variables: Record<string, string | number | boolean | undefined>
  completed: boolean
}

export function ScenarioRuntimePreview({ document, onClose }: ScenarioRuntimePreviewProps) {
  const startNode = useMemo(
    () => document.nodes.find((node) => node.type === 'start') ?? document.nodes[0],
    [document.nodes],
  )
  const initialVariables = useMemo(() => createInitialVariables(document.variables), [document.variables])
  const [state, setState] = useState<RuntimeState>(() => ({
    currentNodeId: startNode?.id ?? '',
    visitedNodeIds: startNode ? [startNode.id] : [],
    score: 0,
    variables: initialVariables,
    completed: false,
  }))

  const currentNode = document.nodes.find((node) => node.id === state.currentNodeId)
  const progress = document.nodes.length
    ? Math.round((new Set(state.visitedNodeIds).size / document.nodes.length) * 100)
    : 0
  const passed = document.scoring.passingScore === undefined || state.score >= document.scoring.passingScore

  const reset = () => {
    setState({
      currentNodeId: startNode?.id ?? '',
      visitedNodeIds: startNode ? [startNode.id] : [],
      score: 0,
      variables: initialVariables,
      completed: false,
    })
  }

  const goToNode = (targetNodeId: string, choice?: ScenarioChoice) => {
    const targetNode = document.nodes.find((node) => node.id === targetNodeId)
    if (!targetNode) return

    setState((current) => {
      const choiceEffects = choice?.effects ?? []
      const scoreDelta = choice?.scoreDelta ?? 0
      const effects = [...choiceEffects, ...targetNode.effects]
      const variables = applyEffects(effects, current.variables)
      const effectScore = scoreFromEffects(effects)

      return {
        currentNodeId: targetNode.id,
        visitedNodeIds: [...current.visitedNodeIds, targetNode.id],
        score: current.score + scoreDelta + effectScore,
        variables,
        completed:
          targetNode.type === 'ending' ||
          effects.some((effect) => effect.type === 'complete' && effect.value !== false),
      }
    })
  }

  const availableChoices = currentNode
    ? currentNode.choices.filter((choice) => conditionsPass(choice.conditions ?? [], state.variables))
    : []
  const outgoingConnections = currentNode
    ? document.connections.filter(
        (connection) =>
          connection.sourceNodeId === currentNode.id &&
          conditionsPass(connection.conditions ?? [], state.variables),
      )
    : []

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-white/12 bg-[#F8F6F0] text-[#1F1B16] shadow-2xl">
        <div className="flex h-14 items-center gap-3 border-b border-black/10 bg-white px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{document.title}</p>
            <p className="text-xs text-black/50">
              Score {state.score}{document.scoring.maxScore ? ` / ${document.scoring.maxScore}` : ''}
            </p>
          </div>
          {document.settings.showProgress && (
            <div className="hidden min-w-[140px] items-center gap-2 sm:flex">
              <div className="h-1.5 flex-1 rounded-full bg-black/10">
                <div className="h-full rounded-full bg-[#0F6B4A]" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-semibold text-black/55">{progress}%</span>
            </div>
          )}
          <button
            type="button"
            onClick={reset}
            className="grid h-9 w-9 place-items-center rounded-full text-black/55 hover:bg-black/5 hover:text-black"
            aria-label="Restart preview"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-black/55 hover:bg-black/5 hover:text-black"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lux-scrollbar">
          <div className="mx-auto max-w-2xl">
            {!currentNode ? (
              <EmptyRuntimeState title="No start node found" />
            ) : state.completed ? (
              <CompletionState score={state.score} passed={passed} onRestart={reset} />
            ) : (
              <RuntimeNodeCard
                node={currentNode}
                choices={availableChoices}
                outgoingConnections={outgoingConnections}
                onContinue={(connectionId) => {
                  const connection = outgoingConnections.find((item) => item.id === connectionId)
                  if (connection) goToNode(connection.targetNodeId)
                }}
                onChoose={(choice) => {
                  const connection = outgoingConnections.find((item) => item.sourceChoiceId === choice.id)
                  const targetNodeId = choice.targetNodeId ?? connection?.targetNodeId
                  if (targetNodeId) goToNode(targetNodeId, choice)
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function RuntimeNodeCard({
  node,
  choices,
  outgoingConnections,
  onChoose,
  onContinue,
}: {
  node: ScenarioFlowNode
  choices: ScenarioChoice[]
  outgoingConnections: { id: string; label?: string; targetNodeId: string; sourceChoiceId?: string }[]
  onChoose: (choice: ScenarioChoice) => void
  onContinue: (connectionId: string) => void
}) {
  const connectionChoices = outgoingConnections.filter((connection) => !connection.sourceChoiceId)
  const hasChoices = choices.length > 0

  return (
    <article className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
      <div className="border-b border-black/10 p-5">
        {node.speaker && (
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-[#0F6B4A]/12 text-sm font-bold text-[#0F6B4A]">
              {node.speaker.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold">{node.speaker.name}</p>
              {node.speaker.role && <p className="text-xs text-black/50">{node.speaker.role}</p>}
            </div>
          </div>
        )}
        {node.content.title && <h1 className="text-2xl font-bold leading-tight">{node.content.title}</h1>}
        {node.content.body && (
          <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-black/68">{node.content.body}</p>
        )}
      </div>

      <div className="space-y-2 p-5">
        {hasChoices ? (
          choices.map((choice) => {
            const disabled = !choice.targetNodeId && !outgoingConnections.some((connection) => connection.sourceChoiceId === choice.id)
            return (
              <button
                key={choice.id}
                type="button"
                disabled={disabled}
                onClick={() => onChoose(choice)}
                className={cn(
                  'block w-full rounded-lg border px-4 py-3 text-left text-sm font-semibold transition',
                  disabled
                    ? 'cursor-not-allowed border-black/8 bg-black/[0.03] text-black/35'
                    : 'border-black/10 bg-[#F8F6F0] text-[#1F1B16] hover:border-[#0F6B4A]/35 hover:bg-[#0F6B4A]/8',
                )}
              >
                {choice.text}
              </button>
            )
          })
        ) : connectionChoices.length ? (
          connectionChoices.map((connection) => (
            <Button key={connection.id} type="button" onClick={() => onContinue(connection.id)}>
              {connection.label || 'Continue'}
            </Button>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-black/12 bg-black/[0.03] p-4 text-sm text-black/45">
            This path has no next step.
          </div>
        )}
      </div>
    </article>
  )
}

function CompletionState({
  score,
  passed,
  onRestart,
}: {
  score: number
  passed: boolean
  onRestart: () => void
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
      <p className="text-xs font-bold uppercase text-[#0F6B4A]">Complete</p>
      <h1 className="mt-2 text-3xl font-bold">Scenario complete</h1>
      <p className="mt-3 text-sm text-black/55">
        Score {score}. {passed ? 'Passing threshold met.' : 'Passing threshold not met.'}
      </p>
      <Button type="button" onClick={onRestart} className="mt-6">
        Restart
      </Button>
    </div>
  )
}

function EmptyRuntimeState({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold">{title}</h1>
    </div>
  )
}

function createInitialVariables(variables: ScenarioVariable[]) {
  return Object.fromEntries(variables.map((variable) => [variable.id, variable.defaultValue]))
}

function conditionsPass(
  conditions: ScenarioCondition[],
  variables: RuntimeState['variables'],
) {
  return conditions.every((condition) => {
    const actual = variables[condition.variableId]
    if (condition.operator === 'exists') return actual !== undefined && actual !== null && actual !== ''
    if (condition.operator === 'equals') return actual === condition.value
    if (condition.operator === 'not_equals') return actual !== condition.value
    if (condition.operator === 'contains') return String(actual ?? '').includes(String(condition.value ?? ''))

    const actualNumber = typeof actual === 'number' ? actual : Number(actual)
    const expectedNumber = typeof condition.value === 'number' ? condition.value : Number(condition.value)
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false

    if (condition.operator === 'greater_than') return actualNumber > expectedNumber
    if (condition.operator === 'less_than') return actualNumber < expectedNumber
    return true
  })
}

function applyEffects(
  effects: ScenarioEffect[],
  variables: RuntimeState['variables'],
) {
  return effects.reduce<RuntimeState['variables']>((next, effect) => {
    if (effect.type !== 'set_variable' || !effect.targetId) return next
    return {
      ...next,
      [effect.targetId]: effect.value,
    }
  }, variables)
}

function scoreFromEffects(effects: ScenarioEffect[]) {
  return effects.reduce((score, effect) => {
    if (effect.type !== 'increment_score') return score
    return score + (typeof effect.value === 'number' ? effect.value : Number(effect.value ?? 0))
  }, 0)
}
