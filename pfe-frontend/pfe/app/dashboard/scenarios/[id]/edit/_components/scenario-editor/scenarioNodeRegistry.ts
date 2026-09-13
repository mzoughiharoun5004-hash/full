import type { ElementType } from 'react'
import {
  BadgeInfo,
  Bot,
  CircleDot,
  Film,
  Flag,
  GitBranch,
  HelpCircle,
  MessageSquare,
  Milestone,
  Route,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react'
import type { ScenarioNodeType } from '@/types'

export interface ScenarioNodeDefinition {
  type: ScenarioNodeType
  label: string
  description: string
  icon: ElementType
  accentClass: string
  creatable: boolean
}

export const scenarioNodeDefinitions: ScenarioNodeDefinition[] = [
  {
    type: 'start',
    label: 'Start',
    description: 'Entry point for the learner.',
    icon: CircleDot,
    accentClass: 'text-[#83BFA1] bg-[#0F6B4A]/12 border-[#0F6B4A]/30',
    creatable: false,
  },
  {
    type: 'dialogue',
    label: 'Dialogue',
    description: 'Character speech or narration.',
    icon: MessageSquare,
    accentClass: 'text-sky-300 bg-sky-500/12 border-sky-500/25',
    creatable: true,
  },
  {
    type: 'choice',
    label: 'Choice',
    description: 'Learner response with branches.',
    icon: GitBranch,
    accentClass: 'text-[#C6A765] bg-[#C6A765]/12 border-[#C6A765]/25',
    creatable: true,
  },
  {
    type: 'information',
    label: 'Information',
    description: 'Context, instructions, or facts.',
    icon: BadgeInfo,
    accentClass: 'text-cyan-300 bg-cyan-500/12 border-cyan-500/25',
    creatable: true,
  },
  {
    type: 'feedback',
    label: 'Feedback',
    description: 'Coaching after a decision.',
    icon: HelpCircle,
    accentClass: 'text-amber-300 bg-amber-500/12 border-amber-500/25',
    creatable: true,
  },
  {
    type: 'decision',
    label: 'Decision',
    description: 'Rule-based routing point.',
    icon: Route,
    accentClass: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/25',
    creatable: true,
  },
  {
    type: 'score',
    label: 'Score',
    description: 'Change score or completion state.',
    icon: Trophy,
    accentClass: 'text-yellow-300 bg-yellow-500/12 border-yellow-500/25',
    creatable: true,
  },
  {
    type: 'media',
    label: 'Media',
    description: 'Image, video, audio, or document.',
    icon: Film,
    accentClass: 'text-violet-300 bg-violet-500/12 border-violet-500/25',
    creatable: true,
  },
  {
    type: 'variable',
    label: 'Variable',
    description: 'Set learner state for later rules.',
    icon: SlidersHorizontal,
    accentClass: 'text-lime-300 bg-lime-500/12 border-lime-500/25',
    creatable: true,
  },
  {
    type: 'conditional_branch',
    label: 'Conditional Branch',
    description: 'Branch by score, choice, or variable.',
    icon: Milestone,
    accentClass: 'text-rose-300 bg-rose-500/12 border-rose-500/25',
    creatable: true,
  },
  {
    type: 'ending',
    label: 'Ending',
    description: 'Complete the scenario path.',
    icon: Flag,
    accentClass: 'text-[#83BFA1] bg-[#0F6B4A]/12 border-[#0F6B4A]/30',
    creatable: true,
  },
]

export const futureNodeDefinitions: ScenarioNodeDefinition[] = [
  {
    type: 'dialogue',
    label: 'AI Draft',
    description: 'Reserved for generated scenario steps.',
    icon: Bot,
    accentClass: 'text-[#C6A765] bg-[#C6A765]/12 border-[#C6A765]/25',
    creatable: false,
  },
]

export function getNodeDefinition(type: ScenarioNodeType) {
  return scenarioNodeDefinitions.find((definition) => definition.type === type) ?? scenarioNodeDefinitions[1]
}

export const creatableScenarioNodeDefinitions = scenarioNodeDefinitions.filter(
  (definition) => definition.creatable,
)
