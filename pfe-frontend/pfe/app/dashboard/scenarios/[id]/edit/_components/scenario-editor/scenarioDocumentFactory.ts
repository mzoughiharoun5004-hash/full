import type {
  ScenarioConnection,
  ScenarioDocument,
  ScenarioEffect,
  ScenarioFlowNode,
  ScenarioNodeType,
  ScenarioScoring,
} from '@/types'

export const scenarioDocumentStorageKey = (scenarioId: string) =>
  `scenario-document:${scenarioId}:draft`

export function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const defaultScenarioSettings: ScenarioDocument['settings'] = {
  autosave: true,
  allowBacktracking: true,
  showProgress: true,
  shuffleChoices: false,
  completionTracking: true,
  scoreTracking: true,
}

export const defaultScenarioScoring: ScenarioScoring = {
  enabled: true,
  maxScore: 100,
  passingScore: 80,
  completionMode: 'visited_end',
}

export function createScenarioNode(
  type: ScenarioNodeType,
  position: { x: number; y: number },
): ScenarioFlowNode {
  const id = uid(type)
  const base: ScenarioFlowNode = {
    id,
    type,
    content: {
      title: defaultTitleFor(type),
      body: defaultBodyFor(type),
      tone: 'neutral',
    },
    choices: [],
    feedback: {},
    media: [],
    conditions: [],
    effects: [],
    position,
  }

  if (type === 'start') {
    return {
      ...base,
      speaker: { name: 'Narrator', role: 'Guide' },
      content: {
        title: 'Start',
        body: 'This is where the scenario begins.',
        tone: 'friendly',
      },
      choices: [
        {
          id: uid('choice'),
          text: 'Add next step',
          scoreDelta: 0,
        },
      ],
    }
  }

  if (type === 'dialogue' || type === 'choice' || type === 'feedback') {
    base.speaker = { name: 'Speaker', role: 'Character' }
  }

  if (type === 'choice') {
    base.choices = [
      { id: uid('choice'), text: 'First response', scoreDelta: 0 },
      { id: uid('choice'), text: 'Second response', scoreDelta: 0 },
    ]
  }

  if (type === 'ending') {
    base.effects = [{ id: uid('effect'), type: 'complete', value: true }]
  }

  if (type === 'score') {
    base.effects = [{ id: uid('effect'), type: 'increment_score', value: 10 }]
  }

  return base
}

export function createBlankScenarioDocument(
  scenarioId: string,
  title = 'Untitled Scenario',
  description = '',
): ScenarioDocument {
  const startNode = createScenarioNode('start', { x: 120, y: 160 })

  return {
    schemaVersion: 1,
    scenarioId,
    title,
    description,
    settings: defaultScenarioSettings,
    nodes: [startNode],
    connections: [],
    variables: [],
    scoring: defaultScenarioScoring,
    metadata: {
      source: 'blank',
      version: 1,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aiReady: true,
      scormReady: true,
    },
  }
}

export function normalizeScenarioDocument(
  document: ScenarioDocument | null | undefined,
  scenarioId: string,
  fallbackTitle = 'Untitled Scenario',
  fallbackDescription = '',
): ScenarioDocument {
  // Normalize loaded documents defensively because saved drafts, API payloads,
  // and future generated documents may arrive with partial editor fields.
  const base = document ?? createBlankScenarioDocument(scenarioId, fallbackTitle, fallbackDescription)
  const startNodes = base.nodes.filter((node) => node.type === 'start')
  const primaryStart = startNodes[0] ?? createScenarioNode('start', { x: 120, y: 160 })
  const nonStartNodes = base.nodes.filter((node) => node.type !== 'start')
  const nodes = [primaryStart, ...nonStartNodes].map((node) => ({
    ...node,
    content: {
      title: node.content?.title ?? defaultTitleFor(node.type),
      body: node.content?.body ?? '',
      tone: node.content?.tone ?? 'neutral',
      narration: node.content?.narration,
    },
    choices: node.choices ?? [],
    media: node.media ?? [],
    conditions: node.conditions ?? [],
    effects: node.effects ?? [],
    position: node.position ?? { x: 120, y: 160 },
  }))
  const nodeIds = new Set(nodes.map((node) => node.id))

  return {
    ...base,
    schemaVersion: 1,
    scenarioId: base.scenarioId || scenarioId,
    title: base.title || fallbackTitle,
    description: base.description ?? fallbackDescription,
    settings: { ...defaultScenarioSettings, ...base.settings },
    nodes,
    connections: (base.connections ?? []).filter(
      (connection) =>
        nodeIds.has(connection.sourceNodeId) &&
        nodeIds.has(connection.targetNodeId) &&
        connection.sourceNodeId !== connection.targetNodeId,
    ),
    variables: base.variables ?? [],
    scoring: { ...defaultScenarioScoring, ...base.scoring },
    metadata: {
      source: base.metadata?.source ?? 'blank',
      version: base.metadata?.version ?? 1,
      generatedAt: base.metadata?.generatedAt ?? new Date().toISOString(),
      updatedAt: base.metadata?.updatedAt,
      aiReady: true,
      scormReady: true,
    },
  }
}

export function createScenarioConnection(
  sourceNodeId: string,
  targetNodeId: string,
  sourceChoiceId?: string,
  label?: string,
): ScenarioConnection {
  return {
    id: uid('connection'),
    sourceNodeId,
    targetNodeId,
    sourceChoiceId,
    label,
    conditions: [],
    effects: [],
  }
}

export function createChoiceEffect(scoreDelta: number): ScenarioEffect | undefined {
  if (!scoreDelta) return undefined
  return {
    id: uid('effect'),
    type: 'increment_score',
    value: scoreDelta,
  }
}

export function defaultTitleFor(type: ScenarioNodeType) {
  const labels: Record<ScenarioNodeType, string> = {
    start: 'Start',
    dialogue: 'Dialogue',
    choice: 'Choice',
    feedback: 'Feedback',
    information: 'Information',
    decision: 'Decision',
    score: 'Score',
    ending: 'Ending',
    media: 'Media',
    variable: 'Variable',
    conditional_branch: 'Conditional branch',
  }
  return labels[type]
}

export function defaultBodyFor(type: ScenarioNodeType) {
  const body: Record<ScenarioNodeType, string> = {
    start: 'This is where the scenario begins.',
    dialogue: '',
    choice: 'How do you respond?',
    feedback: 'Add feedback for this path.',
    information: 'Add supporting information.',
    decision: 'Evaluate a condition and route the learner.',
    score: 'Apply score changes.',
    ending: 'Scenario complete.',
    media: 'Add image, audio, video, or document context.',
    variable: 'Set or update a scenario variable.',
    conditional_branch: 'Route by learner state or score.',
  }
  return body[type]
}

export function loadScenarioDocumentDraft(
  scenarioId: string,
  serverDocument: ScenarioDocument,
): ScenarioDocument {
  if (typeof window === 'undefined') return serverDocument

  try {
    const raw = window.localStorage.getItem(scenarioDocumentStorageKey(scenarioId))
    if (!raw) return serverDocument

    const draft = JSON.parse(raw) as { document?: ScenarioDocument; savedAt?: string }
    if (!draft.document) return serverDocument

    const serverUpdated = Date.parse(serverDocument.metadata.updatedAt ?? serverDocument.metadata.generatedAt ?? '')
    const draftUpdated = Date.parse(draft.document.metadata.updatedAt ?? draft.savedAt ?? '')

    if (Number.isFinite(draftUpdated) && (!Number.isFinite(serverUpdated) || draftUpdated > serverUpdated)) {
      return normalizeScenarioDocument(draft.document, scenarioId, serverDocument.title, serverDocument.description)
    }
  } catch {
    return serverDocument
  }

  return serverDocument
}
