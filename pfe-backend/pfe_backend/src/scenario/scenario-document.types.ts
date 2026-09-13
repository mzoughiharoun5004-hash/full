export type ScenarioNodeType =
  | 'start'
  | 'dialogue'
  | 'choice'
  | 'feedback'
  | 'information'
  | 'decision'
  | 'score'
  | 'ending'
  | 'media'
  | 'variable'
  | 'conditional_branch';

export interface ScenarioSpeaker {
  name: string;
  role?: string;
  avatarUrl?: string;
}

export interface ScenarioContent {
  title?: string;
  body?: string;
  tone?: 'neutral' | 'friendly' | 'concerned' | 'confident' | 'urgent';
  narration?: {
    enabled: boolean;
    voice?: string;
  };
}

export interface ScenarioMedia {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  title?: string;
  alt?: string;
}

export interface ScenarioCondition {
  id: string;
  variableId: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'greater_than'
    | 'less_than'
    | 'contains'
    | 'exists';
  value?: string | number | boolean;
}

export interface ScenarioEffect {
  id: string;
  type: 'set_variable' | 'increment_score' | 'complete' | 'bookmark';
  targetId?: string;
  value?: string | number | boolean;
}

export interface ScenarioChoice {
  id: string;
  text: string;
  targetNodeId?: string;
  scoreDelta?: number;
  feedback?: string;
  conditions?: ScenarioCondition[];
  effects?: ScenarioEffect[];
}

export interface ScenarioFeedback {
  correct?: string;
  incorrect?: string;
  neutral?: string;
}

export interface ScenarioNode {
  id: string;
  type: ScenarioNodeType;
  speaker?: ScenarioSpeaker;
  content: ScenarioContent;
  choices: ScenarioChoice[];
  feedback?: ScenarioFeedback;
  media: ScenarioMedia[];
  conditions: ScenarioCondition[];
  effects: ScenarioEffect[];
  position: { x: number; y: number };
  pluginData?: Record<string, unknown>;
}

export interface ScenarioConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceChoiceId?: string;
  label?: string;
  conditions?: ScenarioCondition[];
  effects?: ScenarioEffect[];
}

export interface ScenarioVariable {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
}

export interface ScenarioScoring {
  enabled: boolean;
  maxScore?: number;
  passingScore?: number;
  completionMode: 'visited_end' | 'score' | 'manual';
}

export interface ScenarioDocument {
  schemaVersion: 1;
  scenarioId: string;
  title: string;
  description?: string;
  settings: {
    autosave: boolean;
    allowBacktracking: boolean;
    showProgress: boolean;
    shuffleChoices: boolean;
    completionTracking: boolean;
    scoreTracking: boolean;
  };
  nodes: ScenarioNode[];
  connections: ScenarioConnection[];
  variables: ScenarioVariable[];
  scoring: ScenarioScoring;
  metadata: {
    source: 'blank' | 'legacy_tree' | 'ai_draft' | 'import';
    version: number;
    generatedAt?: string;
    updatedAt?: string;
    aiReady: boolean;
    scormReady: boolean;
  };
}
