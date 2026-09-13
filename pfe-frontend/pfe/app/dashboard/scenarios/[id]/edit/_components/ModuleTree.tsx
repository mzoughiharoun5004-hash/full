'use client'

import { CSSProperties, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  List,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { AxiosResponse } from 'axios'
import { scenariosApi } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { useSocket } from '@/context/SocketContext'
import { cn } from '@/lib/utils'
import type { Activity, ActivityType, Scenario, ScenarioModule, Sequence } from '@/types'

const activityTypeColors: Record<ActivityType, string> = {
  VIDEO: 'text-[#83BFA1]',
  TEXT: 'text-[#83BFA1]',
  QUIZ: 'text-amber-400',
  FILE: 'text-green-400',
  LINK: 'text-rose-400',
}

interface Props {
  scenarioId: string
  selectedActivityId: string | null
  onSelectActivity: (activityId: string, sequenceId: string, moduleId: string) => void
}

type PendingDelete =
  | { kind: 'module'; moduleId: string; title: string }
  | { kind: 'sequence'; moduleId: string; seqId: string; title: string }
  | { kind: 'activity'; moduleId: string; seqId: string; actId: string; title: string }

type ReorderLevel = 'module' | 'sequence' | 'activity'

interface ReorderPayload {
  level: ReorderLevel
  parentId: string
  oldIndex: number
  newIndex: number
  orderedIds: string[]
}

interface SortableItemProps {
  id: string
  children: (args: {
    attributes: ReturnType<typeof useSortable>['attributes']
    listeners: DraggableSyntheticListeners
    isDragging: boolean
  }) => React.ReactNode
}

function sortedModules(scenario?: Scenario): ScenarioModule[] {
  return [...(scenario?.modules ?? [])].sort((a, b) => a.order - b.order || Number(a.id) - Number(b.id))
}

function sortedSequences(courseModule?: ScenarioModule): Sequence[] {
  return [...(courseModule?.sequences ?? [])].sort((a, b) => a.order - b.order || Number(a.id) - Number(b.id))
}

function sortedActivities(sequence?: Sequence): Activity[] {
  return [...(sequence?.activities ?? [])].sort((a, b) => a.order - b.order || Number(a.id) - Number(b.id))
}

function SortableItem({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-70')}>
      {children({ attributes, listeners, isDragging })}
    </div>
  )
}

function moveModule(scenario: Scenario, oldIndex: number, newIndex: number): Scenario {
  const modules = arrayMove(sortedModules(scenario), oldIndex, newIndex).map((courseModule, order) => ({
    ...courseModule,
    order,
  }))
  return { ...scenario, modules }
}

function moveSequence(
  scenario: Scenario,
  moduleId: string,
  oldIndex: number,
  newIndex: number,
): Scenario {
  return {
    ...scenario,
    modules: sortedModules(scenario).map((courseModule) =>
      courseModule.id === moduleId
        ? {
            ...courseModule,
            sequences: arrayMove(sortedSequences(courseModule), oldIndex, newIndex).map((sequence, order) => ({
              ...sequence,
              order,
            })),
          }
        : courseModule,
    ),
  }
}

function moveActivity(
  scenario: Scenario,
  sequenceId: string,
  oldIndex: number,
  newIndex: number,
): Scenario {
  return {
    ...scenario,
    modules: sortedModules(scenario).map((courseModule) => ({
      ...courseModule,
      sequences: sortedSequences(courseModule).map((sequence) =>
        sequence.id === sequenceId
          ? {
              ...sequence,
              activities: arrayMove(sortedActivities(sequence), oldIndex, newIndex).map((activity, order) => ({
                ...activity,
                order,
              })),
            }
          : sequence,
      ),
    })),
  }
}

function idsFromReorder(
  scenario: Scenario,
  payload: Omit<ReorderPayload, 'orderedIds'>,
): string[] {
  if (payload.level === 'module') {
    return moveModule(scenario, payload.oldIndex, payload.newIndex).modules.map((courseModule) => courseModule.id)
  }

  if (payload.level === 'sequence') {
    const courseModule = scenario.modules.find((item) => item.id === payload.parentId)
    return courseModule
      ? arrayMove(sortedSequences(courseModule), payload.oldIndex, payload.newIndex).map((sequence) => sequence.id)
      : []
  }

  const sequence = scenario.modules
    .flatMap((courseModule) => courseModule.sequences ?? [])
    .find((item) => item.id === payload.parentId)
  return sequence
    ? arrayMove(sortedActivities(sequence), payload.oldIndex, payload.newIndex).map((activity) => activity.id)
    : []
}

export function ModuleTree({ scenarioId, selectedActivityId, onSelectActivity }: Props) {
  const qc = useQueryClient()
  const { broadcastScenarioEdit } = useSocket()
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [expandedSequences, setExpandedSequences] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const { data: scenario, isLoading } = useQuery<Scenario>({
    queryKey: ['scenario', scenarioId],
    queryFn: () => scenariosApi.getOne(scenarioId).then((r) => r.data),
  })

  const modules = useMemo(() => sortedModules(scenario), [scenario])

  const invalidateScenario = () => {
    qc.invalidateQueries({ queryKey: ['scenario', scenarioId] })
  }

  const { mutate: addModule } = useMutation({
    mutationFn: () => scenariosApi.createModule(scenarioId, { title: 'New Module' }),
    onSuccess: () => {
      toast.success('Module added')
      broadcastScenarioEdit({ scenarioId, entityType: 'module', action: 'create' })
      invalidateScenario()
    },
  })

  const { mutate: addSequence } = useMutation({
    mutationFn: (moduleId: string) => scenariosApi.createSequence(scenarioId, moduleId, { title: 'New Sequence' }),
    onSuccess: (_response, moduleId) => {
      setExpandedModules((prev) => new Set(prev).add(moduleId))
      toast.success('Sequence added')
      broadcastScenarioEdit({ scenarioId, entityType: 'sequence', action: 'create', entityId: moduleId })
      invalidateScenario()
    },
  })

  const { mutate: addActivity } = useMutation({
    mutationFn: ({ moduleId, seqId }: { moduleId: string; seqId: string }) =>
      scenariosApi.createActivity(scenarioId, moduleId, seqId, { title: 'New Activity', type: 'TEXT' }),
    onSuccess: (_response, { moduleId, seqId }) => {
      setExpandedModules((prev) => new Set(prev).add(moduleId))
      setExpandedSequences((prev) => new Set(prev).add(seqId))
      toast.success('Activity added')
      broadcastScenarioEdit({ scenarioId, entityType: 'activity', action: 'create', entityId: seqId })
      invalidateScenario()
    },
  })

  const { mutate: deleteModule } = useMutation({
    mutationFn: (moduleId: string) => scenariosApi.deleteModule(scenarioId, moduleId),
    onSuccess: (_response, moduleId) => {
      toast.success('Module deleted')
      broadcastScenarioEdit({ scenarioId, entityType: 'module', action: 'delete', entityId: moduleId })
      invalidateScenario()
    },
  })

  const { mutate: deleteSequence } = useMutation({
    mutationFn: ({ moduleId, seqId }: { moduleId: string; seqId: string }) =>
      scenariosApi.deleteSequence(scenarioId, moduleId, seqId),
    onSuccess: (_response, { seqId }) => {
      toast.success('Sequence deleted')
      broadcastScenarioEdit({ scenarioId, entityType: 'sequence', action: 'delete', entityId: seqId })
      invalidateScenario()
    },
  })

  const { mutate: deleteActivity } = useMutation({
    mutationFn: ({ moduleId, seqId, actId }: { moduleId: string; seqId: string; actId: string }) =>
      scenariosApi.deleteActivity(scenarioId, moduleId, seqId, actId),
    onSuccess: (_response, { actId }) => {
      toast.success('Activity deleted')
      broadcastScenarioEdit({ scenarioId, entityType: 'activity', action: 'delete', entityId: actId })
      invalidateScenario()
    },
  })

  const { mutate: persistReorder } = useMutation<AxiosResponse, Error, ReorderPayload, { previous?: Scenario }>({
    mutationFn: (payload) => {
      if (payload.level === 'module') {
        return scenariosApi.reorderModules(scenarioId, payload.orderedIds)
      }
      if (payload.level === 'sequence') {
        return scenariosApi.reorderSequences(scenarioId, payload.parentId, payload.orderedIds)
      }
      return scenariosApi.reorderActivities(scenarioId, '', payload.parentId, payload.orderedIds)
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['scenario', scenarioId] })
      const previous = qc.getQueryData<Scenario>(['scenario', scenarioId])

      if (previous) {
        const next =
          payload.level === 'module'
            ? moveModule(previous, payload.oldIndex, payload.newIndex)
            : payload.level === 'sequence'
              ? moveSequence(previous, payload.parentId, payload.oldIndex, payload.newIndex)
              : moveActivity(previous, payload.parentId, payload.oldIndex, payload.newIndex)

        qc.setQueryData(['scenario', scenarioId], next)
      }

      return { previous }
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        qc.setQueryData(['scenario', scenarioId], context.previous)
      }
      toast.error('Reordering failed')
    },
    onSuccess: (_response, payload) => {
      broadcastScenarioEdit({
        scenarioId,
        entityType:
          payload.level === 'module'
            ? 'module'
            : payload.level === 'sequence'
              ? 'sequence'
              : 'activity',
        action: 'reorder',
        entityId: payload.parentId,
      })
    },
    onSettled: () => {
      invalidateScenario()
    },
  })

  const toggleModule = (id: string) =>
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleSequence = (id: string) =>
    setExpandedSequences((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleDragEnd = (level: ReorderLevel, parentId: string) => (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !scenario) return

    const items =
      level === 'module'
        ? modules
        : level === 'sequence'
          ? sortedSequences(modules.find((courseModule) => courseModule.id === parentId))
          : sortedActivities(
              modules
                .flatMap((courseModule) => courseModule.sequences ?? [])
                .find((sequence) => sequence.id === parentId),
            )

    if (!items?.length) return

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const orderedIds = idsFromReorder(scenario, { level, parentId, oldIndex, newIndex })
    if (!orderedIds.length) return

    persistReorder({ level, parentId, oldIndex, newIndex, orderedIds })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="sm" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/7 px-3 py-3">
        <span className="text-xs font-semibold uppercase text-slate-400">Modules</span>
        <button
          onClick={() => addModule()}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-500 transition-colors hover:bg-[#0F6B4A]/18 hover:text-[#83BFA1]"
          title="Add module"
          type="button"
        >
          <Plus size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 lux-scrollbar">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd('module', scenarioId)}>
          <SortableContext items={modules.map((courseModule) => courseModule.id)} strategy={verticalListSortingStrategy}>
            {modules.map((mod) => {
              const sequences = sortedSequences(mod)
              const modExpanded = expandedModules.has(mod.id)

              return (
                <SortableItem key={mod.id} id={mod.id}>
                  {({ attributes, listeners, isDragging }) => (
                    <div className={cn(isDragging && 'rounded-lg bg-white/8')}>
                      <div
                        className="group flex cursor-pointer items-center gap-1 px-2 py-1.5 hover:bg-white/4"
                        onClick={() => toggleModule(mod.id)}
                      >
                        <button
                          className="touch-none p-0.5 text-slate-600 hover:text-slate-300"
                          title="Drag module"
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          {...attributes}
                          {...listeners}
                        >
                          <GripVertical size={10} />
                        </button>
                        {modExpanded ? (
                          <ChevronDown size={11} className="flex-shrink-0 text-slate-500" />
                        ) : (
                          <ChevronRight size={11} className="flex-shrink-0 text-slate-500" />
                        )}
                        <Layers size={11} className="flex-shrink-0 text-[#83BFA1]" />
                        <span className="flex-1 truncate text-xs font-medium text-slate-300">{mod.title}</span>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              addSequence(mod.id)
                            }}
                            className="p-0.5 hover:text-[#83BFA1]"
                            title="Add sequence"
                            type="button"
                          >
                            <Plus size={10} className="text-slate-500" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setPendingDelete({ kind: 'module', moduleId: mod.id, title: mod.title })
                            }}
                            className="p-0.5 hover:text-red-400"
                            title="Delete module"
                            type="button"
                          >
                            <Trash2 size={10} className="text-slate-500" />
                          </button>
                        </div>
                      </div>

                      {modExpanded && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEnd('sequence', mod.id)}
                        >
                          <SortableContext
                            items={sequences.map((sequence) => sequence.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {sequences.map((seq) => {
                              const activities = sortedActivities(seq)
                              const seqExpanded = expandedSequences.has(seq.id)

                              return (
                                <SortableItem key={seq.id} id={seq.id}>
                                  {({ attributes: seqAttributes, listeners: seqListeners, isDragging: seqDragging }) => (
                                    <div className={cn(seqDragging && 'rounded-lg bg-white/8')}>
                                      <div
                                        className="group flex cursor-pointer items-center gap-1 py-1.5 pl-5 pr-2 hover:bg-white/4"
                                        onClick={() => toggleSequence(seq.id)}
                                      >
                                        <button
                                          className="touch-none p-0.5 text-slate-600 hover:text-slate-300"
                                          title="Drag sequence"
                                          type="button"
                                          onClick={(e) => e.stopPropagation()}
                                          {...seqAttributes}
                                          {...seqListeners}
                                        >
                                          <GripVertical size={9} />
                                        </button>
                                        {seqExpanded ? (
                                          <ChevronDown size={10} className="flex-shrink-0 text-slate-500" />
                                        ) : (
                                          <ChevronRight size={10} className="flex-shrink-0 text-slate-500" />
                                        )}
                                        <List size={10} className="flex-shrink-0 text-[#83BFA1]" />
                                        <span className="flex-1 truncate text-[11px] text-slate-400">{seq.title}</span>
                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              addActivity({ moduleId: mod.id, seqId: seq.id })
                                            }}
                                            className="p-0.5 hover:text-[#83BFA1]"
                                            title="Add activity"
                                            type="button"
                                          >
                                            <Plus size={10} className="text-slate-500" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setPendingDelete({ kind: 'sequence', moduleId: mod.id, seqId: seq.id, title: seq.title })
                                            }}
                                            className="p-0.5 hover:text-red-400"
                                            title="Delete sequence"
                                            type="button"
                                          >
                                            <Trash2 size={10} className="text-slate-500" />
                                          </button>
                                        </div>
                                      </div>

                                      {seqExpanded && (
                                        <DndContext
                                          sensors={sensors}
                                          collisionDetection={closestCenter}
                                          onDragEnd={handleDragEnd('activity', seq.id)}
                                        >
                                          <SortableContext
                                            items={activities.map((activity) => activity.id)}
                                            strategy={verticalListSortingStrategy}
                                          >
                                            {activities.map((act) => (
                                              <SortableItem key={act.id} id={act.id}>
                                                {({
                                                  attributes: actAttributes,
                                                  listeners: actListeners,
                                                  isDragging: actDragging,
                                                }) => (
                                                  <div
                                                    className={cn(
                                                      'group flex items-center gap-1.5 py-1.5 pl-9 pr-2 transition-colors',
                                                      selectedActivityId === act.id
                                                        ? 'bg-[#0F6B4A]/18 text-[#83BFA1]'
                                                        : 'text-slate-400 hover:bg-white/4',
                                                      actDragging && 'rounded-lg bg-white/8 opacity-70',
                                                    )}
                                                  >
                                                    <button
                                                      className="touch-none p-0.5 text-slate-600 hover:text-slate-300"
                                                      title="Drag activity"
                                                      type="button"
                                                      {...actAttributes}
                                                      {...actListeners}
                                                    >
                                                      <GripVertical size={9} />
                                                    </button>
                                                    <button
                                                      onClick={() => onSelectActivity(act.id, seq.id, mod.id)}
                                                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                                      type="button"
                                                    >
                                                      <Zap
                                                        size={9}
                                                        className={cn('flex-shrink-0', activityTypeColors[act.type])}
                                                      />
                                                      <span className="truncate text-[10px]">{act.title}</span>
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setPendingDelete({ kind: 'activity', moduleId: mod.id, seqId: seq.id, actId: act.id, title: act.title })
                                                      }}
                                                      className="p-0.5 opacity-0 hover:text-red-400 group-hover:opacity-100"
                                                      title="Delete activity"
                                                      type="button"
                                                    >
                                                      <Trash2 size={10} className="text-slate-500" />
                                                    </button>
                                                  </div>
                                                )}
                                              </SortableItem>
                                            ))}
                                          </SortableContext>
                                        </DndContext>
                                      )}
                                    </div>
                                  )}
                                </SortableItem>
                              )
                            })}
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>
                  )}
                </SortableItem>
              )
            })}
          </SortableContext>
        </DndContext>

        {!modules.length && (
          <p className="px-4 py-8 text-center text-[11px] text-slate-600">
            No modules yet.
            <br />
            Click + to add one.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.title}"?` : ''}
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDelete) return
          if (pendingDelete.kind === 'module') {
            deleteModule(pendingDelete.moduleId)
          } else if (pendingDelete.kind === 'sequence') {
            deleteSequence({ moduleId: pendingDelete.moduleId, seqId: pendingDelete.seqId })
          } else {
            deleteActivity({ moduleId: pendingDelete.moduleId, seqId: pendingDelete.seqId, actId: pendingDelete.actId })
          }
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
