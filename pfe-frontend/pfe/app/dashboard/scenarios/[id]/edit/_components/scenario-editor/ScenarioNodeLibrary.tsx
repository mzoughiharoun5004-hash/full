'use client'

import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScenarioNodeType } from '@/types'
import { creatableScenarioNodeDefinitions, futureNodeDefinitions } from './scenarioNodeRegistry'

interface ScenarioNodeLibraryProps {
  collapsed: boolean
  onToggle: () => void
  onCreateNode: (type: ScenarioNodeType) => void
}

export function ScenarioNodeLibrary({ collapsed, onToggle, onCreateNode }: ScenarioNodeLibraryProps) {
  return (
    <aside
      className={cn(
        'sticky left-0 top-0 z-10 h-full max-h-full min-h-0 flex-shrink-0 overflow-hidden border-r border-[var(--lux-line)] bg-[var(--lux-surface)] transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-80',
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-[var(--lux-line)] px-4">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-[var(--lux-muted-soft)]">Step Library</p>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)]"
            aria-label={collapsed ? 'Open node library' : 'Collapse node library'}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {collapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto py-4 lux-scrollbar">
            <div className="flex flex-col items-center gap-2.5">
              {creatableScenarioNodeDefinitions.slice(0, 6).map((definition) => {
                const Icon = definition.icon
                return (
                  <button
                    key={definition.type}
                    type="button"
                    onClick={() => onCreateNode(definition.type)}
                    className={cn('grid h-9 w-9 place-items-center rounded-md border transition hover:scale-[1.02]', definition.accentClass)}
                    title={definition.label}
                    aria-label={`Add ${definition.label}`}
                  >
                    <Icon size={14} />
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lux-scrollbar">
            <div className="grid gap-3">
              {creatableScenarioNodeDefinitions.map((definition) => {
                const Icon = definition.icon
                return (
                  <button
                    key={definition.type}
                    type="button"
                    onClick={() => onCreateNode(definition.type)}
                    className="group flex items-start gap-3.5 rounded-lg border border-[var(--lux-line)] bg-white/3 p-3.5 text-left transition hover:border-[var(--lux-line-strong)] hover:bg-[var(--lux-overlay-hover)]"
                  >
                    <span className={cn('grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border', definition.accentClass)}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--lux-text)]">{definition.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--lux-muted-soft)]">
                        {definition.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 rounded-lg border border-dashed border-[var(--lux-line)] bg-white/3 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--lux-muted-soft)]">
                <Sparkles size={13} />
                AI-ready
              </div>
              <div className="mt-2 grid gap-2">
                {futureNodeDefinitions.map((definition) => {
                  const Icon = definition.icon
                  return (
                    <div key={`${definition.type}-${definition.label}`} className="flex items-start gap-2 text-xs text-[var(--lux-muted-soft)]">
                      <Icon size={13} className="mt-0.5 text-[var(--lux-gold)]" />
                      <span>{definition.description}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
