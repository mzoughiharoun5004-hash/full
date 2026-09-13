'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type {
  ScenarioChoice,
  ScenarioConnection,
  ScenarioDocument,
  ScenarioFlowNode,
  ScenarioNodeType,
  ScenarioVariable,
} from '@/types'
import { getNodeDefinition } from './scenarioNodeRegistry'
import { uid } from './scenarioDocumentFactory'

const selectClass =
  'h-9 w-full rounded-lg border border-[var(--lux-line)] bg-white/5 px-3 text-xs text-[var(--lux-text)] outline-none focus:border-[var(--lux-primary)]'

const textareaClass =
  'w-full resize-none rounded-lg border border-[var(--lux-line)] bg-white/5 px-3 py-2 text-sm text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] focus:ring-2 focus:ring-[var(--lux-primary)]/20 disabled:opacity-60'

interface ScenarioPropertiesPanelProps {
  document: ScenarioDocument
  selectedNode?: ScenarioFlowNode | null
  selectedConnection?: ScenarioConnection | null
  locked?: boolean
  onUpdateDocument: (updater: (document: ScenarioDocument) => ScenarioDocument) => void
  onUpdateNode: (nodeId: string, patch: Partial<ScenarioFlowNode>) => void
  onUpdateConnection: (connectionId: string, patch: Partial<ScenarioConnection>) => void
  onDeleteConnection: (connectionId: string) => void
}

export function ScenarioPropertiesPanel({
  document,
  selectedNode,
  selectedConnection,
  locked,
  onUpdateDocument,
  onUpdateNode,
  onUpdateConnection,
  onDeleteConnection,
}: ScenarioPropertiesPanelProps) {
  return (
    <aside className="w-80 flex-shrink-0 border-l border-[var(--lux-line)] bg-[var(--lux-surface)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[var(--lux-line)] px-4 py-3">
          <p className="text-xs font-semibold uppercase text-[var(--lux-muted-soft)]">Properties</p>
          <h2 className="mt-1 truncate text-sm font-semibold text-[var(--lux-text)]">
            {selectedNode
              ? getNodeDefinition(selectedNode.type).label
              : selectedConnection
                ? 'Branch'
                : 'Scenario'}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 lux-scrollbar">
          {selectedNode ? (
            <NodeProperties node={selectedNode} locked={locked} onUpdateNode={onUpdateNode} />
          ) : selectedConnection ? (
            <ConnectionProperties
              connection={selectedConnection}
              locked={locked}
              onUpdateConnection={onUpdateConnection}
              onDeleteConnection={onDeleteConnection}
            />
          ) : (
            <ScenarioSettings document={document} locked={locked} onUpdateDocument={onUpdateDocument} />
          )}
        </div>
      </div>
    </aside>
  )
}

function ScenarioSettings({
  document,
  locked,
  onUpdateDocument,
}: {
  document: ScenarioDocument
  locked?: boolean
  onUpdateDocument: (updater: (document: ScenarioDocument) => ScenarioDocument) => void
}) {
  const updateSettings = (patch: Partial<ScenarioDocument['settings']>) =>
    onUpdateDocument((current) => ({ ...current, settings: { ...current.settings, ...patch } }))

  const updateScoring = (patch: Partial<ScenarioDocument['scoring']>) =>
    onUpdateDocument((current) => ({ ...current, scoring: { ...current.scoring, ...patch } }))

  const addVariable = () => {
    const variable: ScenarioVariable = {
      id: uid('variable'),
      name: 'new_variable',
      type: 'string',
      defaultValue: '',
    }
    onUpdateDocument((current) => ({ ...current, variables: [...current.variables, variable] }))
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <Input
          id="scenario-title"
          label="Title"
          value={document.title}
          disabled={locked}
          onChange={(event) => onUpdateDocument((current) => ({ ...current, title: event.target.value }))}
        />
        <div>
          <label className="text-sm font-medium text-[var(--lux-text)]">Description</label>
          <textarea
            value={document.description ?? ''}
            disabled={locked}
            onChange={(event) => onUpdateDocument((current) => ({ ...current, description: event.target.value }))}
            rows={4}
            className={cn(textareaClass, 'mt-1')}
          />
        </div>
      </section>

      <PanelSection title="Learner Experience">
        <ToggleRow
          label="Show progress"
          checked={document.settings.showProgress}
          disabled={locked}
          onChange={(checked) => updateSettings({ showProgress: checked })}
        />
        <ToggleRow
          label="Allow backtracking"
          checked={document.settings.allowBacktracking}
          disabled={locked}
          onChange={(checked) => updateSettings({ allowBacktracking: checked })}
        />
        <ToggleRow
          label="Shuffle choices"
          checked={document.settings.shuffleChoices}
          disabled={locked}
          onChange={(checked) => updateSettings({ shuffleChoices: checked })}
        />
      </PanelSection>

      <PanelSection title="Tracking">
        <ToggleRow
          label="Completion tracking"
          checked={document.settings.completionTracking}
          disabled={locked}
          onChange={(checked) => updateSettings({ completionTracking: checked })}
        />
        <ToggleRow
          label="Score tracking"
          checked={document.settings.scoreTracking}
          disabled={locked}
          onChange={(checked) => updateSettings({ scoreTracking: checked })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            id="scenario-max-score"
            label="Max score"
            type="number"
            value={String(document.scoring.maxScore ?? '')}
            disabled={locked}
            onChange={(event) => updateScoring({ maxScore: Number(event.target.value) })}
          />
          <Input
            id="scenario-pass-score"
            label="Passing"
            type="number"
            value={String(document.scoring.passingScore ?? '')}
            disabled={locked}
            onChange={(event) => updateScoring({ passingScore: Number(event.target.value) })}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--lux-text)]">Completion</label>
          <select
            value={document.scoring.completionMode}
            disabled={locked}
            onChange={(event) => updateScoring({ completionMode: event.target.value as ScenarioDocument['scoring']['completionMode'] })}
            className={cn(selectClass, 'mt-1')}
          >
            <option value="visited_end">Visited ending</option>
            <option value="score">Score threshold</option>
            <option value="manual">Manual trigger</option>
          </select>
        </div>
      </PanelSection>

      <PanelSection title="Variables">
        <div className="space-y-2">
          {document.variables.map((variable) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              locked={locked}
              onChange={(patch) =>
                onUpdateDocument((current) => ({
                  ...current,
                  variables: current.variables.map((item) =>
                    item.id === variable.id ? { ...item, ...patch } : item,
                  ),
                }))
              }
              onDelete={() =>
                onUpdateDocument((current) => ({
                  ...current,
                  variables: current.variables.filter((item) => item.id !== variable.id),
                }))
              }
            />
          ))}
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={addVariable}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--lux-line)] px-2.5 text-xs font-semibold text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] disabled:opacity-40"
        >
          <Plus size={13} />
          Add variable
        </button>
      </PanelSection>
    </div>
  )
}

function NodeProperties({
  node,
  locked,
  onUpdateNode,
}: {
  node: ScenarioFlowNode
  locked?: boolean
  onUpdateNode: (nodeId: string, patch: Partial<ScenarioFlowNode>) => void
}) {
  const updateContent = (patch: Partial<ScenarioFlowNode['content']>) =>
    onUpdateNode(node.id, { content: { ...node.content, ...patch } })

  const updateSpeaker = (patch: Partial<NonNullable<ScenarioFlowNode['speaker']>>) =>
    onUpdateNode(node.id, {
      speaker: {
        name: node.speaker?.name ?? '',
        ...node.speaker,
        ...patch,
      },
    })

  const updateChoices = (choices: ScenarioChoice[]) => onUpdateNode(node.id, { choices })

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <Input
          id={`${node.id}-title`}
          label="Title"
          value={node.content.title ?? ''}
          disabled={locked}
          onChange={(event) => updateContent({ title: event.target.value })}
        />
        <div>
          <label className="text-sm font-medium text-[var(--lux-text)]">Content</label>
          <textarea
            value={node.content.body ?? ''}
            disabled={locked}
            onChange={(event) => updateContent({ body: event.target.value })}
            rows={5}
            className={cn(textareaClass, 'mt-1')}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--lux-text)]">Tone</label>
          <select
            value={node.content.tone ?? 'neutral'}
            disabled={locked}
            onChange={(event) => updateContent({ tone: event.target.value as NonNullable<ScenarioFlowNode['content']['tone']> })}
            className={cn(selectClass, 'mt-1')}
          >
            <option value="neutral">Neutral</option>
            <option value="friendly">Friendly</option>
            <option value="concerned">Concerned</option>
            <option value="confident">Confident</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </section>

      {supportsSpeaker(node.type) && (
        <PanelSection title="Speaker">
          <Input
            id={`${node.id}-speaker`}
            label="Name"
            value={node.speaker?.name ?? ''}
            disabled={locked}
            onChange={(event) => updateSpeaker({ name: event.target.value })}
          />
          <Input
            id={`${node.id}-role`}
            label="Role"
            value={node.speaker?.role ?? ''}
            disabled={locked}
            onChange={(event) => updateSpeaker({ role: event.target.value })}
          />
          <Input
            id={`${node.id}-avatar`}
            label="Avatar URL"
            value={node.speaker?.avatarUrl ?? ''}
            disabled={locked}
            onChange={(event) => updateSpeaker({ avatarUrl: event.target.value })}
          />
        </PanelSection>
      )}

      {node.type === 'choice' && (
        <PanelSection title="Choices">
          <div className="space-y-2">
            {node.choices.map((choice, index) => (
              <div key={choice.id} className="rounded-lg border border-[var(--lux-line)] bg-white/3 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--lux-muted-soft)]">{index + 1}</span>
                  <input
                    value={choice.text}
                    disabled={locked}
                    onChange={(event) =>
                      updateChoices(node.choices.map((item) =>
                        item.id === choice.id ? { ...item, text: event.target.value } : item,
                      ))
                    }
                    className="min-w-0 flex-1 rounded-md border border-[var(--lux-line)] bg-white/5 px-2 py-1.5 text-xs text-[var(--lux-text)] outline-none focus:border-[var(--lux-primary)] disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => updateChoices(node.choices.filter((item) => item.id !== choice.id))}
                    className="grid h-7 w-7 place-items-center rounded-md text-[var(--lux-muted-soft)] hover:bg-red-500/12 hover:text-red-400 disabled:opacity-40"
                    aria-label="Delete choice"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    id={`${choice.id}-score`}
                    label="Score"
                    type="number"
                    value={String(choice.scoreDelta ?? 0)}
                    disabled={locked}
                    onChange={(event) =>
                      updateChoices(node.choices.map((item) =>
                        item.id === choice.id ? { ...item, scoreDelta: Number(event.target.value) } : item,
                      ))
                    }
                  />
                  <Input
                    id={`${choice.id}-destination`}
                    label="Target"
                    value={choice.targetNodeId ?? ''}
                    disabled={locked}
                    onChange={(event) =>
                      updateChoices(node.choices.map((item) =>
                        item.id === choice.id ? { ...item, targetNodeId: event.target.value || undefined } : item,
                      ))
                    }
                  />
                </div>
                <textarea
                  value={choice.feedback ?? ''}
                  disabled={locked}
                  placeholder="Feedback"
                  onChange={(event) =>
                    updateChoices(node.choices.map((item) =>
                      item.id === choice.id ? { ...item, feedback: event.target.value } : item,
                    ))
                  }
                  rows={2}
                  className={cn(textareaClass, 'mt-2 text-xs')}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={locked}
            onClick={() => updateChoices([...node.choices, { id: uid('choice'), text: 'New response', scoreDelta: 0 }])}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--lux-line)] px-2.5 text-xs font-semibold text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] disabled:opacity-40"
          >
            <Plus size={13} />
            Add choice
          </button>
        </PanelSection>
      )}

      <PanelSection title="Advanced">
        <div className="rounded-lg border border-dashed border-[var(--lux-line)] bg-white/3 p-3 text-xs leading-5 text-[var(--lux-muted-soft)]">
          Conditions, effects, narration, media attachments, and AI actions are already represented in JSON and reserved for the next implementation layer.
        </div>
      </PanelSection>
    </div>
  )
}

function ConnectionProperties({
  connection,
  locked,
  onUpdateConnection,
  onDeleteConnection,
}: {
  connection: ScenarioConnection
  locked?: boolean
  onUpdateConnection: (connectionId: string, patch: Partial<ScenarioConnection>) => void
  onDeleteConnection: (connectionId: string) => void
}) {
  return (
    <div className="space-y-4">
      <Input
        id={`${connection.id}-label`}
        label="Label"
        value={connection.label ?? ''}
        disabled={locked}
        onChange={(event) => onUpdateConnection(connection.id, { label: event.target.value })}
      />
      <div className="rounded-lg border border-[var(--lux-line)] bg-white/3 p-3 text-xs leading-5 text-[var(--lux-muted-soft)]">
        Branch conditions and effects are stored as structured JSON for future AI generation, analytics, and SCORM suspend data.
      </div>
      <button
        type="button"
        disabled={locked}
        onClick={() => onDeleteConnection(connection.id)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-red-500/25 bg-red-500/10 px-3 text-xs font-semibold text-red-400 hover:bg-red-500/15 disabled:opacity-40"
      >
        <Trash2 size={13} />
        Delete branch
      </button>
    </div>
  )
}

function VariableRow({
  variable,
  locked,
  onChange,
  onDelete,
}: {
  variable: ScenarioVariable
  locked?: boolean
  onChange: (patch: Partial<ScenarioVariable>) => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-lg border border-[var(--lux-line)] bg-white/3 p-2">
      <div className="flex items-center gap-2">
        <input
          value={variable.name}
          disabled={locked}
          onChange={(event) => onChange({ name: event.target.value })}
          className="min-w-0 flex-1 rounded-md border border-[var(--lux-line)] bg-white/5 px-2 py-1.5 text-xs text-[var(--lux-text)] outline-none focus:border-[var(--lux-primary)] disabled:opacity-60"
        />
        <button
          type="button"
          disabled={locked}
          onClick={onDelete}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--lux-muted-soft)] hover:bg-red-500/12 hover:text-red-400 disabled:opacity-40"
          aria-label="Delete variable"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <select
        value={variable.type}
        disabled={locked}
        onChange={(event) => onChange({ type: event.target.value as ScenarioVariable['type'] })}
        className={cn(selectClass, 'mt-2')}
      >
        <option value="string">Text</option>
        <option value="number">Number</option>
        <option value="boolean">True or false</option>
      </select>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-[var(--lux-text)]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--lux-primary)] disabled:opacity-40"
      />
    </label>
  )
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-[var(--lux-line)] pt-4">
      <h3 className="text-xs font-semibold uppercase text-[var(--lux-muted-soft)]">{title}</h3>
      {children}
    </section>
  )
}

function supportsSpeaker(type: ScenarioNodeType) {
  return type === 'start' || type === 'dialogue' || type === 'choice' || type === 'feedback'
}
