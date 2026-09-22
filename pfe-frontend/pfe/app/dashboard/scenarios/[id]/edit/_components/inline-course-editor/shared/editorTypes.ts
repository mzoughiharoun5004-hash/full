import type { useScenarioRoom } from '@/context/SocketContext'
import type { CourseDocument, Scenario } from '@/types'

export interface InlineScenarioCourseEditorProps {
  mode: 'create' | 'edit'
  scenarioId?: string
  scenario?: Scenario
  readOnly?: boolean
  viewOnlyMessage?: 'approvedCollaborator' | 'collaborator'
  canAccessComments?: boolean
  initialPreviewOpen?: boolean
  loadedDocument?: CourseDocument
}

export type EditorViewState =
  | { type: 'structure' }
  | { type: 'lesson'; lessonId: string }

export type ScenarioRoom = ReturnType<typeof useScenarioRoom>

export type AiProposeBaseline = { document: CourseDocument; version: number } | null

export type BeforeAiProposeHandler = () => Promise<AiProposeBaseline>
