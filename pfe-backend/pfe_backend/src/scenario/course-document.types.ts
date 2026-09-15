export type CoursePageType = 'lesson' | 'branching_scenario' | 'quiz' | 'media';
export type CourseLessonType = 'lesson' | 'quiz';
export type CourseBlockCategory =
  | 'text'
  | 'text_narrative'
  | 'statement'
  | 'list'
  | 'media'
  | 'dialogue_characters'
  | 'interactive'
  | 'interactive_engagement'
  | 'knowledge_check'
  | 'questions'
  | 'branching_decision'
  | 'data_reference'
  | 'navigation_completion'
  | 'chart'
  | 'divider';
export type CourseBlockType =
  | 'text'
  | 'heading'
  | 'paragraph'
  | 'callout'
  | 'statement'
  | 'quote'
  | 'list'
  | 'numbered_list'
  | 'image'
  | 'gallery'
  | 'image_gallery'
  | 'audio'
  | 'video'
  | 'embed'
  | 'attachment'
  | 'document'
  | 'code'
  | 'dialogue'
  | 'character_monologue'
  | 'branching_dialogue'
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'fill_blank'
  | 'matching'
  | 'ordering'
  | 'hotspot'
  | 'short_answer'
  | 'likert'
  | 'rating_slider'
  | 'choice_point'
  | 'consequence'
  | 'decision_recap'
  | 'branch_merge'
  | 'conditional_gate'
  | 'accordion'
  | 'tabs'
  | 'process'
  | 'process_steps'
  | 'timeline'
  | 'flashcards'
  | 'checklist'
  | 'reveal'
  | 'sorting'
  | 'sorting_activity'
  | 'before_after'
  | 'labeled_graphic'
  | 'scenario'
  | 'table'
  | 'resource_link'
  | 'file_download'
  | 'glossary'
  | 'button'
  | 'continue_button'
  | 'lesson_summary'
  | 'score_summary'
  | 'certificate'
  | 'completion_message'
  | 'restart_button'
  | 'divider'
  | 'spacer'
  | 'knowledge_check'
  | 'chart';

export type CourseKnowledgeCheckType =
  | 'multiple_choice'
  | 'multiple_response'
  | 'fill_blank'
  | 'matching';
export type CourseQuizQuestionType = CourseKnowledgeCheckType;
export type CourseQuizFeedbackMode = 'any_response' | 'correct_incorrect';

export interface CourseInteractionItem {
  id: string;
  title: string;
  content?: string;
  mediaUrl?: string;
  marker?: { x: number; y: number };
  match?: string;
}

export interface CourseKnowledgeCheckOption {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback?: string;
  match?: string;
}

export interface CourseKnowledgeCheck {
  type: CourseKnowledgeCheckType;
  question: string;
  options: CourseKnowledgeCheckOption[];
  correctFeedback?: string;
  incorrectFeedback?: string;
  allowRetry?: boolean;
}

export interface CourseBlock {
  id: string;
  type: CourseBlockType;
  category?: CourseBlockCategory;
  title?: string;
  content?: string;
  assetUrl?: string;
  items?: CourseInteractionItem[];
  knowledgeCheck?: CourseKnowledgeCheck;
  metadata?: Record<string, unknown>;
}

export interface BranchingChoice {
  id: string;
  text: string;
  nextNodeId?: string;
  score?: number;
  feedback?: string;
}

export interface BranchingNode {
  id: string;
  speaker?: string;
  text: string;
  emotion?: string;
  position?: { x: number; y: number };
  choices: BranchingChoice[];
}

export interface QuizQuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback?: string;
  match?: string;
}

export interface QuizQuestion {
  id: string;
  type: CourseQuizQuestionType | 'multiple_select' | 'mcq';
  text: string;
  imageUrl?: string;
  points: number;
  options: QuizQuestionOption[];
  feedback?: string;
  feedbackMode?: CourseQuizFeedbackMode;
  correctFeedback?: string;
  incorrectFeedback?: string;
  caseSensitive?: boolean;
}

export interface CourseLesson {
  id: string;
  type: CourseLessonType;
  title: string;
  summary?: string;
  estimatedMinutes?: number;
  coverImageUrl?: string;
  blocks: CourseBlock[];
  quiz?: {
    passingScore: number;
    timeLimitMinutes?: number;
    attempts?: number;
    randomizeQuestions?: boolean;
    randomizeAnswers?: boolean;
    showFeedback?: boolean;
    questions: QuizQuestion[];
  };
  metadata?: Record<string, unknown>;
}

export interface CourseSection {
  id: string;
  title: string;
  lessonIds: string[];
  collapsed?: boolean;
}

export interface CourseTheme {
  accentColor: string;
  fontPairing: 'modern' | 'classic' | 'serif' | 'friendly';
  coverLayout: 'centered' | 'split' | 'compact';
  navigationMode: 'sidebar' | 'compact' | 'continuous';
  lessonNumbers: boolean;
  sidebarEnabled: boolean;
  themeMode?: 'dark' | 'light';
  logoUrl?: string;
  coverImageUrl?: string;
}

export interface CoursePublishSettings {
  target: 'lms' | 'web' | 'pdf';
  lmsStandard: 'scorm_1_2' | 'scorm_2004' | 'xapi' | 'cmi5' | 'aicc';
  tracking: 'completion' | 'quiz_score' | 'completion_and_score';
  completionPercentage: number;
  passingScore: number;
  reportingStatus: 'completed_passed' | 'completed_failed' | 'passed_failed';
}

export interface CoursePage {
  id: string;
  type: CoursePageType;
  title: string;
  summary?: string;
  coverImageUrl?: string;
  blocks?: CourseBlock[];
  scenario?: {
    startNodeId: string;
    nodes: BranchingNode[];
    passingScore?: number;
  };
  quiz?: {
    passingScore: number;
    timeLimitMinutes?: number;
    questions: QuizQuestion[];
    attempts?: number;
    randomizeQuestions?: boolean;
    randomizeAnswers?: boolean;
    showFeedback?: boolean;
  };
  metadata?: Record<string, unknown>;
}

export interface CourseDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  objectives: string[];
  estimatedMinutes?: number;
  sections?: CourseSection[];
  lessons?: CourseLesson[];
  pages: CoursePage[];
  settings: {
    completionMode: 'pages' | 'score';
    passingScore: number;
    scormVersion: '1.2' | '2004';
    completionPercentage?: number;
    requireQuizPass?: boolean;
    // Enhanced settings
    tone?: 'friendly' | 'formal' | 'playful' | 'authoritative';
    audience?: 'student' | 'professional' | 'executive' | 'general';
    language?: string;
  };
  theme?: CourseTheme;
  publish?: CoursePublishSettings;
  metadata?: Record<string, unknown> & {
    source?: 'legacy_tree' | 'course_engine' | 'ai_draft';
    generatedAt?: string;
    version?: number;
    assetBaseUrl?: string;
    tone?: string;
    audience?: string;
    durationTag?: string;
  };
}
