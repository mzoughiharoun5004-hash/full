'use client'

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScenarioFlowNode as ScenarioFlowNodeModel, ScenarioNodeType } from '@/types'
import { getNodeDefinition } from './scenarioNodeRegistry'

export type ScenarioCanvasNodeData = {
  node: ScenarioFlowNodeModel
  selectedNodeId: string | null
  locked?: boolean
  onSelectNode: (nodeId: string) => void
  onUpdateNode: (nodeId: string, patch: Partial<ScenarioFlowNodeModel>) => void
  onQuickAdd: (sourceNodeId: string, sourceChoiceId?: string) => void
  onDeleteNode: (nodeId: string) => void
}

export type ScenarioCanvasNode = Node<ScenarioCanvasNodeData, 'scenarioNode'>

const nodeSizeClass: Record<ScenarioNodeType, string> = {
  start: 'w-[280px]',
  dialogue: 'w-[280px]',
  choice: 'w-[320px]',
  feedback: 'w-[280px]',
  information: 'w-[280px]',
  decision: 'w-[280px]',
  score: 'w-[260px]',
  ending: 'w-[270px]',
  media: 'w-[280px]',
  variable: 'w-[270px]',
  conditional_branch: 'w-[300px]',
}

export const ScenarioFlowNode = memo(function ScenarioFlowNode({
  data,
  selected,
}: NodeProps<ScenarioCanvasNode>) {
  const node = data.node
  const definition = getNodeDefinition(node.type)
  const Icon = definition.icon
  const isStart = node.type === 'start'
  const isChoice = node.type === 'choice'
  const isSelected = selected || data.selectedNodeId === node.id

  const updateContent = (patch: Partial<ScenarioFlowNodeModel['content']>) => {
    data.onUpdateNode(node.id, {
      content: {
        ...node.content,
        ...patch,
      },
    })
  }

  return (
    <div
      className={cn(
        'group rounded-lg border bg-[var(--lux-surface)] shadow-[0_18px_50px_rgba(5,12,14,0.22)] transition-all',
        nodeSizeClass[node.type],
        isSelected ? 'border-[var(--lux-primary)] ring-2 ring-[var(--lux-primary)]/20' : 'border-[var(--lux-line)]',
      )}
      onClick={() => data.onSelectNode(node.id)}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!isStart}
        className={cn('!h-3 !w-3 !border-2 !border-[var(--lux-surface)] !bg-[var(--lux-primary)]', isStart && '!hidden')}
      />

      <div className="flex items-center gap-2 border-b border-[var(--lux-line)] px-3 py-2">
        <span className={cn('grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border', definition.accentClass)}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase text-[var(--lux-muted-soft)]">
            {definition.label}
          </p>
          <input
            aria-label={`${definition.label} title`}
            value={node.content.title ?? ''}
            disabled={data.locked}
            placeholder={definition.label}
            onChange={(event) => updateContent({ title: event.target.value })}
            className="nodrag w-full truncate bg-transparent text-sm font-semibold text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] disabled:opacity-60"
          />
        </div>
        {!isStart && (
          <button
            type="button"
            disabled={data.locked}
            onClick={(event) => {
              event.stopPropagation()
              data.onDeleteNode(node.id)
            }}
            className="nodrag grid h-7 w-7 place-items-center rounded-md text-[var(--lux-muted-soft)] opacity-0 transition hover:bg-red-500/12 hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
            aria-label="Delete node"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="space-y-3 px-3 py-3">
        {(node.speaker || node.type === 'dialogue' || node.type === 'choice') && (
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[var(--lux-primary-soft)] text-xs font-bold text-[var(--lux-primary-muted)]">
              {(node.speaker?.name ?? 'S').slice(0, 1).toUpperCase()}
            </div>
            <input
              aria-label="Speaker name"
              value={node.speaker?.name ?? ''}
              disabled={data.locked}
              placeholder="Speaker"
              onChange={(event) =>
                data.onUpdateNode(node.id, {
                  speaker: {
                    ...node.speaker,
                    name: event.target.value,
                  },
                })
              }
              className="nodrag min-w-0 flex-1 rounded-md border border-transparent bg-white/4 px-2 py-1 text-xs text-[var(--lux-text)] outline-none focus:border-[var(--lux-primary)] disabled:opacity-60"
            />
          </div>
        )}

        <textarea
          aria-label={`${definition.label} body`}
          value={node.content.body ?? ''}
          disabled={data.locked}
          placeholder={isChoice ? 'How do you respond?' : isStart ? 'Optional introduction text' : 'Type content...'}
          rows={isChoice ? 2 : 3}
          onChange={(event) => updateContent({ body: event.target.value })}
          className="nodrag w-full resize-none rounded-md border border-transparent bg-white/4 px-2.5 py-2 text-sm leading-5 text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] disabled:opacity-60"
        />

        {isChoice && (
          <div className="space-y-2">
            {node.choices.map((choice, index) => (
              <div key={choice.id} className="relative flex items-center gap-2 rounded-md border border-[var(--lux-line)] bg-white/3 px-2 py-1.5">
                <span className="text-[10px] font-semibold text-[var(--lux-muted-soft)]">{index + 1}</span>
                <input
                  aria-label={`Choice ${index + 1}`}
                  value={choice.text}
                  disabled={data.locked}
                  onChange={(event) =>
                    data.onUpdateNode(node.id, {
                      choices: node.choices.map((item) =>
                        item.id === choice.id ? { ...item, text: event.target.value } : item,
                      ),
                    })
                  }
                  className="nodrag min-w-0 flex-1 bg-transparent text-xs text-[var(--lux-text)] outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={data.locked}
                  onClick={(event) => {
                    event.stopPropagation()
                    data.onQuickAdd(node.id, choice.id)
                  }}
                  className="nodrag grid h-6 w-6 place-items-center rounded text-[var(--lux-muted-soft)] hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)] disabled:opacity-40"
                  aria-label="Add step for choice"
                >
                  <Plus size={12} />
                </button>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={choice.id}
                  className="!right-[-7px] !h-3 !w-3 !border-2 !border-[var(--lux-surface)] !bg-[var(--lux-gold)]"
                  style={{ top: `${48 + index * 42}px` }}
                />
              </div>
            ))}
          </div>
        )}

        {!isChoice && (
          <button
            type="button"
            disabled={data.locked}
            onClick={(event) => {
              event.stopPropagation()
              data.onQuickAdd(node.id)
            }}
            className="nodrag inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-[var(--lux-line)] px-2.5 text-xs font-semibold text-[var(--lux-muted)] transition hover:border-[var(--lux-primary)] hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-primary-muted)] disabled:opacity-40"
          >
            <Plus size={13} />
            Add Next Step
          </button>
        )}
      </div>

      {!isChoice && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-[var(--lux-surface)] !bg-[var(--lux-primary)]"
        />
      )}
    </div>
  )
})
