import {
  AlignLeft,
  BookOpen,
  Columns3,
  Download,
  GitBranch,
  GripVertical,
  Image as ImageIcon,
  Layers,
  List,
  MessageCircle,
  SquareLibrary,
  Type,
  Video,
} from 'lucide-react'
import type { CourseBlockType } from '@/types'

export const quickInsertBlocks: Array<{ type: CourseBlockType; label: string; icon: typeof Type }> = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'numbered_list', label: 'List', icon: List },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'process_steps', label: 'Process', icon: Columns3 },
  { type: 'flashcards', label: 'Flashcards', icon: SquareLibrary },
  { type: 'sorting_activity', label: 'Sorting', icon: Layers },
  { type: 'continue_button', label: 'Continue', icon: Download },
]

export const blockLibraryGroups: Array<{ label: string; icon: typeof Type; type?: CourseBlockType; beta?: boolean }> = [
  { label: 'Text', icon: Type, type: 'text' },
  { label: 'Statement', icon: MessageCircle, type: 'statement' },
  { label: 'Quote', icon: MessageCircle, type: 'quote' },
  { label: 'Bullet List', icon: List, type: 'list' },
  { label: 'Numbered List', icon: List, type: 'numbered_list' },
  { label: 'Image', icon: ImageIcon, type: 'image' },
  { label: 'Gallery', icon: Columns3, type: 'image_gallery' },
  { label: 'Multimedia', icon: Video, type: 'video' },
  { label: 'Accordion', icon: Layers, type: 'accordion' },
  { label: 'Tabs', icon: AlignLeft, type: 'tabs' },
  { label: 'Knowledge check', icon: BookOpen, type: 'multiple_choice' },
  { label: 'Choice point', icon: GitBranch, type: 'choice_point' },
  { label: 'Branching dialogue', icon: MessageCircle, type: 'branching_dialogue' },
  { label: 'Chart', icon: Columns3, type: 'chart' },
  { label: 'Divider', icon: GripVertical, type: 'divider' },
]
