'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type OnConnect,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from '@xyflow/react'
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CloudOff,
  Download,
  Eye,
  Loader2,
  PanelLeft,
  Plus,
  Redo2,
  Save,
  Settings,
  Undo2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { scenariosApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSocket, type CollaborationUser, type ScenarioCursorEvent, type ScenarioLockInfo } from '@/context/SocketContext'
import { useAuth } from '@/context/AuthContext'
import type {
  Scenario,
  ScenarioConnection,
  ScenarioDocument,
  ScenarioFlowNode as ScenarioFlowNodeModel,
  ScenarioNodeType,
} from '@/types'
import {
  createScenarioConnection,
  createScenarioNode,
  loadScenarioDocumentDraft,
  normalizeScenarioDocument,
} from './scenarioDocumentFactory'
import { ScenarioFlowNode, type ScenarioCanvasNode } from './ScenarioFlowNode'
import { ScenarioNodeLibrary } from './ScenarioNodeLibrary'
import { ScenarioPropertiesPanel } from './ScenarioPropertiesPanel'
import { ScenarioRuntimePreview } from './ScenarioRuntimePreview'
import { creatableScenarioNodeDefinitions } from './scenarioNodeRegistry'
import { useScenarioAutosave } from './useScenarioAutosave'
import { useScenarioHistory } from './useScenarioHistory'

interface ScenarioCreationEditorProps {
  scenarioId: string
  scenario?: Scenario
  isSocketConnected: boolean
  collaborators: CollaborationUser[]
  documentLock?: ScenarioLockInfo
  remoteCursors?: ScenarioCursorEvent[]
}

const nodeTypes: NodeTypes = {
  scenarioNode: ScenarioFlowNode,
}

type AddPickerState = {
  sourceNodeId?: string
  sourceChoiceId?: string
  flowPosition: { x: number; y: number }
  screenPosition: { x: number; y: number }
} | null

export function ScenarioCreationEditor(props: ScenarioCreationEditorProps) {
  return (
    <ReactFlowProvider>
      <ScenarioCreationEditorInner {...props} />
    </ReactFlowProvider>
  )
}

function ScenarioCreationEditorInner({
  scenarioId,
  scenario,
  isSocketConnected,
  collaborators,
  documentLock,
}: ScenarioCreationEditorProps) {
  const qc = useQueryClient()
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null)
  const reactFlowInstanceRef = useRef<ReactFlowInstance<ScenarioCanvasNode, Edge> | null>(null)
  const { broadcastScenarioEdit, lockElement, unlockElement } = useSocket()
  const { user } = useAuth()
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [addPicker, setAddPicker] = useState<AddPickerState>(null)
  const claimedLockRef = useRef(false)
  const elementId = `scenario-document:${scenarioId}`
  const lockedByOther = !!documentLock && String(documentLock.user.id) !== String(user?.id ?? '')

  const { data, isLoading } = useQuery<ScenarioDocument>({
    queryKey: ['scenario-document', scenarioId],
    queryFn: () => scenariosApi.getScenarioDocument(scenarioId).then((response) => response.data),
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--lux-bg)]">
        <Spinner />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--lux-bg)] text-sm text-[var(--lux-muted)]">
        No scenario document found.
      </div>
    )
  }

  const initialDocument = normalizeScenarioDocument(
    loadScenarioDocumentDraft(scenarioId, data),
    scenarioId,
    scenario?.title,
    scenario?.description,
  )

  return (
    <ScenarioDocumentDesigner
      key={initialDocument.scenarioId}
      scenarioId={scenarioId}
      scenario={scenario}
      initialDocument={initialDocument}
      isSocketConnected={isSocketConnected}
      collaborators={collaborators}
      documentLock={documentLock}
      lockedByOther={lockedByOther}
      libraryCollapsed={libraryCollapsed}
      setLibraryCollapsed={setLibraryCollapsed}
      selectedNodeId={selectedNodeId}
      setSelectedNodeId={setSelectedNodeId}
      selectedConnectionId={selectedConnectionId}
      setSelectedConnectionId={setSelectedConnectionId}
      previewOpen={previewOpen}
      setPreviewOpen={setPreviewOpen}
      addPicker={addPicker}
      setAddPicker={setAddPicker}
      reactFlowWrapperRef={reactFlowWrapperRef}
      reactFlowInstanceRef={reactFlowInstanceRef}
      elementId={elementId}
      claimedLockRef={claimedLockRef}
      qc={qc}
      broadcastScenarioEdit={broadcastScenarioEdit}
      lockElement={lockElement}
      unlockElement={unlockElement}
    />
  )
}

function ScenarioDocumentDesigner({
  scenarioId,
  scenario,
  initialDocument,
  isSocketConnected,
  collaborators,
  documentLock,
  lockedByOther,
  libraryCollapsed,
  setLibraryCollapsed,
  selectedNodeId,
  setSelectedNodeId,
  selectedConnectionId,
  setSelectedConnectionId,
  previewOpen,
  setPreviewOpen,
  addPicker,
  setAddPicker,
  reactFlowWrapperRef,
  reactFlowInstanceRef,
  elementId,
  claimedLockRef,
  qc,
  broadcastScenarioEdit,
  lockElement,
  unlockElement,
}: {
  scenarioId: string
  scenario?: Scenario
  initialDocument: ScenarioDocument
  isSocketConnected: boolean
  collaborators: CollaborationUser[]
  documentLock?: ScenarioLockInfo
  lockedByOther: boolean
  libraryCollapsed: boolean
  setLibraryCollapsed: (value: boolean | ((current: boolean) => boolean)) => void
  selectedNodeId: string | null
  setSelectedNodeId: (value: string | null) => void
  selectedConnectionId: string | null
  setSelectedConnectionId: (value: string | null) => void
  previewOpen: boolean
  setPreviewOpen: (value: boolean) => void
  addPicker: AddPickerState
  setAddPicker: (value: AddPickerState) => void
  reactFlowWrapperRef: MutableRefObject<HTMLDivElement | null>
  reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<ScenarioCanvasNode, Edge> | null>
  elementId: string
  claimedLockRef: MutableRefObject<boolean>
  qc: ReturnType<typeof useQueryClient>
  broadcastScenarioEdit: ReturnType<typeof useSocket>['broadcastScenarioEdit']
  lockElement: ReturnType<typeof useSocket>['lockElement']
  unlockElement: ReturnType<typeof useSocket>['unlockElement']
}) {
  const history = useScenarioHistory(initialDocument)
  const document = history.state
  const selectedNode = document.nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedConnection = document.connections.find((connection) => connection.id === selectedConnectionId) ?? null

  useEffect(() => {
    if (!lockedByOther && !claimedLockRef.current) {
      claimedLockRef.current = true
      lockElement({ scenarioId, elementId, elementType: 'scenario-document' })
    }

    return () => {
      if (claimedLockRef.current) {
        unlockElement({ scenarioId, elementId, elementType: 'scenario-document' })
        claimedLockRef.current = false
      }
    }
  }, [claimedLockRef, elementId, lockElement, lockedByOther, scenarioId, unlockElement])

  const autosave = useScenarioAutosave({
    scenarioId,
    document,
    enabled: !lockedByOther && document.settings.autosave,
    onSaved: (savedDocument) => {
      history.setState(normalizeScenarioDocument(savedDocument, scenarioId, document.title, document.description), false)
      qc.setQueryData(['scenario-document', scenarioId], savedDocument)
      qc.invalidateQueries({ queryKey: ['scenario', scenarioId] })
    },
    onRemoteEdit: () =>
      broadcastScenarioEdit({
        scenarioId,
        entityType: 'branching_scenario',
        entityId: scenarioId,
        action: 'update',
      }),
  })

  const updateDocument = useCallback(
    (updater: (current: ScenarioDocument) => ScenarioDocument, trackHistory = true) => {
      if (lockedByOther) return
      history.setState((current) => {
        const next = normalizeScenarioDocument(updater(current), scenarioId, current.title, current.description)
        return {
          ...next,
          metadata: {
            ...next.metadata,
            updatedAt: new Date().toISOString(),
          },
        }
      }, trackHistory)
    },
    [history, lockedByOther, scenarioId],
  )

  const updateNode = useCallback(
    (nodeId: string, patch: Partial<ScenarioFlowNodeModel>) => {
      updateDocument((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                ...patch,
                content: patch.content ? { ...node.content, ...patch.content } : node.content,
                speaker: patch.speaker ? { ...node.speaker, ...patch.speaker } : patch.speaker === null ? undefined : node.speaker,
              }
            : node,
        ),
      }))
    },
    [updateDocument],
  )

  const updateConnection = useCallback(
    (connectionId: string, patch: Partial<ScenarioConnection>) => {
      updateDocument((current) => ({
        ...current,
        connections: current.connections.map((connection) =>
          connection.id === connectionId ? { ...connection, ...patch } : connection,
        ),
      }))
    },
    [updateDocument],
  )

  const deleteConnection = useCallback(
    (connectionId: string) => {
      updateDocument((current) => ({
        ...current,
        connections: current.connections.filter((connection) => connection.id !== connectionId),
      }))
      setSelectedConnectionId(null)
    },
    [setSelectedConnectionId, updateDocument],
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      const node = document.nodes.find((item) => item.id === nodeId)
      if (!node || node.type === 'start') return
      updateDocument((current) => ({
        ...current,
        nodes: current.nodes.filter((item) => item.id !== nodeId),
        connections: current.connections.filter(
          (connection) => connection.sourceNodeId !== nodeId && connection.targetNodeId !== nodeId,
        ),
      }))
      setSelectedNodeId(null)
    },
    [document.nodes, setSelectedNodeId, updateDocument],
  )

  const createNodeAt = useCallback(
    (
      type: ScenarioNodeType,
      position: { x: number; y: number },
      sourceNodeId?: string,
      sourceChoiceId?: string,
    ) => {
      const node = createScenarioNode(type, position)
      updateDocument((current) => {
        const connections = [...current.connections]
        const nodes = current.nodes.map((item) => {
          if (sourceChoiceId && item.id === sourceNodeId) {
            return {
              ...item,
              choices: item.choices.map((choice) =>
                choice.id === sourceChoiceId ? { ...choice, targetNodeId: node.id } : choice,
              ),
            }
          }
          return item
        })

        if (sourceNodeId) {
          connections.push(
            createScenarioConnection(
              sourceNodeId,
              node.id,
              sourceChoiceId,
              sourceChoiceId ? undefined : 'Continue',
            ),
          )
        }

        return {
          ...current,
          nodes: [...nodes, node],
          connections,
        }
      })
      setSelectedNodeId(node.id)
      setSelectedConnectionId(null)
      setAddPicker(null)
    },
    [setAddPicker, setSelectedConnectionId, setSelectedNodeId, updateDocument],
  )

  const createNodeFromLibrary = useCallback(
    (type: ScenarioNodeType) => {
      const nodeCount = document.nodes.length
      createNodeAt(type, {
        x: 180 + (nodeCount % 4) * 300,
        y: 140 + Math.floor(nodeCount / 4) * 220,
      })
    },
    [createNodeAt, document.nodes.length],
  )

  const openQuickAdd = useCallback(
    (sourceNodeId: string, sourceChoiceId?: string) => {
      const sourceNode = document.nodes.find((node) => node.id === sourceNodeId)
      if (!sourceNode) return
      setAddPicker({
        sourceNodeId,
        sourceChoiceId,
        flowPosition: {
          x: sourceNode.position.x + 340,
          y: sourceNode.position.y + (sourceChoiceId ? 80 : 0),
        },
        screenPosition: clampPickerPosition(
          reactFlowWrapperRef.current,
          flowToScreen(reactFlowInstanceRef.current, {
            x: sourceNode.position.x + 340,
            y: sourceNode.position.y + (sourceChoiceId ? 80 : 0),
          }),
        ),
      })
    },
    [document.nodes, reactFlowInstanceRef, reactFlowWrapperRef, setAddPicker],
  )

  const nodes = useMemo<ScenarioCanvasNode[]>(
    () =>
      document.nodes.map((node) => ({
        id: node.id,
        type: 'scenarioNode',
        position: node.position,
        draggable: !lockedByOther,
        deletable: node.type !== 'start',
        data: {
          node,
          selectedNodeId,
          locked: lockedByOther,
          onSelectNode: (nodeId: string) => {
            setSelectedNodeId(nodeId)
            setSelectedConnectionId(null)
          },
          onUpdateNode: updateNode,
          onQuickAdd: openQuickAdd,
          onDeleteNode: deleteNode,
        },
      })),
    [
      deleteNode,
      document.nodes,
      lockedByOther,
      openQuickAdd,
      selectedNodeId,
      setSelectedConnectionId,
      setSelectedNodeId,
      updateNode,
    ],
  )

  const edges = useMemo<Edge[]>(
    () =>
      document.connections.map((connection) => ({
        id: connection.id,
        source: connection.sourceNodeId,
        target: connection.targetNodeId,
        sourceHandle: connection.sourceChoiceId,
        label: connection.label,
        type: 'smoothstep',
        animated: true,
        selected: selectedConnectionId === connection.id,
        style: { stroke: selectedConnectionId === connection.id ? '#C6A765' : '#83BFA1', strokeWidth: 2 },
        labelStyle: { fill: 'var(--lux-text)', fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: 'var(--lux-surface)', fillOpacity: 0.92 },
      })),
    [document.connections, selectedConnectionId],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<ScenarioCanvasNode>[]) => {
      if (lockedByOther) return
      const documentChanges = changes.filter(
        (change) => change.type === 'position' || change.type === 'remove',
      )
      if (!documentChanges.length) return

      const hasRemoval = documentChanges.some((change) => change.type === 'remove')
      const nextNodes = applyNodeChanges(documentChanges, nodes)

      updateDocument((current) => {
        const positions = new Map(nextNodes.map((node) => [node.id, node.position]))
        const removedIds = hasRemoval
          ? new Set(
              current.nodes
                .filter((node) => node.type !== 'start' && !nextNodes.some((nextNode) => nextNode.id === node.id))
                .map((node) => node.id),
            )
          : new Set<string>()

        return {
          ...current,
          nodes: current.nodes
            .filter((node) => !removedIds.has(node.id))
            .map((node) => ({
              ...node,
              position: positions.get(node.id) ?? node.position,
            })),
          connections: current.connections.filter(
            (connection) => !removedIds.has(connection.sourceNodeId) && !removedIds.has(connection.targetNodeId),
          ),
        }
      }, !documentChanges.every((change) => change.type === 'position' && change.dragging))
    },
    [lockedByOther, nodes, updateDocument],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (lockedByOther) return
      const documentChanges = changes.filter((change) => change.type === 'remove')
      if (!documentChanges.length) return

      const nextEdges = applyEdgeChanges(documentChanges, edges)
      updateDocument((current) => {
        const ids = new Set(nextEdges.map((edge) => edge.id))
        return {
          ...current,
          connections: current.connections.filter((connection) => ids.has(connection.id)),
        }
      })
    },
    [edges, lockedByOther, updateDocument],
  )

  const onConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      if (lockedByOther || !connection.source || !connection.target || connection.source === connection.target) return

      updateDocument((current) => {
        const duplicate = current.connections.some(
          (item) =>
            item.sourceNodeId === connection.source &&
            item.targetNodeId === connection.target &&
            item.sourceChoiceId === connection.sourceHandle,
        )
        if (duplicate) return current

        const nextConnection = createScenarioConnection(
          connection.source,
          connection.target,
          connection.sourceHandle ?? undefined,
          connection.sourceHandle ? undefined : 'Continue',
        )

        return {
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === connection.source && connection.sourceHandle
              ? {
                  ...node,
                  choices: node.choices.map((choice) =>
                    choice.id === connection.sourceHandle
                      ? { ...choice, targetNodeId: connection.target ?? undefined }
                      : choice,
                  ),
                }
              : node,
          ),
          connections: [...current.connections, nextConnection],
        }
      })
      setSelectedNodeId(null)
      setSelectedConnectionId(null)
    },
    [lockedByOther, setSelectedConnectionId, setSelectedNodeId, updateDocument],
  )

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams<ScenarioCanvasNode, Edge>) => {
      const nodeId = params.nodes[0]?.id ?? null
      const edgeId = params.edges[0]?.id ?? null
      setSelectedNodeId(nodeId)
      setSelectedConnectionId(nodeId ? null : edgeId)
    },
    [setSelectedConnectionId, setSelectedNodeId],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))

      if (isUndo) {
        event.preventDefault()
        history.undo()
      }

      if (isRedo) {
        event.preventDefault()
        history.redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [history])

  const saveIcon = autosave.status === 'saving'
    ? Loader2
    : autosave.status === 'offline' || autosave.status === 'error'
      ? CloudOff
      : autosave.status === 'saved'
        ? CheckCircle2
        : Save
  const SaveIcon = saveIcon

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--lux-bg)]">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-[var(--lux-line)] bg-[var(--lux-surface)] px-3">
        <Link
          href="/dashboard/scenarios"
          className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] transition hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)]"
          aria-label="Back to scenarios"
        >
          <ArrowLeft size={17} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--lux-muted-soft)]">
            <span>Courses</span>
            <span>/</span>
            <span className="truncate">{scenario?.title ?? document.title}</span>
          </div>
          <input
            value={document.title}
            disabled={lockedByOther}
            onChange={(event) => updateDocument((current) => ({ ...current, title: event.target.value }))}
            className="mt-0.5 w-full bg-transparent text-sm font-semibold text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] disabled:opacity-60"
            aria-label="Scenario title"
          />
        </div>

        {scenario && <StatusBadge status={scenario.status} />}

        <div className="hidden items-center gap-2 md:flex">
          <div className="flex -space-x-1">
            {collaborators.slice(0, 4).map((user, index) => (
              <div key={`${user.id}-${index}`} className="rounded-full ring-2 ring-[var(--lux-surface)]">
                <Avatar firstName={user.firstName} lastName={user.lastName} size="xs" />
              </div>
            ))}
          </div>
          <span className="text-[11px] text-[var(--lux-muted-soft)]">{collaborators.length} online</span>
          {isSocketConnected ? (
            <Wifi size={14} className="text-[var(--lux-primary-muted)]" aria-label="Socket connected" />
          ) : (
            <WifiOff size={14} className="text-[var(--lux-muted-soft)]" aria-label="Socket disconnected" />
          )}
        </div>

        <div className="hidden items-center gap-1 text-xs text-[var(--lux-muted)] sm:flex">
          <SaveIcon size={14} className={cn(autosave.status === 'saving' && 'animate-spin', autosave.status === 'error' && 'text-red-400')} />
          <span>{autosave.label}</span>
        </div>

        <div className="flex items-center gap-1">
          <ToolbarIconButton label="Undo" disabled={!history.canUndo || lockedByOther} onClick={history.undo}>
            <Undo2 size={15} />
          </ToolbarIconButton>
          <ToolbarIconButton label="Redo" disabled={!history.canRedo || lockedByOther} onClick={history.redo}>
            <Redo2 size={15} />
          </ToolbarIconButton>
          <ToolbarIconButton label="Preview" onClick={() => setPreviewOpen(true)}>
            <Eye size={15} />
          </ToolbarIconButton>
          <ToolbarIconButton label="AI assistant">
            <Bot size={15} />
          </ToolbarIconButton>
          <Button size="sm" variant="secondary" disabled>
            <Download size={14} className="mr-1" />
            Export
          </Button>
        </div>
      </div>

      {lockedByOther && (
        <div className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          This scenario is being edited by {documentLock?.user.firstName ?? documentLock?.user.email ?? 'another user'}.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ScenarioNodeLibrary
          collapsed={libraryCollapsed}
          onToggle={() => setLibraryCollapsed((current) => !current)}
          onCreateNode={createNodeFromLibrary}
        />

        <div ref={reactFlowWrapperRef} className="relative min-w-0 flex-1 bg-[var(--lux-bg-alt)]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onPaneClick={() => {
              setSelectedNodeId(null)
              setSelectedConnectionId(null)
              setAddPicker(null)
            }}
            onEdgeClick={(_, edge) => {
              setSelectedNodeId(null)
              setSelectedConnectionId(edge.id)
            }}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.35}
            maxZoom={1.5}
            snapToGrid
            snapGrid={[16, 16]}
            connectionRadius={34}
            nodesConnectable={!lockedByOther}
            nodesDraggable={!lockedByOther}
            elementsSelectable
            deleteKeyCode={lockedByOther ? null : ['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#83BFA1', strokeWidth: 2 },
            }}
            className="scenario-flow"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(246,240,230,0.18)" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              nodeColor={(node) => {
                const scenarioNode = (node.data as ScenarioCanvasNode['data']).node
                if (scenarioNode.type === 'start') return '#0F6B4A'
                if (scenarioNode.type === 'choice') return '#C6A765'
                if (scenarioNode.type === 'ending') return '#83BFA1'
                return '#2F4A43'
              }}
              maskColor="rgba(5,12,14,0.35)"
              style={{
                background: 'var(--lux-surface)',
                border: '1px solid var(--lux-line)',
                borderRadius: 8,
              }}
            />
            <Panel position="top-left">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)]/95 p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => setLibraryCollapsed((current) => !current)}
                  className="grid h-8 w-8 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)]"
                  aria-label="Toggle node library"
                >
                  <PanelLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const flowPosition = viewportCenter(reactFlowInstanceRef.current)
                    setAddPicker({
                      flowPosition,
                      screenPosition: clampPickerPosition(
                        reactFlowWrapperRef.current,
                        flowToScreen(reactFlowInstanceRef.current, flowPosition),
                      ),
                    })
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--lux-primary)] px-3 text-xs font-semibold text-[var(--lux-text-strong)] hover:bg-[var(--lux-primary-hover)]"
                >
                  <Plus size={14} />
                  Add Step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(null)
                    setSelectedConnectionId(null)
                  }}
                  className="grid h-8 w-8 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)]"
                  aria-label="Scenario settings"
                >
                  <Settings size={15} />
                </button>
              </div>
            </Panel>
          </ReactFlow>

          {addPicker && (
            <div
              className="absolute z-20 w-64 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-2 shadow-2xl"
              style={{
                left: addPicker.screenPosition.x,
                top: addPicker.screenPosition.y,
              }}
            >
              <div className="px-2 py-1.5 text-xs font-semibold uppercase text-[var(--lux-muted-soft)]">Add Step</div>
              <div className="grid gap-1">
                {creatableScenarioNodeDefinitions.slice(0, 6).map((definition) => {
                  const Icon = definition.icon
                  return (
                    <button
                      key={definition.type}
                      type="button"
                      onClick={() =>
                        createNodeAt(
                          definition.type,
                          addPicker.flowPosition,
                          addPicker.sourceNodeId,
                          addPicker.sourceChoiceId,
                        )
                      }
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--lux-text)] hover:bg-[var(--lux-overlay-hover)]"
                    >
                      <span className={cn('grid h-7 w-7 place-items-center rounded-md border', definition.accentClass)}>
                        <Icon size={13} />
                      </span>
                      <span>{definition.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <ScenarioPropertiesPanel
          document={document}
          selectedNode={selectedNode}
          selectedConnection={selectedConnection}
          locked={lockedByOther}
          onUpdateDocument={updateDocument}
          onUpdateNode={updateNode}
          onUpdateConnection={updateConnection}
          onDeleteConnection={deleteConnection}
        />
      </div>

      {previewOpen && <ScenarioRuntimePreview document={document} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

function ToolbarIconButton({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] transition hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] disabled:cursor-not-allowed disabled:opacity-35"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function viewportCenter(instance: ReactFlowInstance<ScenarioCanvasNode, Edge> | null) {
  if (!instance) return { x: 240, y: 160 }
  const viewport = instance.getViewport()
  return {
    x: -viewport.x / viewport.zoom + 260,
    y: -viewport.y / viewport.zoom + 180,
  }
}

function flowToScreen(
  instance: ReactFlowInstance<ScenarioCanvasNode, Edge> | null,
  position: { x: number; y: number },
) {
  if (!instance) return position
  const viewport = instance.getViewport()
  return {
    x: position.x * viewport.zoom + viewport.x,
    y: position.y * viewport.zoom + viewport.y,
  }
}

function clampPickerPosition(
  wrapper: HTMLDivElement | null,
  position: { x: number; y: number },
) {
  const width = wrapper?.clientWidth ?? 360
  const height = wrapper?.clientHeight ?? 360

  return {
    x: Math.min(Math.max(16, position.x), Math.max(16, width - 280)),
    y: Math.min(Math.max(16, position.y), Math.max(16, height - 320)),
  }
}
