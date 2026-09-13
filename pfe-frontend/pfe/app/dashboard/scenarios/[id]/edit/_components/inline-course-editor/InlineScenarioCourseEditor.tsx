'use client'

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import {
  AlertTriangle,
  AlignLeft,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock3,
  Columns3,
  Copy,
  Download,
  Eye,
  FileCheck2,
  GitBranch,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LibraryBig,
  List,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Redo2,
  RefreshCw,
  SlidersHorizontal,
  SquareLibrary,
  Trash2,
  Type,
  TextCursorInput,
  Undo2,
  UploadCloud,
  UserPlus,
  Users,
  UserX,
  Video,
  X,
  XCircle,
  Moon,
  Sun,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { SidebarToggleButton } from '@/components/layout/SidebarToggleButton'
import { getApiErrorMessage, mediaApi, scenariosApi, scormApi, usersApi } from '@/lib/api'
import { approvedCollaboratorViewOnlyMessage } from '@/lib/scenarioActions'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useScenarioRoom, type CollaborationUser, type ScenarioLockInfo } from '@/context/SocketContext'
import type {
  CourseBlock,
  CourseBlockType,
  CourseDocument,
  CourseInteractionItem,
  CourseLesson,
  CoursePage,
  CourseQuizQuestion,
  CourseQuizQuestionOption,
  CourseTheme,
  BranchingNode,
  MediaAsset,
  MediaType,
  Scenario,
  ScenarioComment,
  ScenarioShare,
  User,
} from '@/types'
import {
  applyCourseFormat,
  authorNameFrom,
  branchingDecisionBlockTypes,
  blockHasContent,
  courseFormatDefinitions,
  createBlock,
  createEmptyCourseDocument,
  createLesson,
  createQuizQuestion,
  duplicateBlock,
  duplicateLesson,
  formatCourseDuration,
  formatOptions,
  getBlockDefinition,
  getCourseFormat,
  getCourseReadiness,
  getCourseEstimatedMinutes,
  getScormSettings,
  isQuestionBlock,
  normalizeQuizQuestion,
  normalizeQuizQuestionType,
  normalizeCourseDocument,
  quizQuestionDescriptions,
  quizQuestionLabels,
  quizQuestionTypes,
  setLessonKind,
  syncCourseDocument,
  uid,
  type CourseReadiness,
  type CanonicalQuizQuestionType,
  type CourseFormat,
  type ScormSettings,
  type SaveStatus,
} from './courseEditorModel'
import { useCourseDocumentAutosave } from './useCourseDocumentAutosave'
import { MediaPicker } from '../MediaPicker'

interface InlineScenarioCourseEditorProps {
  mode: 'create' | 'edit'
  scenarioId?: string
  scenario?: Scenario
  readOnly?: boolean
  viewOnlyMessage?: 'approvedCollaborator' | 'collaborator'
  canAccessComments?: boolean
  initialPreviewOpen?: boolean
  loadedDocument?: CourseDocument
}

type EditorViewState =
  | { type: 'structure' }
  | { type: 'lesson'; lessonId: string }

const inputClass =
  'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-3 py-2 text-sm text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] focus:ring-2 focus:ring-[var(--lux-primary)]/20'

const textareaClass =
  'w-full resize-none rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-3 py-2 text-sm leading-6 text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] focus:ring-2 focus:ring-[var(--lux-primary)]/20'

const selectClass =
  'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-3 py-2 text-sm text-[var(--lux-text)] outline-none focus:border-[var(--lux-primary)]'

const ghostInputClass =
  'w-full bg-transparent text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)]'

const inlineSurfaceInputClass =
  'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] focus:bg-[var(--lux-surface)] focus:ring-2 focus:ring-[var(--lux-primary)]/15'

const inlineSurfaceTextareaClass =
  'w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-[var(--lux-text)] outline-none placeholder:text-[var(--lux-muted-soft)] focus:border-[var(--lux-primary)] focus:bg-[var(--lux-surface)] focus:ring-2 focus:ring-[var(--lux-primary)]/15'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const uploadableBlockTypes: CourseBlockType[] = ['image', 'video', 'audio', 'attachment', 'document', 'file_download']
const itemMediaAccept = 'image/*,video/*,audio/*'
type ItemUploadKind = 'media' | 'image'

type MediaPickerTarget =
  | { kind: 'block' }
  | { kind: 'item'; itemId: string; uploadKind: ItemUploadKind }
  | { kind: 'metadata'; key: string }

function uploadedAssetUrl(url: string): string {
  if (!url || url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url
  return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`
}

function acceptForBlockType(type: CourseBlockType): string | undefined {
  if (type === 'image') return 'image/*'
  if (type === 'video') return 'video/*'
  if (type === 'audio') return 'audio/*'
  if (type === 'attachment' || type === 'document' || type === 'file_download') {
    return '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,image/*,video/*,audio/*'
  }
  return undefined
}

function acceptsDroppedFile(block: CourseBlock, file: File): boolean {
  if (block.type === 'image') return file.type.startsWith('image/')
  if (block.type === 'video') return file.type.startsWith('video/')
  if (block.type === 'audio') return file.type.startsWith('audio/')
  return uploadableBlockTypes.includes(block.type)
}

function acceptsItemUploadFile(file: File, kind: ItemUploadKind): boolean {
  if (kind === 'image') return file.type.startsWith('image/')
  return file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
}

function eventHasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function mediaTypesForBlockType(type: CourseBlockType): MediaType[] {
  if (type === 'image') return ['IMAGE']
  if (type === 'video') return ['VIDEO']
  if (type === 'audio') return ['AUDIO']
  if (['attachment', 'document', 'file_download', 'resource_link'].includes(type)) return ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT']
  return ['IMAGE']
}

function mediaTypesForItemUpload(kind: ItemUploadKind): MediaType[] {
  return kind === 'image' ? ['IMAGE'] : ['IMAGE', 'VIDEO', 'AUDIO']
}

function mediaPickerAssetUrl(asset: MediaAsset): string {
  return uploadedAssetUrl(asset.url)
}

function chartDataToString(items: ChartDataItem[]): string {
  return JSON.stringify(items.map((item) => ({ label: item.label, value: item.value })))
}

interface ChartDataItem {
  id: string
  label: string
  value: number
}

interface ParsedChartDataItem {
  label: string
  value: number
}

function parseChartData(value: unknown): ParsedChartDataItem[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          const rawValue = Number(record.value)
          return {
            label: String(record.label ?? record.name ?? `Item ${index + 1}`).slice(0, 30),
            value: Number.isFinite(rawValue) ? rawValue : 0,
          }
        }
        const rawValue = Number(item)
        return {
          label: `Item ${index + 1}`,
          value: Number.isFinite(rawValue) ? rawValue : 0,
        }
      })
      .filter((item) => item.label.trim() || item.value > 0)
      .slice(0, 12)
  }

  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parseChartData(parsed)
  } catch {
    // Fall through to plain text parsing.
  }

  return value
    .split(/\n|;/)
    .map((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) return null
      const parts = trimmed.split(/,|\t|:/).map((part) => part.trim())
      const rawValue = Number(parts[1] ?? parts[0])
      return {
        label: (parts[1] ? parts[0] : `Item ${index + 1}`).slice(0, 30),
        value: Number.isFinite(rawValue) ? rawValue : 0,
      }
    })
    .filter((item): item is ParsedChartDataItem => Boolean(item))
    .slice(0, 12)
}

function chartItemsForEditor(raw: unknown): ChartDataItem[] {
  const parsed = parseChartData(raw)
  const source = parsed.length
    ? parsed
    : [
        { label: 'Item 1', value: 40 },
        { label: 'Item 2', value: 70 },
        { label: 'Item 3', value: 55 },
      ]

  return source.slice(0, 12).map((item, index) => ({
    id: `chart-item-${index}`,
    label: item.label,
    value: item.value,
  }))
}

const quickInsertBlocks: Array<{ type: CourseBlockType; label: string; icon: typeof Type }> = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'numbered_list', label: 'List', icon: List },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'process_steps', label: 'Process', icon: Columns3 },
  { type: 'flashcards', label: 'Flashcards', icon: SquareLibrary },
  { type: 'sorting_activity', label: 'Sorting', icon: Layers },
  { type: 'continue_button', label: 'Continue', icon: Download },
]

const blockLibraryGroups: Array<{ label: string; icon: typeof Type; type?: CourseBlockType; beta?: boolean }> = [
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

export function InlineScenarioCourseEditor({
  mode,
  scenarioId,
  scenario,
  readOnly = false,
  viewOnlyMessage,
  initialPreviewOpen = false,
  loadedDocument,
}: InlineScenarioCourseEditorProps) {
  const loadedDoc = loadedDocument ?? null
  const { user, isAdmin } = useAuth()
  const room = useScenarioRoom()
  const {
    collaborators,
    locks,
    lastEdit,
    broadcastScenarioEdit,
    lockElement,
    unlockElement,
  } = room
  const qc = useQueryClient()
  const authorName = authorNameFrom(user)
  const [persistedScenarioId, setPersistedScenarioId] = useState<string | undefined>(scenarioId)
  const [createdBaselineDocument, setCreatedBaselineDocument] = useState<CourseDocument | null>(null)
  const [document, setDocument] = useState<CourseDocument>(() => createEmptyCourseDocument('', authorName))
  const readiness = useMemo(() => getCourseReadiness(document), [document])
  const [titleCommitted, setTitleCommitted] = useState(mode === 'edit')
  const [documentHydrated, setDocumentHydrated] = useState(mode === 'create')
  const [titleDraft, setTitleDraft] = useState('')
  const [titleError, setTitleError] = useState('')
  const [view, setView] = useState<EditorViewState>({ type: 'structure' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(initialPreviewOpen)
  const [isLoading, setIsLoading] = useState(false)
  const [documentLoadFailed, setDocumentLoadFailed] = useState(false)
  const [collaboratorEmail, setCollaboratorEmail] = useState('')
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const lessonInputRef = useRef<HTMLInputElement | null>(null)
  const hydratedDocumentIdRef = useRef<string | null>(null)
  const scenarioOwnerId = scenario?.ownerId ?? scenario?.author?.id
  const isScenarioOwner = Boolean(
    user?.id && String(scenarioOwnerId ?? user.id) === String(user.id),
  )

// Improved: Comments accessible when user has appropriate permissions and scenario is in
  // a state where comments make sense (not arbitrary show/hide based only on readOnly)
  const canAccessComments = useMemo(() => {
    // Never in read-only mode
    if (readOnly) return false
    // Owner always has comment access (except archived scenarios)
    if (isScenarioOwner) {
      return scenario?.statut !== 'archived'
    }
    // For non-owners with edit shares: comments allowed in draft and review states
    if (!isAdmin && scenario?.statut) {
      const commentAllowedStatuses = ['brouillon', 'en_cours_validation']
      return commentAllowedStatuses.includes(scenario.statut?.toLowerCase() ?? '')
    }
    // Admins can view but typically not comment on others' scenarios
    // Collaborators with proper shares might have access via share permissions
    return false
}, [readOnly, isScenarioOwner, scenario?.statut, isAdmin])

  const normalizedLoadedDocument = useMemo(
    () => loadedDoc ? normalizeCourseDocument(loadedDoc, authorName) : null,
    [authorName, loadedDoc],
  )

const { data: comments = [] } = useQuery<ScenarioComment[]>({
    queryKey: ['scenario-comments', persistedScenarioId],
    enabled: Boolean(persistedScenarioId && canAccessComments),
    queryFn: () => scenariosApi.getComments(persistedScenarioId as string).then((response) => response.data),
  })

  const trimmedCollaboratorEmail = collaboratorEmail.trim()
  // Defer the query key so fast typing doesn't fire a request per keystroke;
  // React schedules the update at low priority and coalesces rapid changes.
  const deferredCollaboratorEmail = useDeferredValue(trimmedCollaboratorEmail)
  const { data: collaboratorSuggestions = [] } = useQuery<User[]>({
    queryKey: ['user-search', deferredCollaboratorEmail],
    enabled: Boolean(isScenarioOwner && deferredCollaboratorEmail.length >= 2),
    queryFn: () => usersApi.search(deferredCollaboratorEmail).then((response) => response.data),
    staleTime: 30_000,
  })
  const { data: loadedShares } = useQuery<ScenarioShare[]>({
    queryKey: ['shares', persistedScenarioId],
    enabled: Boolean(isScenarioOwner && persistedScenarioId),
    queryFn: () => scenariosApi.getShares(persistedScenarioId as string).then((response) => response.data),
  })
  const scenarioShares = useMemo(
    () => loadedShares ?? scenario?.shares ?? [],
    [loadedShares, scenario?.shares],
  )
  const hasCurrentUserShare = scenarioShares.some(
    (share) => String(share.user?.id ?? '') === String(user?.id ?? ''),
  )
  const collaboratorSuggestionOptions = useMemo(() => {
    const currentUserId = String(user?.id ?? '')
    const sharedUserIds = new Set(
      scenarioShares.map((share) => String(share.user?.id ?? '')),
    )
    return collaboratorSuggestions.filter((suggestion) => {
      const suggestionId = String(suggestion.id ?? '')
      return suggestionId !== currentUserId && !sharedUserIds.has(suggestionId)
    })
  }, [collaboratorSuggestions, scenarioShares, user?.id])

  useEffect(() => {
    if (mode !== 'edit' || !normalizedLoadedDocument || hydratedDocumentIdRef.current === normalizedLoadedDocument.id) return
    hydratedDocumentIdRef.current = normalizedLoadedDocument.id
    setDocument(normalizedLoadedDocument)
    setTitleDraft(normalizedLoadedDocument.title)
    setTitleCommitted(true)
    setDocumentHydrated(true)
  }, [mode, normalizedLoadedDocument])

  const scrollCourseToTop = useCallback(() => {
    if (typeof window === 'undefined') return

    window.requestAnimationFrame(() => {
      const scrollContainer = editorRootRef.current?.closest('main')
      scrollContainer?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }, [])

  useEffect(() => {
    if (lastEdit?.entityType !== 'comment' || !persistedScenarioId) return

    qc.invalidateQueries({ queryKey: ['scenario-comments', persistedScenarioId] })
    qc.invalidateQueries({ queryKey: ['scenario-activity', persistedScenarioId] })
  }, [lastEdit, persistedScenarioId, qc])

  useEffect(() => {
    if (readOnly) return
    if (!titleCommitted) {
      titleInputRef.current?.focus()
    } else if (document.lessons?.length === 0 && view.type === 'structure') {
      window.setTimeout(() => lessonInputRef.current?.focus(), 80)
    }
  }, [document.lessons?.length, readOnly, titleCommitted, view.type])

  const createScenarioMutation = useMutation({
    mutationFn: (nextDocument: CourseDocument) =>
      scenariosApi.create({
        title: nextDocument.title,
        description: nextDocument.description,
        template: 'BLANK',
        courseDocument: nextDocument,
      }),
    onSuccess: (response, submittedDocument) => {
      const created = response.data as Scenario
      setPersistedScenarioId(created.id)
      setCreatedBaselineDocument(created.courseDocument ?? submittedDocument)
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', `/dashboard/scenarios/${created.id}/edit`)
      }
      qc.invalidateQueries({ queryKey: ['scenarios'] })
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not create course'))
    },
  })

  const [savingProgress, setSavingProgress] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

const autosave = useCourseDocumentAutosave({
    scenarioId: persistedScenarioId,
    document,
    enabled: !readOnly && titleCommitted && documentHydrated && !!persistedScenarioId,
    baselineKey: persistedScenarioId,
    baselineDocument: mode === 'edit' ? normalizedLoadedDocument : createdBaselineDocument,
    onSaved: (savedDocument) => {
      qc.setQueryData(['course-document', persistedScenarioId], savedDocument)
      qc.invalidateQueries({ queryKey: ['scenario-activity', persistedScenarioId] })
      if (persistedScenarioId) {
        broadcastScenarioEdit({
          scenarioId: persistedScenarioId,
          entityType: 'course',
          action: 'update',
          entityId: savedDocument.id,
        })
      }
      setSavingProgress('saved')
      toast.success('Auto-saved', {
        description: 'Your changes were saved automatically',
        duration: 2000,
      } as any)
    },
    onError: (error: unknown) => {
      setSavingProgress('error')
    },
  })

  const saveStatus: SaveStatus = readOnly
    ? 'saved'
    : createScenarioMutation.isPending
      ? 'saving'
      : createScenarioMutation.isError && !persistedScenarioId
        ? 'error'
        : autosave.status === 'saving'
          ? 'saving'
          : autosave.status === 'error'
            ? 'error'
            : savingProgress === 'saved'
              ? 'saved'
              : autosave.status
  const saveLabel = readOnly
    ? viewOnlyMessage === 'approvedCollaborator'
      ? 'View only'
      : viewOnlyMessage === 'collaborator'
        ? 'View only'
      : 'Review only'
    : createScenarioMutation.isPending
      ? 'Saving...'
      : createScenarioMutation.isError && !persistedScenarioId
        ? 'Course creation failed - retry'
      : autosave.label
  const viewOnlyBannerText =
    viewOnlyMessage === 'approvedCollaborator'
      ? approvedCollaboratorViewOnlyMessage
      : viewOnlyMessage === 'collaborator'
        ? 'You have view-only access as a collaborator.'
      : 'View-only access'
  const canInviteCollaborators = Boolean(isScenarioOwner && persistedScenarioId && !readOnly)
  const canManageCollaborators = Boolean(isScenarioOwner && persistedScenarioId)
  const canReviewScenario = Boolean(
    isAdmin &&
      !hasCurrentUserShare &&
      persistedScenarioId &&
      scenario?.status === 'EN_COURS_VALIDATION',
  )

  const invalidateScenario = useCallback(() => {
    if (!persistedScenarioId) return
    qc.invalidateQueries({ queryKey: ['scenario', persistedScenarioId] })
    qc.invalidateQueries({ queryKey: ['scenarios'] })
  }, [persistedScenarioId, qc])

  const addCollaboratorMutation = useMutation({
    mutationFn: () => {
      if (!persistedScenarioId || !trimmedCollaboratorEmail) {
        return Promise.reject(new Error('Enter a collaborator email'))
      }
      return scenariosApi.share(persistedScenarioId, {
        email: trimmedCollaboratorEmail,
      })
    },
    onSuccess: () => {
      toast.success('Collaborator added')
      setCollaboratorEmail('')
      if (persistedScenarioId) {
        qc.invalidateQueries({ queryKey: ['scenario', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['shares', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenarios'] })
        broadcastScenarioEdit({
          scenarioId: persistedScenarioId,
          entityType: 'scenario',
          action: 'update',
        })
      }
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to add collaborator')),
  })

  const revokeShareMutation = useMutation({
    mutationFn: (shareId: string) => {
      if (!persistedScenarioId) {
        return Promise.reject(new Error('Course is not saved yet'))
      }
      return scenariosApi.revokeShare(persistedScenarioId, shareId)
    },
    onSuccess: (_response, shareId) => {
      toast.success('Collaborator access revoked')
      if (persistedScenarioId) {
        qc.setQueryData<ScenarioShare[]>(['shares', persistedScenarioId], (current) =>
          current?.filter((share) => share.id !== shareId) ?? current,
        )
        qc.invalidateQueries({ queryKey: ['shares', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenario', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenarios'] })
        broadcastScenarioEdit({
          scenarioId: persistedScenarioId,
          entityType: 'scenario',
          action: 'update',
        })
      }
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to revoke access')),
  })

  const approveMutation = useMutation({
    mutationFn: () => scenariosApi.approve(persistedScenarioId as string),
    onSuccess: () => {
      toast.success('Scenario approved')
      invalidateScenario()
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to approve scenario'))
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (reviewComment?: string) => scenariosApi.reject(persistedScenarioId as string, { comment: reviewComment }),
    onSuccess: () => {
      toast.success('Scenario revoked')
      invalidateScenario()
      if (persistedScenarioId) {
        qc.invalidateQueries({ queryKey: ['scenario-comments', persistedScenarioId] })
        qc.invalidateQueries({ queryKey: ['scenario-activity', persistedScenarioId] })
      }
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to revoke scenario'))
    },
  })

  const currentLock = view.type === 'lesson'
    ? locks.find((lock) => lock.elementId === lessonLockId(view.lessonId))
    : undefined
  const lockedByOther = Boolean(currentLock && String(currentLock.user.id) !== String(user?.id ?? ''))

  const updateDocument = useCallback((updater: (current: CourseDocument) => CourseDocument) => {
    if (readOnly || lockedByOther) return
    setDocument((current) => syncCourseDocument(updater(current)))
  }, [lockedByOther, readOnly])

  useEffect(() => {
    if (readOnly || !persistedScenarioId || view.type !== 'lesson') return
    const elementId = lessonLockId(view.lessonId)

    lockElement({ scenarioId: persistedScenarioId, elementId, elementType: 'lesson' })
    return () => {
      unlockElement({ scenarioId: persistedScenarioId, elementId, elementType: 'lesson' })
    }
  }, [lockElement, persistedScenarioId, readOnly, unlockElement, view])

  const updatePreviewDocument = useCallback((updater: (current: CourseDocument) => CourseDocument) => {
    setDocument((current) => syncCourseDocument(updater(current)))
  }, [])

  const commitCourseTitle = useCallback(() => {
    if (readOnly || createScenarioMutation.isPending) return
    const nextTitle = titleDraft.trim()
    if (!nextTitle) {
      setTitleError('A course title is required.')
      titleInputRef.current?.focus()
      return
    }

    setTitleError('')
    const nextDocument = syncCourseDocument({
      ...document,
      title: nextTitle,
      metadata: {
        ...document.metadata,
        authorName: document.metadata?.authorName || authorName,
        scorm: {
          ...getScormSettings(document),
          lmsTitle: nextTitle,
        },
      },
    })

    setDocument(nextDocument)
    setTitleCommitted(true)

    if (!persistedScenarioId) {
      createScenarioMutation.mutate(nextDocument)
    }
  }, [authorName, createScenarioMutation, document, persistedScenarioId, readOnly, titleDraft])

  const addLesson = useCallback((title: string, sectionId: string, type: CourseLesson['type'] = 'lesson') => {
    const nextTitle = title.trim()
    if (!nextTitle) return false
    const lesson = type === 'quiz'
      ? setLessonKind(createLesson(nextTitle), 'quiz')
      : createLesson(nextTitle)
    updateDocument((current) => {
      const sections = (current.sections ?? []).map((section) =>
        section.id === sectionId
          ? { ...section, lessonIds: [...section.lessonIds, lesson.id] }
          : section,
      )
      return {
        ...current,
        lessons: [...(current.lessons ?? []), lesson],
        sections,
      }
    })
    return true
  }, [updateDocument])

  const updateLesson = useCallback((lessonId: string, updater: (lesson: CourseLesson) => CourseLesson) => {
    updateDocument((current) => ({
      ...current,
      lessons: (current.lessons ?? []).map((lesson) =>
        lesson.id === lessonId ? updater(lesson) : lesson,
      ),
    }))
  }, [updateDocument])

  const removeLesson = useCallback((lessonId: string) => {
    updateDocument((current) => ({
      ...current,
      lessons: (current.lessons ?? []).filter((lesson) => lesson.id !== lessonId),
    }))
    if (view.type === 'lesson' && view.lessonId === lessonId) {
      setView({ type: 'structure' })
    }
  }, [updateDocument, view])

  const recoverSave = useCallback(() => {
    if (saveStatus === 'conflict') {
      setConflictDialogOpen(true)
      return
    }

    if (!persistedScenarioId) {
      createScenarioMutation.mutate(document)
      return
    }
    void autosave.retry()
  }, [autosave, createScenarioMutation, document, persistedScenarioId, saveStatus])

  const confirmConflictReload = useCallback(() => {
    // Reloading unmounts everything, so there's nothing left to guard —
    // the autosave hook's own conflictReloadingRef exists for the gap
    // between this click and the reload actually happening.
    setConflictDialogOpen(false)
    window.location.reload()
  }, [])

  const cancelConflictReload = useCallback(() => {
    setConflictDialogOpen(false)
    autosave.resetConflict()
  }, [autosave])

  // New: Memoize conflict details for display
  const conflictDetails = useMemo(() => {
    if (!normalizedLoadedDocument || !lastEdit) return null
    return {
      lastEditTime: lastEdit.timestamp
        ? new Date(lastEdit.timestamp).toLocaleString()
        : 'unknown',
      lastEditUser: lastEdit.user
        ?.name || lastEdit.user?.email
        ? lastEdit.user.name || lastEdit.user.email
        : 'unknown user',
      lastEditAction: lastEdit.action,
    }
  }, [normalizedLoadedDocument, lastEdit])

  const selectedLesson = view.type === 'lesson'
    ? document.lessons?.find((lesson) => lesson.id === view.lessonId) ?? null
    : null
  const showCommentsRail = Boolean(persistedScenarioId && canAccessComments)
  const viewScrollKey = view.type === 'lesson' ? `lesson:${view.lessonId}` : 'course'

  useEffect(() => {
    scrollCourseToTop()
  }, [persistedScenarioId, scrollCourseToTop, viewScrollKey])

  useEffect(() => {
    if (mode !== 'edit' || !document.id || view.type !== 'structure') return

    scrollCourseToTop()
  }, [document.id, mode, scrollCourseToTop, view.type])

  if (mode === 'edit' && isLoading && !loadedDocument) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--lux-bg)]">
        <Spinner />
      </div>
    )
  }

  if (mode === 'edit' && documentLoadFailed && !loadedDocument) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[var(--lux-bg)] px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-amber-500" size={28} />
          <h1 className="mt-4 text-lg font-bold text-[var(--lux-text-strong)]">Course could not be loaded</h1>
          <p className="mt-2 text-sm text-[var(--lux-muted)]">Check your connection and reload the page. No editor changes have been started.</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            <RefreshCw size={15} />
            Reload
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div ref={editorRootRef} className="rise-editor min-h-full bg-[var(--lux-bg)] font-sans text-[var(--lux-text)]">
      {showCommentsRail && (
        <CourseCommentsRail
          scenarioId={persistedScenarioId as string}
          comments={comments}
          readOnly={readOnly}
          onCommentChange={(commentId, action) => {
            broadcastScenarioEdit({
              scenarioId: persistedScenarioId as string,
              entityType: 'comment',
              entityId: commentId,
              action,
            })
          }}
        />
      )}
      <TopSaveBar
        status={saveStatus}
        label={saveLabel}
        onRetry={recoverSave}
        showRetry={saveStatus === 'error' || saveStatus === 'conflict'}
        collaborators={collaborators}
        openComments={comments.filter((comment) => comment.status === 'open').length}
      />
      <ConfirmDialog
        open={conflictDialogOpen}
        title="Newer version available"
        description={conflictDetails ? (
          <div className="space-y-2 text-sm">
            <p>A newer version of this course was saved while you were editing.</p>
            <p className="text-[10px] text-slate-500">
              Last saved: {conflictDetails.lastEditTime} by {conflictDetails.lastEditUser}
            </p>
            {conflictDetails.lastEditAction && (
              <p className="text-[10px] text-slate-400">Action: {conflictDetails.lastEditAction}</p>
            )}
          </div>
        ) : (
          "A newer version of this course exists. Reload it now? Your unsaved local changes will be discarded."
        )}
        confirmLabel="Reload"
        cancelLabel="Keep editing"
        onConfirm={confirmConflictReload}
        onCancel={cancelConflictReload}
      />
      {readOnly && (
        <div className="border-b border-[var(--lux-line)] bg-[var(--lux-primary-soft)] px-4 py-2.5 text-center text-xs font-medium text-[var(--lux-text)]">
          {viewOnlyBannerText}
        </div>
      )}

      <div className={cn(showCommentsRail && 'lg:pl-[340px]')}>
        {view.type === 'structure' ? (
        <main className="min-h-[calc(100vh-2.5rem)] bg-[var(--lux-bg)] px-4 pb-6 sm:px-8">
          <div className="sticky top-10 z-30 -mx-4 mb-5 border-b border-[var(--lux-line)] bg-[var(--lux-bg)]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
            <div className="mx-auto flex w-full max-w-[952px] items-center justify-between gap-3 overflow-x-auto lux-scrollbar">
              <Link
                href="/dashboard/scenarios"
                className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)]"
              >
                <ArrowLeft size={16} />
                Courses
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle compact className="h-9 w-9 rounded-md" />
                {titleCommitted && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
                      <Eye size={14} className="mr-1" />
                      Preview
                    </Button>
                    {!readOnly && (
                      <>
                        {canInviteCollaborators && (
                          <CollaboratorInviteControl
                            email={collaboratorEmail}
                            suggestions={collaboratorSuggestionOptions}
                            loading={addCollaboratorMutation.isPending}
                            onEmailChange={setCollaboratorEmail}
                            onSubmit={() => addCollaboratorMutation.mutate()}
                          />
                        )}
                        {canManageCollaborators && (
                          <CollaboratorAccessControl
                            shares={scenarioShares}
                            revokingShareId={revokeShareMutation.isPending ? revokeShareMutation.variables : undefined}
                            onRevokeShare={(shareId) => revokeShareMutation.mutate(shareId)}
                          />
                        )}
                        <Button size="sm" variant="secondary" onClick={() => setSettingsOpen((current) => !current)}>
                          <SlidersHorizontal size={14} className="mr-1" />
                          Course settings
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {!titleCommitted ? (
            <section className="mx-auto mt-8 max-w-[952px] px-0 py-8 sm:mt-12 sm:py-12">
              <p className="sr-only">New course</p>
              <div className="flex items-start gap-3">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(event) => {
                    setTitleDraft(event.target.value)
                    setTitleError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitCourseTitle()
                  }}
                  placeholder="Enter course title..."
                  className="min-w-0 flex-1 bg-transparent text-[44px] font-bold leading-tight text-[var(--lux-text-strong)] outline-none placeholder:text-[var(--lux-muted-soft)] sm:text-[52px]"
                />
                <div className="ml-4 flex-1 min-w-0">
                  {readiness.percent < 100 && (
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-1">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r from-[#0F6B4A] to-green-500 transition-width`}
                        style={{ width: `${readiness.percent}%` }}
                      />
                      <span className="text-[10px] ml-2 whitespace-nowrap">
                        {readiness.percent}% complete
                      </span>
                    </div>
                  )}
                  {readiness.errors.length > 0 && (
                    <div className="mt-1 text-[10px] text-red-400">
                      {readiness.errors.length} error(s) preventing save
                    </div>
                  )}
                  {readiness.warnings.length > 0 && (
                    <div className="mt-1 text-[10px] text-amber-400">
                      {readiness.warnings.length} warning(s)
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={commitCourseTitle}
                  className="mt-2 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-[var(--lux-primary)] text-[var(--lux-text-strong)] shadow-sm hover:bg-[var(--lux-primary-hover)]"
                  aria-label="Confirm course title"
                >
                  <Check size={18} />
                </button>
              </div>
              {titleError && <p className="mt-3 text-sm font-medium text-red-600">{titleError}</p>}
            </section>
          ) : (
            <StructurePage
              document={document}
              authorName={authorName}
              lessonInputRef={lessonInputRef}
              settingsOpen={settingsOpen}
              scenarioId={persistedScenarioId}
              readOnly={readOnly}
              onUpdateDocument={updateDocument}
              onEditTitle={() => {
                setTitleDraft(document.title)
                setTitleCommitted(false)
              }}
              onAddLesson={addLesson}
              onUpdateLesson={updateLesson}
              onRemoveLesson={removeLesson}
              onOpenCourseSettings={() => setSettingsOpen(true)}
              onOpenLesson={(lessonId) => {
                setSettingsOpen(false)
                setView({ type: 'lesson', lessonId })
              }}
              onSaveBeforeExport={autosave.retry}
              reviewActions={canReviewScenario ? (
                <ReviewDecisionPanel
                  approving={approveMutation.isPending}
                  revoking={revokeMutation.isPending}
                  onApprove={() => approveMutation.mutate()}
                  onRevoke={(comment) => revokeMutation.mutate(comment)}
                />
              ) : null}
            />
          )}
        </main>
      ) : selectedLesson ? (
        <LessonEditor
          key={selectedLesson.id}
          document={document}
          lesson={selectedLesson}
          lessonOrder={(document.lessons ?? []).findIndex((lesson) => lesson.id === selectedLesson.id) + 1}
          lessonCount={document.lessons?.length ?? 0}
          settingsOpen={settingsOpen}
          readOnly={readOnly || lockedByOther}
          lock={currentLock}
          saveStatus={saveStatus}
          onFinish={async () => {
            const saved = await autosave.retry()
            if (saved) {
              setSettingsOpen(false)
              setView({ type: 'structure' })
            } else {
              toast.error('Save the lesson before returning to the course outline.')
            }
          }}
          onBack={() => {
            setSettingsOpen(false)
            setView({ type: 'structure' })
          }}
          onOpenLesson={(lessonId) => {
            setSettingsOpen(false)
            setView({ type: 'lesson', lessonId })
          }}
          onUpdateDocument={updateDocument}
          onUpdateLesson={(updater) => updateLesson(selectedLesson.id, updater)}
        />
      ) : null}
      </div>

      {previewOpen && (
        <CoursePreview document={document} onClose={() => setPreviewOpen(false)} onUpdateDocument={updatePreviewDocument} />
      )}
    </div>
  )
}

function TopSaveBar({
  status,
  label,
  showRetry,
  onRetry,
  collaborators,
  openComments,
}: {
  status: SaveStatus
  label: string
  showRetry: boolean
  onRetry: () => void
  collaborators: CollaborationUser[]
  openComments: number
}) {
  return (
    <div className="sticky top-0 z-30 flex h-10 items-center justify-between border-b border-[var(--lux-line)] bg-[var(--lux-surface)]/95 px-4 backdrop-blur">
      <div className="inline-flex items-center gap-3 rounded-full px-2 py-1 text-xs font-semibold text-[var(--lux-muted)]">
        <span className="flex -space-x-2">
          {collaborators.slice(0, 4).map((collaborator) => (
            <Avatar
              key={String(collaborator.id)}
              firstName={collaborator.firstName}
              lastName={collaborator.lastName}
              name={collaborationUserName(collaborator)}
              size="xs"
              className="ring-2 ring-[var(--lux-surface)]"
            />
          ))}
          {!collaborators.length && <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--lux-overlay)]"><UsersIcon /></span>}
        </span>
        <span>{collaborators.length} online</span>
        {openComments > 0 && (
          <span className="rounded-full bg-[var(--lux-primary-soft)] px-2 py-0.5 text-[10px] text-[var(--lux-primary-muted)]">
            {openComments} comments
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={showRetry ? onRetry : undefined}
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          status === 'error'
            ? 'bg-red-50 text-red-600 hover:text-red-700'
            : status === 'conflict'
              ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15'
            : status === 'saving'
              ? 'bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]'
              : 'bg-[var(--lux-overlay)] text-[var(--lux-muted)]',
        )}
      >
        {label}
      </button>
    </div>
  )
}

function UsersIcon() {
  return <span className="h-2 w-2 rounded-full bg-[var(--lux-muted)]" />
}

function CollaboratorInviteControl({
  email,
  suggestions,
  loading,
  onEmailChange,
  onSubmit,
}: {
  email: string
  suggestions: User[]
  loading: boolean
  onEmailChange: (email: string) => void
  onSubmit: () => void
}) {
  const trimmedEmail = email.trim()
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [suggestionsMenu, setSuggestionsMenu] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const showSuggestions = trimmedEmail.length >= 2 && suggestions.length > 0

  const updateSuggestionsMenu = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor || typeof window === 'undefined') return

    const rect = anchor.getBoundingClientRect()
    const viewportPadding = 8
    const width = Math.max(280, rect.width)
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    )
    const top = rect.bottom + 4

    setSuggestionsMenu({
      top,
      left,
      width,
      maxHeight: Math.min(224, Math.max(120, window.innerHeight - top - viewportPadding)),
    })
  }, [])

  useEffect(() => {
    if (!showSuggestions) return

    updateSuggestionsMenu()
    window.addEventListener('resize', updateSuggestionsMenu)
    window.addEventListener('scroll', updateSuggestionsMenu, true)

    return () => {
      window.removeEventListener('resize', updateSuggestionsMenu)
      window.removeEventListener('scroll', updateSuggestionsMenu, true)
    }
  }, [showSuggestions, updateSuggestionsMenu])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedEmail || loading) return
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex h-9 items-center gap-1">
      <div ref={anchorRef} className="relative h-9 w-[220px]">
        <UserPlus
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--lux-muted)]"
        />
        <input
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="Collaborator email"
          className="h-9 w-full rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] pl-8 pr-2 text-xs font-semibold text-[var(--lux-text)] outline-none transition placeholder:text-[var(--lux-muted)] focus:border-[var(--lux-primary)] focus:ring-2 focus:ring-[var(--lux-primary)]/15"
        />
      </div>
      {showSuggestions && suggestionsMenu && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] overflow-y-auto rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] p-1 shadow-[var(--lux-shadow)] lux-scrollbar"
          style={{
            top: suggestionsMenu.top,
            left: suggestionsMenu.left,
            width: suggestionsMenu.width,
            maxHeight: suggestionsMenu.maxHeight,
          }}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onEmailChange(suggestion.email)}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left transition hover:bg-[var(--lux-overlay)]"
            >
              <Avatar
                firstName={suggestion.firstName}
                lastName={suggestion.lastName}
                name={collaborationUserName(suggestion)}
                size="xs"
              />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--lux-text)]">
                  {collaborationUserName(suggestion)}
                </span>
                <span className="block truncate text-[11px] text-[var(--lux-muted)]">{suggestion.email}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
      <button
        type="submit"
        disabled={!trimmedEmail || loading}
        className="grid h-9 w-9 place-items-center rounded-md bg-[var(--lux-primary)] text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Add collaborator"
      >
        {loading ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
      </button>
    </form>
  )
}

function CollaboratorAccessControl({
  shares,
  revokingShareId,
  onRevokeShare,
}: {
  shares: ScenarioShare[]
  revokingShareId?: string
  onRevokeShare: (shareId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelPosition, setPanelPosition] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button || typeof window === 'undefined') return

    const rect = button.getBoundingClientRect()
    const viewportPadding = 8
    const width = 320
    const top = rect.bottom + 6
    const left = Math.min(
      Math.max(viewportPadding, rect.right - width),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    )

    setPanelPosition({
      top,
      left,
      width,
      maxHeight: Math.min(360, Math.max(180, window.innerHeight - top - viewportPadding)),
    })
  }, [])

  useEffect(() => {
    if (!open) return

    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, updatePanelPosition])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] px-2.5 text-xs font-semibold text-[var(--lux-muted)] transition hover:bg-[var(--lux-overlay)] hover:text-[var(--lux-text)]"
      >
        <Users size={14} />
        Access
      </button>
      {open && panelPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[120] rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] p-2 shadow-[var(--lux-shadow)]"
          style={{
            top: panelPosition.top,
            left: panelPosition.left,
            width: panelPosition.width,
          }}
        >
          <div className="px-2 py-1">
            <p className="text-xs font-bold text-[var(--lux-text-strong)]">Collaborators</p>
            <p className="mt-0.5 text-[11px] text-[var(--lux-muted)]">{shares.length} with access</p>
          </div>
          <div
            className="mt-2 space-y-1 overflow-y-auto pr-1 lux-scrollbar"
            style={{ maxHeight: panelPosition.maxHeight }}
          >
            {shares.map((share) => (
              <div key={share.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 hover:bg-[var(--lux-overlay)]">
                <Avatar
                  firstName={share.user.firstName}
                  lastName={share.user.lastName}
                  name={collaborationUserName(share.user)}
                  size="xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[var(--lux-text)]">
                    {collaborationUserName(share.user)}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--lux-muted)]">{share.user.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRevokeShare(share.id)}
                  disabled={Boolean(revokingShareId)}
                  className="grid h-8 w-8 place-items-center rounded-md text-[var(--lux-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Revoke ${collaborationUserName(share.user)}`}
                >
                  {revokingShareId === share.id ? <RefreshCw size={14} className="animate-spin" /> : <UserX size={14} />}
                </button>
              </div>
            ))}
            {!shares.length && (
              <p className="px-2 py-5 text-center text-sm text-[var(--lux-muted)]">No collaborators yet.</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function lessonLockId(lessonId: string) {
  return `lesson:${lessonId}`
}

function collaborationUserName(user: CollaborationUser | ScenarioComment['author'] | undefined) {
  if (!user) return 'Collaborator'
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return fullName || user.email || `User #${user.id}`
}

function commentTargetLabel(comment: ScenarioComment) {
  if (comment.targetType === 'course') return 'Course'
  const label = comment.targetType.charAt(0).toUpperCase() + comment.targetType.slice(1)
  return comment.targetId ? `${label} ${comment.targetId}` : label
}

function CourseCommentsRail({
  scenarioId,
  comments,
  readOnly,
  onCommentChange,
}: {
  scenarioId: string
  comments: ScenarioComment[]
  readOnly: boolean
  onCommentChange: (commentId: string, action: 'create' | 'update') => void
}) {
  const qc = useQueryClient()
  const [commentBody, setCommentBody] = useState('')

  const createComment = useMutation({
    mutationFn: () => scenariosApi.createComment(scenarioId, {
      targetType: 'course',
      body: commentBody,
    }),
    onSuccess: (response) => {
      const createdComment = response.data as ScenarioComment
      setCommentBody('')
      qc.invalidateQueries({ queryKey: ['scenario-comments', scenarioId] })
      qc.invalidateQueries({ queryKey: ['scenario-activity', scenarioId] })
      onCommentChange(createdComment.id, 'create')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to add comment')),
  })

  const openCount = comments.filter((comment) => comment.status === 'open').length

  return (
    <aside className="fixed bottom-0 left-0 top-10 z-20 hidden w-[340px] flex-col border-r border-[var(--lux-line)] bg-[var(--lux-surface)] shadow-[var(--lux-shadow)] lg:flex">
      <div className="flex h-12 items-center justify-between border-b border-[var(--lux-line)] px-4">
        <div>
          <p className="text-sm font-bold text-[var(--lux-text-strong)]">Comments</p>
          <p className="text-[11px] text-[var(--lux-muted)]">{openCount} open</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lux-scrollbar">
        <div className="space-y-4">
          {!readOnly && (
            <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                className={textareaClass}
                rows={3}
                placeholder="Add a course comment..."
              />
              <Button size="sm" className="mt-2" onClick={() => createComment.mutate()} disabled={!commentBody.trim()} loading={createComment.isPending}>
                <MessageCircle size={13} className="mr-1" />
                Comment
              </Button>
            </div>
          )}
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar firstName={comment.author.firstName} lastName={comment.author.lastName} name={collaborationUserName(comment.author)} size="xs" />
                <span className="min-w-0 truncate text-xs font-semibold text-[var(--lux-text)]">{collaborationUserName(comment.author)}</span>
                <span className={cn(
                  'ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  comment.status === 'resolved'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]',
                )}>
                  {comment.status}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-semibold uppercase text-[var(--lux-muted-soft)]">{commentTargetLabel(comment)}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{comment.body}</p>
              <p className="mt-2 text-[11px] text-[var(--lux-muted-soft)]">{new Date(comment.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {!comments.length && <p className="py-6 text-center text-sm text-[var(--lux-muted)]">No comments yet.</p>}
        </div>
      </div>
    </aside>
  )
}

function StructurePage({
  document,
  authorName,
  lessonInputRef,
  settingsOpen,
  scenarioId,
  readOnly,
  onUpdateDocument,
  onEditTitle,
  onAddLesson,
  onUpdateLesson,
  onRemoveLesson,
  onOpenLesson,
  onOpenCourseSettings,
  onSaveBeforeExport,
  reviewActions,
}: {
  document: CourseDocument
  authorName: string
  lessonInputRef: RefObject<HTMLInputElement | null>
  settingsOpen: boolean
  scenarioId?: string
  readOnly: boolean
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
  onEditTitle: () => void
  onAddLesson: (title: string, sectionId: string, type?: CourseLesson['type']) => boolean
  onUpdateLesson: (lessonId: string, updater: (lesson: CourseLesson) => CourseLesson) => void
  onRemoveLesson: (lessonId: string) => void
  onOpenLesson: (lessonId: string) => void
  onOpenCourseSettings: () => void
  onSaveBeforeExport: () => Promise<boolean>
  reviewActions?: ReactNode
}) {
  const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    { type: 'section'; id: string; title: string } | { type: 'lesson'; id: string; title: string } | null
  >(null)
  const lessons = document.lessons ?? []
  const sections = document.sections ?? []
  const courseFormat = getCourseFormat(document)
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
  const courseTitleBackgroundUrl = document.theme?.coverImageUrl ? uploadedAssetUrl(document.theme.coverImageUrl) : ''

  const reorderLesson = (targetSectionId: string, targetLessonId?: string) => {
    if (readOnly) return
    if (!draggedLessonId || draggedLessonId === targetLessonId) return
    onUpdateDocument((current) => {
      const nextSections = (current.sections ?? []).map((section) => ({
        ...section,
        lessonIds: section.lessonIds.filter((lessonId) => lessonId !== draggedLessonId),
      }))
      const targetSection = nextSections.find((section) => section.id === targetSectionId)
      if (!targetSection) return current
      const targetIndex = targetLessonId
        ? targetSection.lessonIds.indexOf(targetLessonId)
        : targetSection.lessonIds.length
      targetSection.lessonIds.splice(
        targetIndex < 0 ? targetSection.lessonIds.length : targetIndex,
        0,
        draggedLessonId,
      )
      return { ...current, sections: nextSections }
    })
    setDraggedLessonId(null)
  }

  const addSection = () => {
    onUpdateDocument((current) => ({
      ...current,
      sections: [
        ...(current.sections ?? []),
        { id: uid('section'), title: `Section ${(current.sections?.length ?? 0) + 1}`, lessonIds: [] },
      ],
    }))
  }

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    onUpdateDocument((current) => {
      const nextSections = [...(current.sections ?? [])]
      const index = nextSections.findIndex((section) => section.id === sectionId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= nextSections.length) return current
      const [section] = nextSections.splice(index, 1)
      nextSections.splice(nextIndex, 0, section)
      return { ...current, sections: nextSections }
    })
  }

  const removeSection = (sectionId: string) => {
    if (sections.length <= 1) return
    const section = sections.find((item) => item.id === sectionId)
    if (!section) return

    onUpdateDocument((current) => {
      const currentSections = current.sections ?? []
      const removedIndex = currentSections.findIndex((item) => item.id === sectionId)
      const targetIndex = removedIndex === 0 ? 1 : removedIndex - 1
      const targetId = currentSections[targetIndex]?.id
      return {
        ...current,
        sections: currentSections
          .filter((item) => item.id !== sectionId)
          .map((item) =>
            item.id === targetId
              ? { ...item, lessonIds: [...item.lessonIds, ...section.lessonIds] }
              : item,
          ),
      }
    })
  }

  const confirmPendingDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.type === 'section') {
      removeSection(pendingDelete.id)
    } else {
      onRemoveLesson(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  const duplicateCourseLesson = (lesson: CourseLesson, sectionId: string) => {
    const copy = duplicateLesson(lesson)
    onUpdateDocument((current) => ({
      ...current,
      lessons: [...(current.lessons ?? []), copy],
      sections: (current.sections ?? []).map((section) => {
        if (section.id !== sectionId) return section
        const lessonIndex = section.lessonIds.indexOf(lesson.id)
        const lessonIds = [...section.lessonIds]
        lessonIds.splice(lessonIndex < 0 ? lessonIds.length : lessonIndex + 1, 0, copy.id)
        return { ...section, lessonIds }
      }),
    }))
  }

  return (
    <div className="mx-auto w-full max-w-[952px] pb-10">
      {settingsOpen && (
        <div className="fade-up pt-6 sm:pt-8">
          <CourseSetupPanel
            document={document}
            readOnly={readOnly}
            onUpdateDocument={onUpdateDocument}
          />
          <ScormPanel
            document={document}
            scenarioId={scenarioId}
            readOnly={readOnly}
            readiness={readiness}
            onUpdateDocument={onUpdateDocument}
            onSaveBeforeExport={onSaveBeforeExport}
          />
        </div>
      )}

      <section className="fade-up pt-6 sm:pt-8">
        <CourseHeader
          document={document}
          authorName={authorName}
          readOnly={readOnly}
          courseTitleBackgroundUrl={courseTitleBackgroundUrl}
          onEditTitle={onEditTitle}
          onUpdateDocument={onUpdateDocument}
        />
        {!readOnly && (
          <TitleBackgroundImageControl
            label="Course title background"
            value={document.theme?.coverImageUrl ?? ''}
            onChange={(coverImageUrl) => onUpdateDocument((current) => updateCourseTheme(current, { coverImageUrl }))}
          />
        )}
      </section>

      <CourseReadinessPanel
        readiness={readiness}
        lessonCount={lessons.length}
        estimatedMinutes={getCourseEstimatedMinutes(document)}
        onOpenLesson={onOpenLesson}
        onOpenCourseSettings={onOpenCourseSettings}
      />

      <section className="mt-6 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
              Learning objectives
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--lux-text-strong)]">
              What should learners be able to do?
            </h2>
          </div>
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={onOpenCourseSettings}>
              Edit in course settings
            </Button>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {(document.objectives ?? []).length === 0 && (
            <p className="text-sm text-[var(--lux-muted)]">
              Add one or more measurable learning objectives for this course.
            </p>
          )}
          {(document.objectives ?? []).map((objective, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={objective}
                onChange={(event) => {
                  const value = event.target.value
                  onUpdateDocument((current) => {
                    const next = [...(current.objectives ?? [])]
                    next[index] = value
                    return { ...current, objectives: next }
                  })
                }}
                placeholder={`Objective ${index + 1}`}
                className={cn(inputClass, 'min-w-0 flex-1')}
                disabled={readOnly}
              />
              {!readOnly && (
                <IconButton
                  label={`Remove objective ${index + 1}`}
                  onClick={() =>
                    onUpdateDocument((current) => ({
                      ...current,
                      objectives: (current.objectives ?? []).filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onUpdateDocument((current) => ({ ...current, objectives: [...(current.objectives ?? []), ''] }))}
            >
              Add objective
            </Button>
          )}
        </div>
      </section>

      <section className="mt-14 sm:mt-16">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--lux-line)] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">Curriculum</p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--lux-text-strong)]">Course structure</h2>
          </div>
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={addSection}>
              <Plus size={15} />
              Add section
            </Button>
          )}
        </div>

        <div>
          {sections.map((section, sectionIndex) => {
            const sectionLessons = section.lessonIds
              .map((lessonId) => lessonsById.get(lessonId))
              .filter((lesson): lesson is CourseLesson => Boolean(lesson))

            return (
              <section key={section.id} className="border-b border-[var(--lux-line)] py-8">
                <header className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">
                    Section {sectionIndex + 1}
                  </span>
                  <InlineText
                    value={section.title}
                    className="min-w-0 flex-1 text-lg font-bold text-[var(--lux-text-strong)]"
                    readOnly={readOnly}
                    onCommit={(title) =>
                      title.trim() &&
                      onUpdateDocument((current) => ({
                        ...current,
                        sections: (current.sections ?? []).map((item) =>
                          item.id === section.id ? { ...item, title: title.trim() } : item,
                        ),
                      }))
                    }
                  />
                  <span className="text-xs text-[var(--lux-muted)]">
                    {sectionLessons.length} {sectionLessons.length === 1 ? 'item' : 'items'}
                  </span>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <IconButton label="Move section up" disabled={sectionIndex === 0} onClick={() => moveSection(section.id, -1)}>
                        <ChevronUp size={16} />
                      </IconButton>
                      <IconButton label="Move section down" disabled={sectionIndex === sections.length - 1} onClick={() => moveSection(section.id, 1)}>
                        <ChevronDown size={16} />
                      </IconButton>
                      <IconButton
                        label="Delete section"
                        disabled={sections.length <= 1}
                        onClick={() => setPendingDelete({ type: 'section', id: section.id, title: section.title })}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  )}
                </header>

                <div
                  className="divide-y divide-[var(--lux-line)]"
                  onDragOver={(event) => !readOnly && event.preventDefault()}
                  onDrop={() => sectionLessons.length === 0 && reorderLesson(section.id)}
                >
                  {sectionLessons.map((lesson) => (
                    <LessonStructureItem
                      key={lesson.id}
                      lesson={lesson}
                      draggable={!readOnly}
                      onDragStart={() => setDraggedLessonId(lesson.id)}
                      onDragEnd={() => setDraggedLessonId(null)}
                      onDragOver={(event) => !readOnly && event.preventDefault()}
                      onDrop={() => reorderLesson(section.id, lesson.id)}
                      readOnly={readOnly}
                      onUpdate={(updater) => onUpdateLesson(lesson.id, updater)}
                      onDuplicate={() => duplicateCourseLesson(lesson, section.id)}
                      onRemove={() => setPendingDelete({ type: 'lesson', id: lesson.id, title: lesson.title })}
                      onOpen={() => onOpenLesson(lesson.id)}
                    />
                  ))}
                  {!sectionLessons.length && (
                    <div className="py-5 text-sm text-[var(--lux-muted)]">
                      Drop a lesson here or add the first item below.
                    </div>
                  )}
                  {!readOnly && (
                    <AddLessonInput
                      inputRef={sectionIndex === sections.length - 1 ? lessonInputRef : undefined}
                      sectionId={section.id}
                      defaultLessonType={courseFormat === 'Assessment-Only' ? 'quiz' : 'lesson'}
                      onAddLesson={onAddLesson}
                    />
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      {reviewActions && (
        <section className="mt-10">
          {reviewActions}
        </section>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.title}"?` : ''}
        description={
          pendingDelete?.type === 'section'
            ? 'Its lessons will be moved to another section.'
            : 'This cannot be undone.'
        }
        confirmLabel="Delete"
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function CourseReadinessPanel({
  readiness,
  lessonCount,
  estimatedMinutes,
  onOpenLesson,
  onOpenCourseSettings,
}: {
  readiness: CourseReadiness
  lessonCount: number
  estimatedMinutes: number
  onOpenLesson: (lessonId: string) => void
  onOpenCourseSettings: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleIssues = expanded ? readiness.issues : readiness.issues.slice(0, 3)

  return (
    <section className="mt-8 border-y border-[var(--lux-line)] py-5">
      <div className="flex flex-wrap items-center gap-5">
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
            <span>Publish readiness</span>
            <span>{readiness.percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--lux-overlay)]">
            <div
              className={cn(
                'h-full rounded-full transition-[width]',
                readiness.ready ? 'bg-emerald-500' : 'bg-amber-500',
              )}
              style={{ width: `${readiness.percent}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm text-[var(--lux-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen size={15} />
            {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={15} />
            {estimatedMinutes ? `${estimatedMinutes} min` : 'Duration unset'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileCheck2 size={15} />
            {readiness.errors.length} blocking
          </span>
        </div>
      </div>

      {visibleIssues.length > 0 && (
        <div className="mt-4 grid gap-2">
          {visibleIssues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => (issue.lessonId ? onOpenLesson(issue.lessonId) : onOpenCourseSettings())}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm',
                issue.severity === 'error'
                  ? 'bg-red-500/8 text-red-400'
                  : 'bg-amber-500/8 text-amber-500',
                issue.lessonId && 'hover:bg-[var(--lux-overlay-hover)]',
              )}
              >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span className="flex-1">{issue.message}</span>
              <span className="text-xs font-semibold">Open</span>
            </button>
          ))}
          {readiness.issues.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="justify-self-start text-xs font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]"
            >
              {expanded ? 'Show fewer checks' : `Show ${readiness.issues.length - 3} more checks`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function ReviewDecisionPanel({
  approving,
  revoking,
  onApprove,
  onRevoke,
}: {
  approving: boolean
  revoking: boolean
  onApprove: () => void
  onRevoke: (comment?: string) => void
}) {
  const [revokeComment, setRevokeComment] = useState('')
  const trimmedRevokeComment = revokeComment.trim()

  return (
    <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4">
      <div className="grid gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--lux-text)]">Review decision</p>
          <p className="mt-1 text-xs text-[var(--lux-muted)]">Approve this course or revoke it back to draft.</p>
        </div>
        <textarea
          value={revokeComment}
          onChange={(event) => setRevokeComment(event.target.value)}
          className={textareaClass}
          rows={3}
          placeholder="Optional rejection comment..."
          disabled={approving || revoking}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onApprove} loading={approving} disabled={revoking}>
            <CheckCircle size={14} className="mr-1" />
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onRevoke(trimmedRevokeComment || undefined)} loading={revoking} disabled={approving}>
            <XCircle size={14} className="mr-1" />
            Revoke
          </Button>
        </div>
      </div>
    </div>
  )
}

function CourseHeader({
  document,
  authorName,
  readOnly,
  courseTitleBackgroundUrl,
  onEditTitle,
  onUpdateDocument,
}: {
  document: CourseDocument
  authorName: string
  readOnly: boolean
  courseTitleBackgroundUrl: string
  onEditTitle: () => void
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
}) {
  const metadata = document.metadata ?? {}
  return (
    <section
      className={cn(
        'fade-up fade-up-1 relative overflow-hidden rounded-lg border border-[var(--lux-line)] px-5 py-7 shadow-sm sm:px-7 sm:py-9',
        courseTitleBackgroundUrl ? 'bg-cover bg-center' : 'bg-[var(--lux-surface-soft)]',
      )}
      style={courseTitleBackgroundUrl ? { backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.56), rgba(5, 12, 14, 0.56)), url(${courseTitleBackgroundUrl})` } : undefined}
    >
      <div className="relative">
        <div className="flex items-center gap-3">
          <AuthorBadge name={String(metadata.authorName || authorName)} coverMode={Boolean(courseTitleBackgroundUrl)} />
          <InlineText
            value={String(metadata.authorName || authorName)}
            className={cn(
              'text-sm font-bold uppercase',
              courseTitleBackgroundUrl ? 'text-white/80 drop-shadow' : 'text-[var(--lux-muted)]',
            )}
            readOnly={readOnly}
            onCommit={(value) =>
              onUpdateDocument((current) => ({
                ...current,
                metadata: { ...current.metadata, authorName: value || authorName },
              }))
            }
          />
          <ChevronDown size={15} className={courseTitleBackgroundUrl ? 'text-white/65' : 'text-[var(--lux-muted)]'} />
        </div>

        <button
          type="button"
          onClick={readOnly ? undefined : onEditTitle}
          className={cn(
            'mt-9 block max-w-4xl text-left text-[44px] font-bold leading-tight sm:text-[52px]',
            courseTitleBackgroundUrl
              ? 'text-white drop-shadow hover:text-white'
              : 'text-[var(--lux-muted)] hover:text-[var(--lux-text-strong)]',
          )}
        >
          {document.title}
        </button>

        <div className="mt-10 h-1.5 w-[200px] bg-[var(--lux-primary)]" />

        <DescriptionEditor
          value={document.description ?? ''}
          coverMode={Boolean(courseTitleBackgroundUrl)}
          readOnly={readOnly}
          onCommit={(description) =>
            onUpdateDocument((current) => ({
              ...current,
              description,
              metadata: {
                ...current.metadata,
                scorm: {
                  ...getScormSettings(current),
                  lmsDescription: description,
                },
              },
            }))
          }
        />
      </div>

      <div className="mt-7 flex flex-wrap gap-2 text-sm text-[var(--lux-muted)]">
        <span className="rounded-full bg-[var(--lux-surface-soft)] px-3 py-1.5">
          Duration: {formatCourseDuration(getCourseEstimatedMinutes(document))}
        </span>
        <span className="rounded-full bg-[var(--lux-surface-soft)] px-3 py-1.5">
          Format: {String(metadata.format ?? 'Linear')}
        </span>
        {String(metadata.audience ?? '').trim() && (
          <span className="rounded-full bg-[var(--lux-surface-soft)] px-3 py-1.5">
            Audience: {String(metadata.audience)}
          </span>
        )}
        {String(metadata.tone ?? '').trim() && (
          <span className="rounded-full bg-[var(--lux-surface-soft)] px-3 py-1.5">
            Tone: {String(metadata.tone)}
          </span>
        )}
      </div>
    </section>
  )
}

function CourseSetupPanel({
  document,
  readOnly,
  onUpdateDocument,
}: {
  document: CourseDocument
  readOnly: boolean
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
}) {
  const metadata = document.metadata ?? {}
  const objectives = document.objectives ?? []
  const settings = document.settings
  const courseFormat = getCourseFormat(document)
  const formatDefinition = courseFormatDefinitions[courseFormat]
  const updateDuration = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      onUpdateDocument((current) => ({
        ...current,
        estimatedMinutes: undefined,
        metadata: { ...current.metadata, duration: '' },
      }))
      return
    }
    const minutes = Number(trimmed)
    if (!Number.isFinite(minutes) || minutes <= 0) return
    const rounded = Math.round(minutes)
    onUpdateDocument((current) => ({
      ...current,
      estimatedMinutes: rounded,
      metadata: { ...current.metadata, duration: String(rounded) },
    }))
  }

  return (
    <section className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
      <h2 className="text-sm font-semibold uppercase text-[var(--lux-muted-soft)]">Course setup</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Audience">
          <InlineText
            value={String(metadata.audience ?? '')}
            readOnly={readOnly}
            placeholder="Audience"
            onCommit={(value) => onUpdateDocument((current) => ({ ...current, metadata: { ...current.metadata, audience: value } }))}
          />
        </Field>
        <Field label="Duration (minutes)">
          <input
            type="number"
            min="1"
            value={document.estimatedMinutes ?? ''}
            onChange={(event) => updateDuration(event.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </Field>
        <Field label="Format">
          <select
            value={courseFormat}
            onChange={(event) => onUpdateDocument((current) => applyCourseFormat(current, event.target.value as CourseFormat))}
            className={selectClass}
            disabled={readOnly}
          >
            {formatOptions.map((format) => <option key={format} value={format}>{format}</option>)}
          </select>
          {courseFormatDefinitions[courseFormat] && (
            <p className="mt-1.5 text-xs text-[var(--lux-muted)]">
              {courseFormatDefinitions[courseFormat].description} {courseFormatDefinitions[courseFormat].guidance}
            </p>
          )}
        </Field>
        <Field label="Tone">
          <InlineText
            value={String(metadata.tone ?? '')}
            readOnly={readOnly}
            placeholder="Tone"
            onCommit={(value) => onUpdateDocument((current) => ({ ...current, metadata: { ...current.metadata, tone: value } }))}
          />
        </Field>
        <Field label="Completion mode">
          <select
            value={settings.completionMode}
            onChange={(event) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, completionMode: event.target.value as CourseDocument['settings']['completionMode'] },
              }))
            }
            className={selectClass}
            disabled={readOnly || courseFormat === 'Assessment-Only'}
            title={courseFormat === 'Assessment-Only' ? 'Assessment-only courses always use score-based completion.' : undefined}
          >
            <option value="pages">Course progress</option>
            <option value="score">Quiz score</option>
          </select>
          {courseFormat === 'Assessment-Only' && (
            <p className="mt-1.5 text-xs text-[var(--lux-muted-soft)]">Locked to quiz score for assessment-only courses.</p>
          )}
        </Field>
        <Field label="Completion threshold (%)">
          <PercentageInput
            value={settings.completionPercentage ?? 100}
            minimum={1}
            disabled={readOnly}
            onCommit={(completionPercentage) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, completionPercentage },
              }))
            }
          />
        </Field>
        <Field label="Passing score (%)">
          <PercentageInput
            value={settings.passingScore}
            disabled={readOnly}
            onCommit={(passingScore) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, passingScore },
              }))
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-[var(--lux-muted)]">
          <input
            type="checkbox"
            checked={Boolean(settings.requireQuizPass)}
            onChange={(event) =>
              onUpdateDocument((current) => ({
                ...current,
                settings: { ...current.settings, requireQuizPass: event.target.checked },
              }))
            }
            disabled={readOnly || courseFormat === 'Assessment-Only'}
            title={courseFormat === 'Assessment-Only' ? 'Assessment-only courses always require a passing quiz score.' : undefined}
          />
          Require quiz pass
        </label>
      </div>
      <div className="mt-4 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-3">
        <p className="text-sm font-bold text-[var(--lux-text-strong)]">{formatDefinition.label}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--lux-muted)]">{formatDefinition.description}</p>
        <p className="mt-2 text-xs font-semibold text-[var(--lux-primary-muted)]">{formatDefinition.guidance}</p>
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">Learning objectives</p>
        {objectives.length === 0 && !readOnly && (
          <button
            type="button"
            className="rounded-md border border-dashed border-[var(--lux-line)] px-3 py-2 text-left text-sm text-[var(--lux-muted)]"
            onClick={() => onUpdateDocument((current) => ({ ...current, objectives: [''] }))}
            disabled={readOnly}
          >
            Add the first objective
          </button>
        )}
        {objectives.map((objective, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={objective}
              onChange={(event) => {
                const value = event.target.value
                onUpdateDocument((current) => {
                  const next = [...(current.objectives ?? [])]
                  next[index] = value
                  return { ...current, objectives: next }
                })
              }}
              placeholder={`Objective ${index + 1}`}
              className={cn(inputClass, 'min-w-0 flex-1')}
              disabled={readOnly}
            />
            {!readOnly && (
              <IconButton
                label={`Remove objective ${index + 1}`}
                onClick={() =>
                  onUpdateDocument((current) => ({
                    ...current,
                    objectives: (current.objectives ?? []).filter((_, itemIndex) => itemIndex !== index),
                  }))
                }
              >
                <Trash2 size={15} />
              </IconButton>
            )}
          </div>
        ))}
        {objectives.length > 0 && !readOnly && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onUpdateDocument((current) => ({ ...current, objectives: [...(current.objectives ?? []), ''] }))}
          >
            Add objective
          </Button>
        )}
      </div>
    </section>
  )
}

function PercentageInput({
  value,
  minimum = 0,
  disabled = false,
  onCommit,
}: {
  value: number | undefined
  minimum?: number
  disabled?: boolean
  onCommit: (value: number) => void
}) {
  const normalizedValue = clampPercentage(value, minimum)
  const commit = (rawValue: string) => {
    const nextValue = clampPercentage(rawValue, minimum, normalizedValue)
    if (nextValue !== normalizedValue) onCommit(nextValue)
  }

  return (
    <input
      key={`${minimum}-${normalizedValue}`}
      type="number"
      min={minimum}
      max="100"
      step="1"
      defaultValue={normalizedValue}
      onBlur={(event) => {
        const nextValue = clampPercentage(event.target.value, minimum, normalizedValue)
        event.currentTarget.value = String(nextValue)
        commit(String(nextValue))
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className={inputClass}
      disabled={disabled}
    />
  )
}

function clampPercentage(value: unknown, minimum: number, fallback = minimum): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(100, Math.round(parsed)))
}

function TitleBackgroundImageControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const imageUrl = value ? uploadedAssetUrl(value) : ''

  const uploadImage = async (file: File) => {
    if (uploading) return
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file.')
      return
    }

    setUploading(true)
    try {
      const response = await mediaApi.upload(file)
      onChange(uploadedAssetUrl(response.data.url))
      toast.success('Title background uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void uploadImage(file)
  }

  return (
    <div
      className={cn(
        'mt-5 rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 transition',
        dragActive && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
      )}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragActive(false)
        }
      }}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)] text-[var(--lux-muted)]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={20} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">{label}</p>
            <p className="mt-0.5 text-xs text-[var(--lux-muted)]">Drag and drop an image here, upload one, or paste a URL.</p>
            <input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Image URL"
              className={cn(inputClass, 'mt-1 w-full min-w-0')}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button type="button" size="sm" variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
            <UploadCloud size={14} />
            Upload
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMediaPickerOpen(true)}>
            <LibraryBig size={14} />
            Media library
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
              <X size={14} />
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void uploadImage(file)
          event.currentTarget.value = ''
        }}
      />
      {mediaPickerOpen && (
        <MediaPicker
          open={mediaPickerOpen}
          onClose={() => setMediaPickerOpen(false)}
          acceptedTypes={['IMAGE']}
          onSelect={(asset) => {
            onChange(mediaPickerAssetUrl(asset))
            setMediaPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}

function AuthorBadge({ name, coverMode = false }: { name: string; coverMode?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A'

  return (
    <span
      className={cn(
        'grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[var(--lux-primary)] text-base font-medium text-[var(--lux-text-strong)]',
        coverMode && 'ring-1 ring-white/35',
      )}
    >
      {initials}
    </span>
  )
}

function DescriptionEditor({
  value,
  coverMode = false,
  readOnly = false,
  onCommit,
}: {
  value: string
  coverMode?: boolean
  readOnly?: boolean
  onCommit: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (readOnly) {
    return (
      <p className={cn(
        'mt-8 block max-w-3xl whitespace-pre-wrap text-left font-serif text-2xl leading-9',
        coverMode ? 'text-white/82 drop-shadow' : 'text-[var(--lux-muted)]',
      )}>
        {value || 'No description.'}
      </p>
    )
  }

  if (!editing && !value.trim()) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={cn(
          'mt-8 block text-left font-serif text-2xl leading-9',
          coverMode ? 'text-white/70 drop-shadow hover:text-white' : 'text-[var(--lux-muted)] hover:text-[var(--lux-text)]',
        )}
      >
        Describe your course...
      </button>
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={cn(
          'mt-8 block max-w-3xl whitespace-pre-wrap text-left font-serif text-2xl leading-9',
          coverMode ? 'text-white/82 drop-shadow hover:text-white' : 'text-[var(--lux-muted)] hover:text-[var(--lux-text)]',
        )}
      >
        {value}
      </button>
    )
  }

  return (
    <textarea
      value={draft}
      autoFocus
      rows={3}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        onCommit(draft.trim())
        setEditing(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      className={cn(
        'mt-8 w-full max-w-3xl resize-none bg-transparent font-serif text-2xl leading-9 outline-none placeholder:text-[var(--lux-muted-soft)]',
        coverMode ? 'text-white drop-shadow placeholder:text-white/55' : 'text-[var(--lux-text)]',
      )}
      placeholder="Describe your course..."
    />
  )
}

function AddLessonInput({
  inputRef,
  sectionId,
  defaultLessonType,
  onAddLesson,
}: {
  inputRef?: RefObject<HTMLInputElement | null>
  sectionId: string
  defaultLessonType: CourseLesson['type']
  onAddLesson: (title: string, sectionId: string, type?: CourseLesson['type']) => boolean
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const commit = () => {
    if (!draft.trim()) {
      setError('Please enter a lesson title.')
      inputRef?.current?.focus()
      return
    }
    if (onAddLesson(draft, sectionId, defaultLessonType)) {
      setDraft('')
      setError('')
      window.setTimeout(() => inputRef?.current?.focus(), 30)
    }
  }

  return (
    <div className="relative py-6">
      <div className="flex items-center gap-5">
        <span className="ml-5 text-2xl leading-none text-[var(--lux-muted-soft)]">•</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
          placeholder={defaultLessonType === 'quiz' ? 'Add a quiz title...' : 'Add a lesson title...'}
          className="min-w-0 flex-1 bg-transparent text-xl font-bold text-[var(--lux-muted)] outline-none placeholder:text-[var(--lux-muted-soft)]"
        />
        <button
          type="button"
          onClick={commit}
          className="hidden h-9 w-9 place-items-center rounded-full bg-[var(--lux-primary)] text-[var(--lux-text-strong)] shadow-sm hover:bg-[var(--lux-primary-hover)] sm:grid"
          aria-label="Confirm lesson title"
        >
          <Check size={15} />
        </button>
      </div>
      <p className="mt-3 text-right text-xs text-[var(--lux-muted)]">Press Enter to add the {defaultLessonType === 'quiz' ? 'quiz' : 'lesson'}</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function LessonStructureItem({
  lesson,
  readOnly,
  onDuplicate,
  onUpdate,
  onRemove,
  onOpen,
  ...dragProps
}: {
  lesson: CourseLesson
  readOnly: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (event: DragEvent) => void
  onDrop?: () => void
  onDuplicate: () => void
  onUpdate: (updater: (lesson: CourseLesson) => CourseLesson) => void
  onRemove: () => void
  onOpen: () => void
}) {
  const [chooserOpen, setChooserOpen] = useState(false)
  const contentKind = typeof lesson.metadata?.contentKind === 'string' ? lesson.metadata.contentKind : undefined
  const hasContent =
    lesson.blocks.length > 0 ||
    lesson.type === 'quiz' ||
    contentKind === 'lesson' ||
    contentKind === 'quiz'

  const handleAction = () => {
    if (hasContent) {
      onOpen()
      return
    }
    setChooserOpen((current) => !current)
  }

  return (
    <div className={cn('group relative py-7 transition-colors', chooserOpen && 'bg-[var(--lux-surface-soft)] px-5 sm:px-8')} {...dragProps}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <GripVertical className="hidden h-4 w-4 flex-shrink-0 cursor-grab text-[var(--lux-muted-soft)] opacity-0 transition group-hover:opacity-100 sm:block" />
          <span className="ml-5 text-2xl leading-none text-[var(--lux-muted-soft)] sm:ml-0">•</span>
          <InlineText
            value={lesson.title}
            className="min-w-0 text-xl font-bold text-[var(--lux-text-strong)]"
            readOnly={readOnly}
            onCommit={(title) => title.trim() && onUpdate((current) => ({ ...current, title: title.trim() }))}
          />
          {lesson.type === 'quiz' && <span className="rounded-full bg-[var(--lux-overlay)] px-2.5 py-1 text-xs font-bold text-[var(--lux-muted)]">Quiz</span>}
        </div>
        {!readOnly && (
          <label className="flex items-center gap-2 rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">
            <Clock3 size={14} />
            <span>Duration</span>
            <input
              type="number"
              min="1"
              value={lesson.estimatedMinutes ?? ''}
              onChange={(event) => {
                const raw = event.target.value.trim()
                if (!raw) {
                  onUpdate((current) => ({ ...current, estimatedMinutes: undefined }))
                  return
                }
                const minutes = Number(raw)
                if (!Number.isFinite(minutes) || minutes <= 0) return
                onUpdate((current) => ({ ...current, estimatedMinutes: Math.round(minutes) }))
              }}
              className="w-20 border-0 bg-transparent p-0 text-sm font-semibold text-[var(--lux-text-strong)] outline-none [appearance:textfield]"
            />
            <span>min</span>
          </label>
        )}
        <div className="relative flex items-center gap-3 sm:justify-end">
          <button
            type="button"
            onClick={handleAction}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--lux-primary)] px-5 text-base font-bold text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-primary-hover)]"
          >
            {hasContent ? (readOnly ? 'Review Content' : 'Edit Content') : 'Add Content'}
            {!readOnly && <ChevronDown size={18} className={cn(chooserOpen && 'rotate-180')} />}
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={onDuplicate}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] opacity-0 transition hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] group-hover:opacity-100 focus:opacity-100"
                aria-label="Duplicate lesson"
                title="Duplicate lesson"
              >
                <Copy size={17} />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] opacity-0 transition hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] group-hover:opacity-100 focus:opacity-100"
                aria-label="Delete lesson"
                title="Delete lesson"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {chooserOpen && !hasContent && !readOnly && (
        <div className="relative ml-auto mt-5 w-full max-w-[625px] rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-6 shadow-[var(--lux-shadow)] before:absolute before:-top-3 before:right-24 before:h-6 before:w-6 before:rotate-45 before:border-l before:border-t before:border-[var(--lux-line)] before:bg-[var(--lux-surface)]">
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => {
                onUpdate((current) => setLessonKind(current, 'lesson'))
                onOpen()
              }}
              className="flex w-full items-center justify-between rounded bg-[var(--lux-surface-soft)] px-8 py-6 text-left transition hover:bg-[var(--lux-elevated)]"
            >
              <span>
                <span className="block text-xl font-bold text-[var(--lux-text-strong)]">Create Lesson</span>
                <span className="mt-1 block text-lg text-[var(--lux-text)]">Create a new lesson from a wide range of learning blocks.</span>
              </span>
              <List size={28} />
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdate((current) => setLessonKind(current, 'quiz'))
                onOpen()
              }}
              className="flex w-full items-center justify-between rounded bg-[var(--lux-surface-soft)] px-8 py-6 text-left transition hover:bg-[var(--lux-elevated)]"
            >
              <span>
                <span className="block text-xl font-bold text-[var(--lux-text-strong)]">Create Quiz</span>
                <span className="mt-1 block text-lg text-[var(--lux-text)]">Test the learner&apos;s knowledge with a quiz.</span>
              </span>
              <BookOpen size={28} />
            </button>
          </div>
          
        </div>
      )}

    </div>
  )
}

function LessonEditor({
  document,
  lesson,
  lessonOrder,
  lessonCount,
  settingsOpen,
  readOnly,
  lock,
  saveStatus,
  onFinish,
  onBack,
  onOpenLesson,
  onUpdateLesson,
}: {
  document: CourseDocument
  lesson: CourseLesson
  lessonOrder: number
  lessonCount: number
  settingsOpen: boolean
  readOnly: boolean
  lock?: ScenarioLockInfo
  saveStatus: SaveStatus
  onFinish: () => void
  onBack: () => void
  onOpenLesson: (lessonId: string) => void
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
  onUpdateLesson: (updater: (lesson: CourseLesson) => CourseLesson) => void
}) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null)
  const [undoStack, setUndoStack] = useState<CourseLesson[]>([])
  const [redoStack, setRedoStack] = useState<CourseLesson[]>([])
  const previousLesson = document.lessons?.[lessonOrder - 2] ?? null
  const nextLesson = document.lessons?.[lessonOrder] ?? null
  const lessonTitleBackgroundUrl = lesson.coverImageUrl ? uploadedAssetUrl(lesson.coverImageUrl) : ''
  const lockOwner = lock ? collaborationUserName(lock.user) : ''

  const updateLessonWithHistory = (updater: (lesson: CourseLesson) => CourseLesson) => {
    if (readOnly) return
    setUndoStack((current) => [...current.slice(-49), lesson])
    setRedoStack([])
    onUpdateLesson(updater)
  }

  const updateLessonMetadata = (updater: (lesson: CourseLesson) => CourseLesson) => {
    updateLessonWithHistory(updater)
  }

  const undoLessonChange = () => {
    if (readOnly || undoStack.length === 0) return
    const previousLesson = undoStack[undoStack.length - 1]
    setUndoStack((current) => current.slice(0, -1))
    setRedoStack((current) => [...current.slice(-49), lesson])
    setEditingBlockId(null)
    onUpdateLesson(() => previousLesson)
  }

  const redoLessonChange = () => {
    if (readOnly || redoStack.length === 0) return
    const nextLesson = redoStack[redoStack.length - 1]
    setRedoStack((current) => current.slice(0, -1))
    setUndoStack((current) => [...current.slice(-49), lesson])
    setEditingBlockId(null)
    onUpdateLesson(() => nextLesson)
  }

  const updateBlock = (blockId: string, updater: (block: CourseBlock) => CourseBlock) => {
    if (readOnly) return
    updateLessonWithHistory((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId ? updater(block) : block),
    }))
  }

  const insertBlock = (type: CourseBlockType, insertIndex = pendingInsertIndex) => {
    if (readOnly) return
    const block = createBlock(type)
    updateLessonWithHistory((current) => {
      const blocks = [...current.blocks]
      const safeIndex = insertIndex === null
        ? blocks.length
        : Math.max(0, Math.min(insertIndex, blocks.length))
      blocks.splice(safeIndex, 0, block)
      return {
        ...setLessonKind(current, lesson.type),
        blocks,
      }
    })
    setEditingBlockId(block.id)
    setPendingInsertIndex(null)
    setLibraryOpen(false)
  }

  const openLibraryForInsert = (insertIndex: number) => {
    if (readOnly) return
    setPendingInsertIndex(insertIndex)
    setLibraryOpen(true)
  }

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    if (readOnly) return
    updateLessonWithHistory((current) => {
      const blocks = [...current.blocks]
      const index = blocks.findIndex((block) => block.id === blockId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return current
      const [block] = blocks.splice(index, 1)
      blocks.splice(nextIndex, 0, block)
      return { ...current, blocks }
    })
  }

  const reorderBlock = (targetBlockId: string) => {
    if (readOnly) return
    if (!draggedBlockId || draggedBlockId === targetBlockId) return
    updateLessonWithHistory((current) => {
      const blocks = [...current.blocks]
      const from = blocks.findIndex((block) => block.id === draggedBlockId)
      const to = blocks.findIndex((block) => block.id === targetBlockId)
      if (from < 0 || to < 0) return current
      const [block] = blocks.splice(from, 1)
      blocks.splice(to, 0, block)
      return { ...current, blocks }
    })
    setDraggedBlockId(null)
  }

  return (
    <main className="min-h-[calc(100vh-2.5rem)] bg-[var(--lux-bg)]">
      <div className="sticky top-10 z-30 flex h-14 items-center justify-between border-b border-[var(--lux-line)] bg-[var(--lux-surface)] px-3">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="grid h-11 w-11 place-items-center border-r border-[var(--lux-line)] text-[var(--lux-text)] hover:bg-[var(--lux-overlay-hover)]"
            aria-label="Back to course outline"
          >
            <ArrowLeft size={24} />
          </button>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex max-w-[220px] items-center gap-2 rounded bg-[var(--lux-surface-soft)] px-6 py-2 text-base font-bold text-[var(--lux-text-strong)] hover:bg-[var(--lux-elevated)]"
          >
            <span className="truncate">{lesson.title}</span>
            <ChevronDown size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 pr-4 text-[var(--lux-text)]">
          {!readOnly && (
            <>
              <IconButton label="Undo" disabled={undoStack.length === 0} onClick={undoLessonChange}><Undo2 size={24} /></IconButton>
              <IconButton label="Redo" disabled={redoStack.length === 0} onClick={redoLessonChange}><Redo2 size={24} /></IconButton>
            </>
          )}
          <ThemeToggle compact className="h-9 w-9 rounded-md" />
        </div>
      </div>
      {lock && readOnly && (
        <div className="border-b border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-4 py-2 text-center text-xs font-semibold text-[var(--lux-muted)]">
          {lockOwner} is editing this lesson
        </div>
      )}

      <div>
        {previousLesson && (
          <LessonNavigationLink
            placement="header"
            lessonNumber={lessonOrder - 1}
            lessonTitle={previousLesson.title}
            onClick={() => onOpenLesson(previousLesson.id)}
          />
        )}
        <section className="mx-auto max-w-[600px] px-5 pb-[122px] pt-16 sm:pt-20">
          <header
            className={cn(
              'relative overflow-hidden',
              lessonTitleBackgroundUrl && 'rounded-lg border border-[var(--lux-line)] bg-cover bg-center px-5 py-7 shadow-sm sm:px-7 sm:py-9',
            )}
            style={lessonTitleBackgroundUrl ? { backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.5), rgba(5, 12, 14, 0.5)), url(${lessonTitleBackgroundUrl})` } : undefined}
          >
            <div className="relative">
              <p className={cn(
                'mb-3 text-xs font-semibold uppercase tracking-wide',
                lessonTitleBackgroundUrl ? 'text-white/75' : 'text-[var(--lux-muted)]',
              )}>
                Lesson {lessonOrder} of {Math.max(lessonCount, lessonOrder)}
              </p>
              <InlineText
                value={lesson.title}
                className={cn(
                  'text-[44px] font-bold leading-tight sm:text-[52px]',
                  lessonTitleBackgroundUrl ? 'text-white drop-shadow' : 'text-[var(--lux-text-strong)]',
                )}
                readOnly={readOnly}
                onCommit={(title) => title.trim() && updateLessonMetadata((current) => ({ ...current, title: title.trim() }))}
              />
              <div className="mt-[76px] h-1.5 w-[200px] bg-[var(--lux-primary)]" />
            </div>
          </header>
          {!readOnly && (
            <TitleBackgroundImageControl
              label="Lesson title background"
              value={lesson.coverImageUrl ?? ''}
              onChange={(coverImageUrl) => updateLessonMetadata((current) => ({ ...current, coverImageUrl }))}
            />
          )}

          {settingsOpen && lesson.type === 'quiz' && !readOnly && (
            <QuizSettingsPanel lesson={lesson} onUpdateLesson={updateLessonMetadata} />
          )}
        </section>

        {lesson.type === 'quiz' ? (
          <QuizLessonEditor
            lesson={lesson}
            readOnly={readOnly}
            saveStatus={saveStatus}
            onFinish={onFinish}
            onUpdateLesson={updateLessonWithHistory}
          />
        ) : (
          <section className="border-t-[3px] border-[var(--lux-line)] px-4 pb-12 pt-10">
            <div className="mx-auto max-w-[930px] space-y-4">
              {lesson.blocks.length === 0 && (
                <div className="mb-8 text-center">
                  <p className="text-2xl font-semibold text-[var(--lux-text-strong)]">
                    {readOnly ? 'No blocks in this lesson' : 'Add your first block'}
                  </p>
                  <span className="mx-auto mt-3 block h-px w-7 bg-[var(--lux-muted-soft)]" />
                </div>
              )}

              {lesson.blocks.map((block, index) => (
                <div key={block.id}>
                  {index > 0 && (
                    <BetweenBlocksInsert
                      onInsert={() => openLibraryForInsert(index)}
                      disabled={readOnly}
                    />
                  )}
                  <BlockItem
                    block={block}
                    currentLessonId={lesson.id}
                    lessonDestinations={document.lessons ?? []}
                    index={index}
                    total={lesson.blocks.length}
                    editing={editingBlockId === block.id}
                    readOnly={readOnly}
                    onEdit={() => !readOnly && setEditingBlockId(block.id)}
                    onUpdate={(updater) => updateBlock(block.id, updater)}
                    onMoveUp={() => moveBlock(block.id, -1)}
                    onMoveDown={() => moveBlock(block.id, 1)}
                    onDuplicate={() => !readOnly && updateLessonWithHistory((current) => {
                      const blocks = [...current.blocks]
                      const blockIndex = blocks.findIndex((item) => item.id === block.id)
                      blocks.splice(blockIndex + 1, 0, duplicateBlock(block))
                      return { ...current, blocks }
                    })}
                    onDelete={() => !readOnly && updateLessonWithHistory((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) }))}
                    draggable={!readOnly}
                    onDragStart={() => setDraggedBlockId(block.id)}
                    onDragOver={(event) => !readOnly && event.preventDefault()}
                    onDrop={() => reorderBlock(block.id)}
                  />
                </div>
              ))}

              {!readOnly && (
                <>
                  <QuickInsertBar
                    libraryOpen={libraryOpen && pendingInsertIndex === null}
                    onToggleLibrary={() => {
                      setPendingInsertIndex(null)
                      setLibraryOpen((current) => !current)
                    }}
                    onInsert={(type) => insertBlock(type, null)}
                  />
                  <div className="mt-6 flex justify-center">
                    <Button size="lg" className="min-w-[160px] px-10" onClick={onFinish} disabled={saveStatus === 'saving'}>
                      <Check size={16} className="mr-1" />
                      Finish
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
        {nextLesson && (
          <LessonNavigationLink
            placement="footer"
            lessonNumber={lessonOrder + 1}
            lessonTitle={nextLesson.title}
            onClick={() => onOpenLesson(nextLesson.id)}
          />
        )}
      </div>

      {libraryOpen && lesson.type !== 'quiz' && !readOnly && (
        <BlockLibraryRail
          quizMode={false}
          onClose={() => setLibraryOpen(false)}
          onInsert={insertBlock}
        />
      )}
    </main>
  )
}

function LessonNavigationLink({
  placement,
  lessonNumber,
  lessonTitle,
  onClick,
}: {
  placement: 'header' | 'footer'
  lessonNumber: number
  lessonTitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full flex-col items-center justify-center px-4 text-center text-[var(--lux-muted)] transition hover:bg-[var(--lux-surface-soft)] hover:text-[var(--lux-primary)]',
        placement === 'header'
          ? 'border-b border-[var(--lux-line)] py-8'
          : 'border-t border-[var(--lux-line)] py-10',
      )}
    >
      {placement === 'header' && (
        <ChevronDown size={26} className="mb-2 rotate-180 transition group-hover:-translate-y-1" />
      )}
      <span className="text-sm font-semibold uppercase tracking-wide">
        Lesson {lessonNumber} - {lessonTitle}
      </span>
      {placement === 'footer' && (
        <ChevronDown size={26} className="mt-2 transition group-hover:translate-y-1" />
      )}
    </button>
  )
}

function QuizSettingsPanel({
  lesson,
  onUpdateLesson,
}: {
  lesson: CourseLesson
  onUpdateLesson: (updater: (lesson: CourseLesson) => CourseLesson) => void
}) {
  const quiz = lesson.quiz ?? { passingScore: 80, attempts: 1, showFeedback: true, randomizeQuestions: false, randomizeAnswers: false, questions: [] }
  const updateQuiz = (patch: Partial<typeof quiz>) => onUpdateLesson((current) => ({ ...current, quiz: { ...quiz, ...patch } }))

  return (
    <section className="mt-5 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
      <h2 className="text-sm font-semibold uppercase text-[var(--lux-muted-soft)]">Quiz Settings</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Passing score (%)">
          <PercentageInput value={quiz.passingScore} onCommit={(passingScore) => updateQuiz({ passingScore })} />
        </Field>
        <Field label="Question order">
          <select value={quiz.randomizeQuestions ? 'randomized' : 'fixed'} onChange={(e) => updateQuiz({ randomizeQuestions: e.target.value === 'randomized' })} className={selectClass}>
            <option value="fixed">Fixed</option>
            <option value="randomized">Randomized</option>
          </select>
        </Field>
        <Field label="Show feedback">
          <select value={String(lesson.metadata?.feedbackTiming ?? 'immediate')} onChange={(e) => onUpdateLesson((current) => ({ ...current, metadata: { ...current.metadata, feedbackTiming: e.target.value } }))} className={selectClass}>
            <option value="immediate">Immediately after each answer</option>
            <option value="end">At end of quiz</option>
            <option value="never">Never</option>
          </select>
        </Field>
        <Field label="Allow retry">
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <select value={quiz.attempts && quiz.attempts > 1 ? 'max' : quiz.attempts === 0 ? 'no' : 'yes'} onChange={(e) => updateQuiz({ attempts: e.target.value === 'no' ? 0 : e.target.value === 'yes' ? 1 : 3 })} className={selectClass}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="max">Max attempts</option>
            </select>
            <input type="number" min={0} value={quiz.attempts ?? 1} onChange={(e) => updateQuiz({ attempts: Number(e.target.value) })} className={inputClass} />
          </div>
        </Field>
        <Field label="Time limit">
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <select value={quiz.timeLimitMinutes ? 'minutes' : 'none'} onChange={(e) => updateQuiz({ timeLimitMinutes: e.target.value === 'none' ? undefined : 10 })} className={selectClass}>
              <option value="none">None</option>
              <option value="minutes">Minutes</option>
            </select>
            <input type="number" value={quiz.timeLimitMinutes ?? ''} onChange={(e) => updateQuiz({ timeLimitMinutes: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} />
          </div>
        </Field>
      </div>
    </section>
  )
}

type QuizData = NonNullable<CourseLesson['quiz']>

function QuizLessonEditor({
  lesson,
  readOnly,
  saveStatus,
  onFinish,
  onUpdateLesson,
}: {
  lesson: CourseLesson
  readOnly: boolean
  saveStatus: SaveStatus
  onFinish: () => void
  onUpdateLesson: (updater: (lesson: CourseLesson) => CourseLesson) => void
}) {
  const questions = useMemo(() => lesson.quiz?.questions?.map(normalizeQuizQuestion) ?? [], [lesson.quiz?.questions])
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(questions[0]?.id ?? null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const activeQuestion = questions.find((question) => question.id === selectedQuestionId) ?? questions[0]
  const activeQuestionId = activeQuestion?.id ?? null
  const activeIndex = activeQuestion ? questions.findIndex((question) => question.id === activeQuestion.id) : -1

  const updateQuiz = (updater: (quiz: QuizData) => QuizData) => {
    if (readOnly) return
    onUpdateLesson((current) => {
      const currentQuiz: QuizData = {
        passingScore: current.quiz?.passingScore ?? 80,
        attempts: current.quiz?.attempts ?? 1,
        randomizeQuestions: current.quiz?.randomizeQuestions ?? false,
        randomizeAnswers: current.quiz?.randomizeAnswers ?? false,
        showFeedback: current.quiz?.showFeedback ?? true,
        timeLimitMinutes: current.quiz?.timeLimitMinutes,
        questions: current.quiz?.questions ?? [],
      }
      const nextQuiz = updater(currentQuiz)
      return {
        ...current,
        type: 'quiz',
        blocks: [],
        quiz: {
          ...nextQuiz,
          questions: nextQuiz.questions.map(normalizeQuizQuestion),
        },
      }
    })
  }

  const addQuestion = (type: CanonicalQuizQuestionType) => {
    const question = createQuizQuestion(type)
    updateQuiz((quiz) => {
      const insertAt = activeQuestion ? questions.findIndex((item) => item.id === activeQuestion.id) + 1 : quiz.questions.length
      const nextQuestions = [...quiz.questions]
      nextQuestions.splice(Math.max(0, insertAt), 0, question)
      return { ...quiz, questions: nextQuestions }
    })
    setSelectedQuestionId(question.id)
    setAddMenuOpen(false)
  }

  const updateQuestion = (questionId: string, updater: (question: CourseQuizQuestion) => CourseQuizQuestion) => {
    updateQuiz((quiz) => ({
      ...quiz,
      questions: quiz.questions.map((question) => (
        question.id === questionId ? normalizeQuizQuestion(updater(normalizeQuizQuestion(question))) : question
      )),
    }))
  }

  const moveQuestion = (questionId: string, direction: -1 | 1) => {
    updateQuiz((quiz) => {
      const nextQuestions = [...quiz.questions]
      const index = nextQuestions.findIndex((question) => question.id === questionId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= nextQuestions.length) return quiz
      const [question] = nextQuestions.splice(index, 1)
      nextQuestions.splice(nextIndex, 0, question)
      return { ...quiz, questions: nextQuestions }
    })
  }

  const duplicateQuestion = (question: CourseQuizQuestion) => {
    const duplicate: CourseQuizQuestion = {
      ...question,
      id: uid('question'),
      text: `${question.text || 'Question'} copy`,
      options: question.options.map((option) => ({ ...option, id: uid('option') })),
    }
    updateQuiz((quiz) => {
      const index = quiz.questions.findIndex((item) => item.id === question.id)
      const nextQuestions = [...quiz.questions]
      nextQuestions.splice(Math.max(0, index + 1), 0, duplicate)
      return { ...quiz, questions: nextQuestions }
    })
    setSelectedQuestionId(duplicate.id)
  }

  const deleteQuestion = (questionId: string) => {
    const deletedIndex = questions.findIndex((question) => question.id === questionId)
    const nextQuestions = questions.filter((question) => question.id !== questionId)
    const nextActiveQuestionId = activeQuestionId === questionId
      ? nextQuestions[Math.min(deletedIndex, nextQuestions.length - 1)]?.id ?? null
      : activeQuestionId

    updateQuiz((quiz) => {
      return { ...quiz, questions: quiz.questions.filter((question) => question.id !== questionId) }
    })
    setSelectedQuestionId(nextActiveQuestionId)
  }

  return (
    <section className="border-t-[3px] border-[var(--lux-line)] px-4 pb-14 pt-8">
      <div className="mx-auto grid max-w-[1180px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-hidden">
          <div className="flex flex-shrink-0 items-center justify-between gap-3 px-2 py-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">Questions</p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setAddMenuOpen((current) => !current)}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-md text-[var(--lux-text-strong)] transition',
                  addMenuOpen
                    ? 'bg-[var(--lux-primary-hover)]'
                    : 'bg-[var(--lux-primary)] hover:bg-[var(--lux-primary-hover)]',
                )}
                aria-expanded={addMenuOpen}
                aria-label={addMenuOpen ? 'Close question type picker' : 'Add question'}
                title={addMenuOpen ? 'Close' : 'Add question'}
              >
                <Plus size={17} className={cn('transition-transform', addMenuOpen && 'rotate-45')} />
              </button>
            )}
          </div>

          {addMenuOpen && !readOnly && (
            <div className="mt-2 flex-shrink-0 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 shadow-sm">
              <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
                Choose Type
              </p>
              <div className="mt-1 grid gap-1">
                {quizQuestionTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addQuestion(type)}
                    className="flex w-full items-start gap-2.5 rounded-md border border-transparent px-2.5 py-2.5 text-left transition hover:border-[var(--lux-line)] hover:bg-[var(--lux-overlay-hover)]"
                  >
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--lux-overlay)] text-[var(--lux-primary)]">
                      <QuizQuestionTypeIcon type={type} size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-5 text-[var(--lux-text-strong)]">{quizQuestionLabels[type]}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-[var(--lux-muted)]">{quizQuestionDescriptions[type]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 lux-scrollbar">
            {questions.map((question, index) => {
              const type = normalizeQuizQuestionType(question.type)
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setSelectedQuestionId(question.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition',
                    question.id === activeQuestion?.id
                      ? 'border-[var(--lux-primary)] bg-[var(--lux-overlay-hover)] text-[var(--lux-text-strong)]'
                      : 'border-transparent text-[var(--lux-muted)] hover:border-[var(--lux-line)] hover:text-[var(--lux-text-strong)]',
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[var(--lux-elevated)]">
                    <QuizQuestionTypeIcon type={type} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold uppercase tracking-wide">Question {index + 1}</span>
                    <span className="mt-0.5 block truncate text-sm">{question.text || quizQuestionLabels[type]}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {!questions.length && (
            <div className="rounded-md border border-dashed border-[var(--lux-line)] p-4 text-center text-sm text-[var(--lux-muted)]">
              No questions yet.
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {activeQuestion ? (
            <QuizQuestionEditor
              question={activeQuestion}
              questionNumber={activeIndex + 1}
              questionCount={questions.length}
              readOnly={readOnly}
              onUpdate={(updater) => updateQuestion(activeQuestion.id, updater)}
              onMoveUp={() => moveQuestion(activeQuestion.id, -1)}
              onMoveDown={() => moveQuestion(activeQuestion.id, 1)}
              onDuplicate={() => duplicateQuestion(activeQuestion)}
              onDelete={() => deleteQuestion(activeQuestion.id)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface)] p-10 text-center">
              <p className="text-lg font-bold text-[var(--lux-text-strong)]">Add your first question</p>
              {!readOnly && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {quizQuestionTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addQuestion(type)}
                      className="flex items-center gap-3 rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-4 py-3 text-left text-sm font-bold text-[var(--lux-text-strong)] transition hover:border-[var(--lux-primary)]"
                    >
                      <QuizQuestionTypeIcon type={type} size={17} />
                      {quizQuestionLabels[type]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!readOnly && (
            <div className="mt-6 flex justify-center">
              <Button size="lg" className="min-w-[160px] px-10" onClick={onFinish} disabled={saveStatus === 'saving'}>
                <Check size={16} className="mr-1" />
                Finish
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function QuizQuestionEditor({
  question,
  questionNumber,
  questionCount,
  readOnly,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: {
  question: CourseQuizQuestion
  questionNumber: number
  questionCount: number
  readOnly: boolean
  onUpdate: (updater: (question: CourseQuizQuestion) => CourseQuizQuestion) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const type = normalizeQuizQuestionType(question.type)
  const [menuOpen, setMenuOpen] = useState(false)
  const questionImageInputRef = useRef<HTMLInputElement | null>(null)
  const [questionImageUploading, setQuestionImageUploading] = useState(false)
  const [questionMediaPickerOpen, setQuestionMediaPickerOpen] = useState(false)
  const questionImageUrl = question.imageUrl ? uploadedAssetUrl(question.imageUrl) : ''

  const patchQuestion = (patch: Partial<CourseQuizQuestion>) => {
    onUpdate((current) => normalizeQuizQuestion({ ...current, ...patch }))
  }

  const applyQuestionImageFile = async (file: File) => {
    if (readOnly || questionImageUploading) return
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file.')
      return
    }

    setQuestionImageUploading(true)
    try {
      const response = await mediaApi.upload(file)
      patchQuestion({ imageUrl: uploadedAssetUrl(response.data.url) })
      toast.success('Question image uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setQuestionImageUploading(false)
    }
  }

  const applyQuestionImageAsset = (asset: MediaAsset) => {
    patchQuestion({ imageUrl: mediaPickerAssetUrl(asset) })
    setQuestionMediaPickerOpen(false)
  }

  const updateOption = (optionId: string, patch: Partial<CourseQuizQuestionOption>) => {
    onUpdate((current) => ({
      ...current,
      options: current.options.map((option) => option.id === optionId ? { ...option, ...patch } : option),
    }))
  }

  const addOption = () => {
    const option: CourseQuizQuestionOption =
      type === 'matching'
        ? { id: uid('match'), text: '', match: '', isCorrect: true }
        : type === 'fill_blank'
          ? { id: uid('answer'), text: '', isCorrect: true }
          : { id: uid('option'), text: '', isCorrect: false }
    patchQuestion({ options: [...question.options, option] })
  }

  const removeOption = (optionId: string) => {
    patchQuestion({ options: question.options.filter((option) => option.id !== optionId) })
  }

  const markChoiceCorrect = (optionId: string, checked: boolean) => {
    if (type === 'multiple_choice') {
      patchQuestion({
        options: question.options.map((option) => ({ ...option, isCorrect: option.id === optionId })),
      })
      return
    }
    patchQuestion({
      options: question.options.map((option) => option.id === optionId ? { ...option, isCorrect: checked } : option),
    })
  }

  const changeType = (nextType: CanonicalQuizQuestionType) => {
    const template = createQuizQuestion(nextType)
    onUpdate((current) => normalizeQuizQuestion({
      ...template,
      id: current.id,
      text: current.text,
      imageUrl: current.imageUrl,
      points: current.points,
      feedbackMode: current.feedbackMode,
      feedback: current.feedback,
      correctFeedback: current.correctFeedback,
      incorrectFeedback: current.incorrectFeedback,
    }))
  }

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] shadow-[var(--lux-shadow)]">
      <header className="flex flex-col gap-3 border-b border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--lux-primary)] text-[var(--lux-text-strong)]">
            <QuizQuestionTypeIcon type={type} size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">Question {questionNumber} of {questionCount}</p>
            <p className="truncate text-base font-bold text-[var(--lux-text-strong)]">{quizQuestionLabels[type]}</p>
          </div>
        </div>
        {!readOnly && (
          <div className="relative flex items-center gap-2">
            <button type="button" onClick={onMoveUp} disabled={questionNumber <= 1} className="rounded-md border border-[var(--lux-line)] px-3 py-2 text-xs font-bold text-[var(--lux-muted)] disabled:opacity-35">Up</button>
            <button type="button" onClick={onMoveDown} disabled={questionNumber >= questionCount} className="rounded-md border border-[var(--lux-line)] px-3 py-2 text-xs font-bold text-[var(--lux-muted)] disabled:opacity-35">Down</button>
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="grid h-9 w-9 place-items-center rounded-md border border-[var(--lux-line)] text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)]"
              aria-label="Question actions"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-10 w-44 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-1 shadow-[var(--lux-shadow)]">
                <button type="button" onClick={() => { onDuplicate(); setMenuOpen(false) }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[var(--lux-text)] hover:bg-[var(--lux-overlay-hover)]"><Copy size={14} /> Duplicate</button>
                <button type="button" onClick={() => { onDelete(); setMenuOpen(false) }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={14} /> Delete</button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="space-y-6 p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <Field label="Question type">
            <select
              value={type}
              onChange={(event) => changeType(event.target.value as CanonicalQuizQuestionType)}
              className={selectClass}
              disabled={readOnly}
            >
              {quizQuestionTypes.map((questionType) => (
                <option key={questionType} value={questionType}>{quizQuestionLabels[questionType]}</option>
              ))}
            </select>
          </Field>
          <Field label="Points">
            <input
              type="number"
              min={1}
              value={question.points}
              onChange={(event) => patchQuestion({ points: Math.max(1, Number(event.target.value) || 1) })}
              className={inputClass}
              readOnly={readOnly}
            />
          </Field>
        </div>

        <Field label="Question">
          <textarea
            value={question.text}
            onChange={(event) => patchQuestion({ text: event.target.value })}
            placeholder="Enter a question title here..."
            rows={3}
            className={textareaClass}
            readOnly={readOnly}
          />
        </Field>

        <Field label="Question image">
          <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
            {questionImageUrl ? (
              <div className="overflow-hidden rounded-md border border-[var(--lux-line)] bg-[var(--lux-surface)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={questionImageUrl} alt="" className="max-h-64 w-full object-contain" />
              </div>
            ) : (
              <div className="grid min-h-36 place-items-center rounded-md border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface)] text-sm font-semibold text-[var(--lux-muted)]">
                No question image
              </div>
            )}

            {!readOnly && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={questionImageUploading}
                  onClick={() => questionImageInputRef.current?.click()}
                >
                  <UploadCloud size={14} />
                  Upload
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setQuestionMediaPickerOpen(true)}
                >
                  <LibraryBig size={14} />
                  Media library
                </Button>
                {question.imageUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => patchQuestion({ imageUrl: '' })}
                  >
                    <X size={14} />
                    Remove
                  </Button>
                )}
                <input
                  ref={questionImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void applyQuestionImageFile(file)
                    event.currentTarget.value = ''
                  }}
                />
              </div>
            )}
            <input
              value={question.imageUrl ?? ''}
              onChange={(event) => patchQuestion({ imageUrl: event.target.value })}
              placeholder="Image URL"
              className={cn(inputClass, 'mt-3 w-full')}
              readOnly={readOnly}
            />
          </div>
        </Field>

        <QuizAnswerEditor
          question={question}
          type={type}
          readOnly={readOnly}
          onUpdateOption={updateOption}
          onMarkChoiceCorrect={markChoiceCorrect}
          onAddOption={addOption}
          onRemoveOption={removeOption}
        />

        <div className="grid gap-4 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4 sm:grid-cols-2">
          <Field label="Feedback mode">
            <select
              value={question.feedbackMode ?? 'any_response'}
              onChange={(event) => patchQuestion({ feedbackMode: event.target.value === 'correct_incorrect' ? 'correct_incorrect' : 'any_response' })}
              className={selectClass}
              disabled={readOnly}
            >
              <option value="any_response">Any response</option>
              <option value="correct_incorrect">Correct / Incorrect</option>
            </select>
          </Field>
          {type === 'fill_blank' && (
            <label className="flex items-center gap-2 self-end text-sm font-semibold text-[var(--lux-text)]">
              <input
                type="checkbox"
                checked={Boolean(question.caseSensitive)}
                onChange={(event) => patchQuestion({ caseSensitive: event.target.checked })}
                disabled={readOnly}
              />
              Case sensitive
            </label>
          )}
          {(question.feedbackMode ?? 'any_response') === 'any_response' ? (
            <div className="sm:col-span-2">
              <Field label="Feedback">
                <textarea
                  value={question.feedback ?? ''}
                  onChange={(event) => patchQuestion({ feedback: event.target.value })}
                  rows={3}
                  className={textareaClass}
                  readOnly={readOnly}
                />
              </Field>
            </div>
          ) : (
            <>
              <Field label="Correct feedback">
                <textarea
                  value={question.correctFeedback ?? ''}
                  onChange={(event) => patchQuestion({ correctFeedback: event.target.value })}
                  rows={3}
                  className={textareaClass}
                  readOnly={readOnly}
                />
              </Field>
              <Field label="Incorrect feedback">
                <textarea
                  value={question.incorrectFeedback ?? ''}
                  onChange={(event) => patchQuestion({ incorrectFeedback: event.target.value })}
                  rows={3}
                  className={textareaClass}
                  readOnly={readOnly}
                />
              </Field>
            </>
          )}
        </div>
      </div>
      {questionMediaPickerOpen && !readOnly && (
        <MediaPicker
          open={questionMediaPickerOpen}
          onClose={() => setQuestionMediaPickerOpen(false)}
          acceptedTypes={['IMAGE']}
          onSelect={applyQuestionImageAsset}
        />
      )}
    </article>
  )
}

function QuizAnswerEditor({
  question,
  type,
  readOnly,
  onUpdateOption,
  onMarkChoiceCorrect,
  onAddOption,
  onRemoveOption,
}: {
  question: CourseQuizQuestion
  type: CanonicalQuizQuestionType
  readOnly: boolean
  onUpdateOption: (optionId: string, patch: Partial<CourseQuizQuestionOption>) => void
  onMarkChoiceCorrect: (optionId: string, checked: boolean) => void
  onAddOption: () => void
  onRemoveOption: (optionId: string) => void
}) {
  const addLabel = type === 'matching' ? 'Add pair' : type === 'fill_blank' ? 'Add answer' : 'Add choice'

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-muted-soft)]">
          {type === 'matching' ? 'Pairs' : type === 'fill_blank' ? 'Accepted answers' : 'Choices'}
        </p>
        {!readOnly && (
          <button type="button" onClick={onAddOption} className="inline-flex items-center gap-1 rounded-md border border-[var(--lux-line)] px-3 py-2 text-xs font-bold text-[var(--lux-text)] hover:bg-[var(--lux-overlay-hover)]">
            <Plus size={14} />
            {addLabel}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {question.options.map((option, index) => {
          if (type === 'matching') {
            return (
              <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_34px]">
                <input value={option.text} onChange={(event) => onUpdateOption(option.id, { text: event.target.value })} className={inputClass} placeholder={`Prompt ${index + 1}`} readOnly={readOnly} />
                <input value={option.match ?? ''} onChange={(event) => onUpdateOption(option.id, { match: event.target.value })} className={inputClass} placeholder={`Match ${index + 1}`} readOnly={readOnly} />
                {!readOnly && <button type="button" onClick={() => onRemoveOption(option.id)} className="grid h-9 w-9 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-red-500/10 hover:text-red-400" aria-label="Remove pair"><Trash2 size={15} /></button>}
              </div>
            )
          }

          if (type === 'fill_blank') {
            return (
              <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_34px]">
                <input value={option.text} onChange={(event) => onUpdateOption(option.id, { text: event.target.value, isCorrect: true })} className={inputClass} placeholder={`Answer ${index + 1}`} readOnly={readOnly} />
                {!readOnly && <button type="button" onClick={() => onRemoveOption(option.id)} className="grid h-9 w-9 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-red-500/10 hover:text-red-400" aria-label="Remove answer"><Trash2 size={15} /></button>}
              </div>
            )
          }

          return (
            <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_34px]">
              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--lux-text)]">
                <input
                  type={type === 'multiple_choice' ? 'radio' : 'checkbox'}
                  name={`correct-${question.id}`}
                  checked={Boolean(option.isCorrect)}
                  onChange={(event) => onMarkChoiceCorrect(option.id, event.target.checked)}
                  disabled={readOnly}
                />
                Correct
              </label>
              <input value={option.text} onChange={(event) => onUpdateOption(option.id, { text: event.target.value })} className={inputClass} placeholder={`Choice ${index + 1}`} readOnly={readOnly} />
              {!readOnly && <button type="button" onClick={() => onRemoveOption(option.id)} className="grid h-9 w-9 place-items-center rounded-md text-[var(--lux-muted)] hover:bg-red-500/10 hover:text-red-400" aria-label="Remove choice"><Trash2 size={15} /></button>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function QuizQuestionTypeIcon({
  type,
  size,
  className,
}: {
  type: CanonicalQuizQuestionType
  size: number
  className?: string
}) {
  if (type === 'multiple_response') return <CheckSquare size={size} className={className} />
  if (type === 'fill_blank') return <TextCursorInput size={size} className={className} />
  if (type === 'matching') return <Columns3 size={size} className={className} />
  return <CircleDot size={size} className={className} />
}

function QuickInsertBar({
  libraryOpen,
  onToggleLibrary,
  onInsert,
}: {
  libraryOpen: boolean
  onToggleLibrary: () => void
  onInsert: (type: CourseBlockType) => void
}) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-stretch">
      <button
        type="button"
        onClick={onToggleLibrary}
        className={cn(
          'flex h-20 w-full shrink-0 flex-col items-center justify-center rounded bg-[var(--lux-primary)] px-2 text-center text-sm font-bold leading-tight text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-primary-hover)] sm:h-auto sm:w-[84px]',
          libraryOpen && 'bg-[var(--lux-primary-hover)]',
        )}
      >
        <LibraryBig size={22} />
        <span className="mt-1.5">Block library</span>
      </button>
      <div className="grid flex-1 grid-cols-2 gap-1.5 rounded border border-dashed border-[var(--lux-line-strong)] bg-[var(--lux-surface)] px-3 py-3 sm:grid-cols-4 lg:grid-cols-8">
        {quickInsertBlocks.map((block) => {
          const Icon = block.icon
          return (
            <button
              key={`${block.label}-${block.type}`}
              type="button"
              onClick={() => onInsert(block.type)}
              className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-md px-2 py-2 text-center text-xs font-semibold leading-tight text-[var(--lux-text)] transition hover:bg-[var(--lux-overlay-hover)]"
            >
              <Icon size={18} className="text-[var(--lux-text)]" />
              <span>{block.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BetweenBlocksInsert({
  disabled,
  onInsert,
}: {
  disabled: boolean
  onInsert: () => void
}) {
  if (disabled) return null

  return (
    <div className="group relative -my-1 flex h-7 items-center justify-center">
      <span className="h-px flex-1 bg-transparent transition group-hover:bg-[var(--lux-line)]" />
      <button
        type="button"
        onClick={onInsert}
        className="grid h-7 w-7 scale-90 place-items-center rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface)] text-[var(--lux-muted)] opacity-0 shadow-sm transition hover:border-[var(--lux-primary)] hover:text-[var(--lux-primary)] group-hover:scale-100 group-hover:opacity-100"
        aria-label="Insert block between items"
      >
        <Plus size={16} />
      </button>
      <span className="h-px flex-1 bg-transparent transition group-hover:bg-[var(--lux-line)]" />
    </div>
  )
}

function BlockLibraryRail({
  quizMode,
  onClose,
  onInsert,
}: {
  quizMode: boolean
  onClose: () => void
  onInsert: (type: CourseBlockType) => void
}) {
  const allowedQuizTypes: CourseBlockType[] = ['multiple_choice', 'multiple_select', 'fill_blank', 'matching']
  const groups = blockLibraryGroups.filter((item) => {
    if (!quizMode) return item.type ? !getBlockDefinition(item.type).questionOnly : true
    return item.type ? allowedQuizTypes.includes(item.type) : false
  })

  return (
    <aside className="fixed bottom-0 left-0 top-24 z-40 w-[min(280px,calc(100vw-24px))] border-r border-[var(--lux-line)] bg-[var(--lux-surface)] shadow-[var(--lux-shadow)]">
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between border-b border-[var(--lux-line)] px-4">
          <h2 className="text-sm font-bold text-[var(--lux-text-strong)]">Block library</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--lux-overlay-hover)]" aria-label="Close block library">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 lux-scrollbar">
          <div className="grid gap-1.5">
            {groups.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.type && onInsert(item.type)}
                  className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-sm font-semibold leading-tight text-[var(--lux-text)] transition hover:border-[var(--lux-line)] hover:bg-[var(--lux-overlay-hover)]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--lux-surface-soft)] text-[var(--lux-text)]">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.beta && <span className="shrink-0 rounded bg-[var(--lux-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lux-text-strong)]">Beta</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </aside>
  )
}

function BlockItem({
  block,
  currentLessonId,
  lessonDestinations,
  index,
  total,
  editing,
  readOnly,
  onEdit,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  ...dragProps
}: {
  block: CourseBlock
  currentLessonId: string
  lessonDestinations: CourseLesson[]
  index: number
  total: number
  editing: boolean
  readOnly: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (event: DragEvent) => void
  onDrop?: () => void
  onEdit: () => void
  onUpdate: (updater: (block: CourseBlock) => CourseBlock) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <article className={cn('group relative px-2 py-8 transition', editing && 'z-10')} {...dragProps}>
      {!readOnly && <div className="absolute right-[-64px] top-8 hidden items-center gap-2 rounded bg-[var(--lux-surface)] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.12)] group-hover:flex">
        <IconButton label="Move up" disabled={index === 0} onClick={onMoveUp}><ChevronDown size={20} className="rotate-180" /></IconButton>
        <IconButton label="Move down" disabled={index === total - 1} onClick={onMoveDown}><ChevronDown size={20} /></IconButton>
        <IconButton label="Duplicate" onClick={onDuplicate}><Copy size={20} /></IconButton>
        <IconButton label="Delete" onClick={onDelete}><Trash2 size={20} /></IconButton>
      </div>}

      <InlineBlockSurface
        block={block}
        currentLessonId={currentLessonId}
        lessonDestinations={lessonDestinations}
        editing={editing}
        readOnly={readOnly}
        onFocus={onEdit}
        onUpdate={onUpdate}
      />
    </article>
  )
}

function InlineBlockSurface({
  block,
  currentLessonId,
  lessonDestinations,
  editing,
  readOnly,
  onFocus,
  onUpdate,
}: {
  block: CourseBlock
  currentLessonId: string
  lessonDestinations: CourseLesson[]
  editing: boolean
  readOnly: boolean
  onFocus: () => void
  onUpdate: (updater: (block: CourseBlock) => CourseBlock) => void
}) {
  const definition = getBlockDefinition(block.type)
  const metadata = block.metadata ?? {}
  const items = block.items ?? []
  const update = (patch: Partial<CourseBlock>) => onUpdate((current) => ({ ...current, ...patch }))
  const updateMetadata = (key: string, value: unknown) => {
    onUpdate((current) => ({ ...current, metadata: { ...current.metadata, [key]: value } }))
  }
  const updateStatementStyle = (value: string) => {
    const label = statementStyleLabel(value)
    onUpdate((current) => ({
      ...current,
      title: statementCalloutLabel(current.title, label),
      metadata: { ...current.metadata, style: value },
    }))
  }
  const updateItems = (nextItems: CourseInteractionItem[]) => update({ items: nextItems })
  const updateItem = (id: string, patch: Partial<CourseInteractionItem>) => {
    updateItems(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }
  const addItem = (patch: Partial<CourseInteractionItem> = {}) => {
    updateItems([...items, { id: uid('item'), title: '', content: '', ...patch }])
  }
  const removeItem = (id: string) => updateItems(items.filter((item) => item.id !== id))
  const moveItem = (id: string, direction: -1 | 1) => {
    const currentIndex = items.findIndex((item) => item.id === id)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return
    const nextItems = [...items]
    const [item] = nextItems.splice(currentIndex, 1)
    nextItems.splice(nextIndex, 0, item)
    updateItems(nextItems)
  }
  const meta = (key: string, fallback = '') => String(metadata[key] ?? fallback)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [fileDropItemId, setFileDropItemId] = useState<string | null>(null)
  const [pendingItemUpload, setPendingItemUpload] = useState<{ id: string; kind: ItemUploadKind } | null>(null)
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [pendingMetadataImageKey, setPendingMetadataImageKey] = useState<string | null>(null)
  const [uploadingMetadataImageKey, setUploadingMetadataImageKey] = useState<string | null>(null)
  const [metadataDropKey, setMetadataDropKey] = useState<string | null>(null)
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const itemFileInputRef = useRef<HTMLInputElement | null>(null)
  const metadataImageInputRef = useRef<HTMLInputElement | null>(null)
  const pendingItemUploadRef = useRef<{ id: string; kind: ItemUploadKind } | null>(null)
  const pendingMetadataImageKeyRef = useRef<string | null>(null)
  const selectedBlockMediaTypes: MediaType[] = mediaPickerTarget
    ? mediaPickerTarget.kind === 'block'
      ? mediaTypesForBlockType(block.type)
      : mediaPickerTarget.kind === 'item'
        ? mediaTypesForItemUpload(mediaPickerTarget.uploadKind)
        : ['IMAGE']
    : ['IMAGE']

  const applyMediaAssetToBlock = (asset: MediaAsset) => {
    const url = mediaPickerAssetUrl(asset)
    onUpdate((current) => ({
      ...current,
      title: current.title || asset.originalName,
      assetUrl: url,
      metadata: {
        ...current.metadata,
        fileName: asset.originalName,
        fileSize: asset.size,
        mimeType: asset.mimetype,
        ...(current.type === 'file_download'
          ? {
              fileUrl: url,
              label: String(current.metadata?.label ?? '') || asset.originalName,
            }
          : {}),
        ...(current.type === 'resource_link' ? { url } : {}),
      },
    }))
  }

  const applyMediaPickerAsset = (asset: MediaAsset) => {
    if (!mediaPickerTarget) return
    if (mediaPickerTarget.kind === 'block') {
      applyMediaAssetToBlock(asset)
    } else if (mediaPickerTarget.kind === 'item') {
      updateItem(mediaPickerTarget.itemId, { mediaUrl: mediaPickerAssetUrl(asset) })
    } else {
      updateMetadata(mediaPickerTarget.key, uploadedAssetUrl(mediaPickerAssetUrl(asset)))
    }
    setMediaPickerTarget(null)
  }

  const applyUploadedFile = async (file: File) => {
    if (readOnly || uploading) return
    if (!acceptsDroppedFile(block, file)) {
      toast.error('This file type does not match the selected block.')
      return
    }

    setUploading(true)
    try {
      const response = await mediaApi.upload(file)
      applyMediaAssetToBlock(response.data)
      toast.success('File uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploading(false)
      setDragActive(false)
    }
  }

  const applyUploadedItemFile = async (itemId: string, file: File, kind: ItemUploadKind) => {
    if (readOnly || uploadingItemId) return
    if (!acceptsItemUploadFile(file, kind)) {
      toast.error(kind === 'image' ? 'Upload an image for this item.' : 'Upload an image, video, or audio file for this item.')
      return
    }

    setUploadingItemId(itemId)
    try {
      const response = await mediaApi.upload(file)
      const asset = response.data
      updateItem(itemId, { mediaUrl: uploadedAssetUrl(asset.url) })
      toast.success('Item media uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploadingItemId(null)
      setFileDropItemId(null)
    }
  }

  const applyUploadedMetadataImage = async (key: string, file: File) => {
    if (readOnly || uploadingMetadataImageKey) return
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file.')
      return
    }

    setUploadingMetadataImageKey(key)
    try {
      const response = await mediaApi.upload(file)
      updateMetadata(key, uploadedAssetUrl(response.data.url))
      toast.success('Image uploaded')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploadingMetadataImageKey(null)
      setMetadataDropKey(null)
    }
  }

  const openItemFileUpload = (itemId: string, kind: ItemUploadKind) => {
    const target = { id: itemId, kind }
    pendingItemUploadRef.current = target
    setPendingItemUpload(target)
    itemFileInputRef.current?.click()
  }

  const openMetadataImageUpload = (key: string) => {
    pendingMetadataImageKeyRef.current = key
    setPendingMetadataImageKey(key)
    metadataImageInputRef.current?.click()
  }

  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly) return
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void applyUploadedFile(file)
  }

  const handleFileDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly || !eventHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDragActive(true)
  }

  const moveItemTo = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const currentIndex = items.findIndex((item) => item.id === draggedId)
    const nextIndex = items.findIndex((item) => item.id === targetId)
    if (currentIndex < 0 || nextIndex < 0) return
    const nextItems = [...items]
    const [item] = nextItems.splice(currentIndex, 1)
    nextItems.splice(nextIndex, 0, item)
    updateItems(nextItems)
  }

  const handleItemDragOver = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggingItemId || draggingItemId === targetId || eventHasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleItemDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggingItemId || eventHasFiles(event)) return
    event.preventDefault()
    moveItemTo(draggingItemId, targetId)
    setDraggingItemId(null)
  }

  const handleItemMediaDragOver = (event: DragEvent<HTMLDivElement>, itemId: string, kind: ItemUploadKind) => {
    if (readOnly || !eventHasFiles(event)) return
    const file = event.dataTransfer.items?.[0]
    if (file && kind === 'image' && file.type && !file.type.startsWith('image/')) return
    event.preventDefault()
    event.stopPropagation()
    setFileDropItemId(itemId)
  }

  const handleItemFileDrop = (event: DragEvent<HTMLDivElement>, itemId: string, kind: ItemUploadKind) => {
    if (readOnly) return
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void applyUploadedItemFile(itemId, file, kind)
  }

  const handleMetadataImageDragOver = (event: DragEvent<HTMLDivElement>, key: string) => {
    if (readOnly || !eventHasFiles(event)) return
    const file = event.dataTransfer.items?.[0]
    if (file?.type && !file.type.startsWith('image/')) return
    event.preventDefault()
    event.stopPropagation()
    setMetadataDropKey(key)
  }

  const handleMetadataImageDrop = (event: DragEvent<HTMLDivElement>, key: string) => {
    if (readOnly) return
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    setMetadataDropKey(null)
    void applyUploadedMetadataImage(key, file)
  }

  const renderItemMediaControls = (item: CourseInteractionItem, label: string, kind: ItemUploadKind = 'media') => (
    <div
      className={cn(
        'mt-2 space-y-2 rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 transition',
        fileDropItemId === item.id && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
      )}
      onDragOver={(event) => handleItemMediaDragOver(event, item.id, kind)}
      onDragEnter={(event) => handleItemMediaDragOver(event, item.id, kind)}
      onDragLeave={() => setFileDropItemId((current) => current === item.id ? null : current)}
      onDrop={(event) => handleItemFileDrop(event, item.id, kind)}
    >
      <input
        value={item.mediaUrl ?? ''}
        onChange={(event) => updateItem(item.id, { mediaUrl: uploadedAssetUrl(event.target.value) })}
        placeholder={`${label} URL`}
        className={inlineSurfaceInputClass}
      />
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 px-2 text-xs font-medium text-[var(--lux-muted)]">
          <UploadCloud size={14} className="text-[var(--lux-primary-muted)]" />
          <span className="min-w-0 flex-1">{kind === 'image' ? 'Drop an image here' : 'Drop image, video, or audio here'}</span>
          <Button
            size="sm"
            variant="secondary"
            loading={uploadingItemId === item.id}
            onClick={() => openItemFileUpload(item.id, kind)}
          >
            Upload
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMediaPickerTarget({ kind: 'item', itemId: item.id, uploadKind: kind })}
          >
            Media library
          </Button>
        </div>
      )}
    </div>
  )

  const renderMetadataImageUpload = (key: string, label: string) => (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-2 text-xs font-medium text-[var(--lux-muted)] transition',
        metadataDropKey === key && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
      )}
      onDragOver={(event) => handleMetadataImageDragOver(event, key)}
      onDragEnter={(event) => handleMetadataImageDragOver(event, key)}
      onDragLeave={() => setMetadataDropKey((current) => current === key ? null : current)}
      onDrop={(event) => handleMetadataImageDrop(event, key)}
    >
      <UploadCloud size={14} className="text-[var(--lux-primary-muted)]" />
      <span className="min-w-0 flex-1">{label} or drop an image</span>
      <Button
        size="sm"
        variant="secondary"
        loading={uploadingMetadataImageKey === key}
        onClick={() => openMetadataImageUpload(key)}
      >
        Upload
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setMediaPickerTarget({ kind: 'metadata', key })}
      >
        Media library
      </Button>
    </div>
  )

  return (
    <div
      className={cn(
        'rounded-lg border border-transparent px-4 py-4 transition',
        editing && 'border-[var(--lux-line)] bg-[var(--lux-surface-soft)] shadow-[var(--lux-shadow)]',
      )}
      onFocusCapture={readOnly ? undefined : onFocus}
      onClick={readOnly ? undefined : onFocus}
    >
      <fieldset disabled={readOnly} className="contents">
      <input
        ref={itemFileInputRef}
        type="file"
        accept={itemMediaAccept}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          const target = pendingItemUploadRef.current ?? pendingItemUpload
          if (file && target) void applyUploadedItemFile(target.id, file, target.kind)
          event.currentTarget.value = ''
          pendingItemUploadRef.current = null
          setPendingItemUpload(null)
        }}
      />
      <input
        ref={metadataImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          const targetKey = pendingMetadataImageKeyRef.current ?? pendingMetadataImageKey
          if (file && targetKey) void applyUploadedMetadataImage(targetKey, file)
          event.currentTarget.value = ''
          pendingMetadataImageKeyRef.current = null
          setPendingMetadataImageKey(null)
        }}
      />
      {(() => {
        if (block.type === 'heading') {
          return (
            <div className="space-y-2">
              <select
                value={meta('level', 'H2')}
                onChange={(event) => updateMetadata('level', event.target.value)}
                className={cn(selectClass, 'w-28')}
              >
                <option value="H1">H1</option>
                <option value="H2">H2</option>
                <option value="H3">H3</option>
              </select>
              <input
                value={block.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Heading"
                className={cn(ghostInputClass, 'text-3xl font-bold leading-tight text-[var(--lux-text-strong)]')}
              />
              <input
                value={meta('subtitle')}
                onChange={(event) => updateMetadata('subtitle', event.target.value)}
                placeholder="Subtitle"
                className={cn(ghostInputClass, 'text-lg text-[var(--lux-muted)]')}
              />
            </div>
          )
        }

        if (block.type === 'text' || block.type === 'paragraph') {
          return (
            <div className="space-y-3">
              <input
                value={block.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Heading"
                className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')}
              />
              <textarea
                value={block.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
                rows={5}
                placeholder="Start writing..."
                className={cn(ghostInputClass, 'resize-none font-serif text-2xl leading-9')}
              />
            </div>
          )
        }

        if (block.type === 'callout') {
          return (
            <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <select
                  value={statementStyleLabel(meta('style', 'Info'))}
                  onChange={(event) => {
                    const label = statementStyleLabel(event.target.value)
                    onUpdate((current) => ({
                      ...current,
                      title: statementCalloutLabel(current.title, label),
                      metadata: { ...current.metadata, style: label },
                    }))
                  }}
                  className={selectClass}
                >
                  {['Info', 'Warning', 'Tip', 'Note'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <input
                  value={block.title ?? ''}
                  onChange={(event) => update({ title: event.target.value })}
                  placeholder={definition.label}
                  className={cn(ghostInputClass, 'min-w-[180px] flex-1 text-lg font-bold text-[var(--lux-text-strong)]')}
                />
              </div>
              <textarea
                value={block.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
                rows={3}
                placeholder="Add emphasis text..."
                className={cn(inlineSurfaceTextareaClass, 'text-xl font-semibold leading-8')}
              />
            </div>
          )
        }

        if (block.type === 'statement') {
          return (
            <div className="space-y-3 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
              <select
                value={statementStyleLabel(meta('style', 'Info'))}
                onChange={(event) => updateStatementStyle(event.target.value)}
                className={selectClass}
              >
                {['Info', 'Warning', 'Tip', 'Note'].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <textarea
                value={block.content ?? ''}
                onChange={(event) => {
                  const label = statementStyleLabel(meta('style', 'Info'))
                  update({
                    content: event.target.value,
                    title: statementCalloutLabel(block.title, label),
                  })
                }}
                rows={4}
                placeholder="Key takeaway, summary, or core concept..."
                className={cn(inlineSurfaceTextareaClass, 'text-2xl font-semibold leading-9')}
              />
            </div>
          )
        }

        if (block.type === 'quote') {
          return (
            <figure className="space-y-4 border-l-4 border-[var(--lux-primary)] pl-6">
              <textarea
                value={block.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
                rows={3}
                placeholder="Add quote..."
                className={cn(ghostInputClass, 'resize-none font-serif text-3xl leading-tight text-[var(--lux-text-strong)]')}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
                <input value={meta('attributionName')} onChange={(event) => updateMetadata('attributionName', event.target.value)} placeholder="Attribution" className={inlineSurfaceInputClass} />
                <input value={meta('attributionRole')} onChange={(event) => updateMetadata('attributionRole', event.target.value)} placeholder="Role or source" className={inlineSurfaceInputClass} />
              </div>
              <MetadataFields block={block} onChange={updateMetadata} />
              {renderMetadataImageUpload('avatarUrl', 'Upload avatar image')}
            </figure>
          )
        }

        if (['numbered_list', 'list', 'checklist', 'ordering', 'process_steps', 'timeline', 'lesson_summary'].includes(block.type)) {
          const ordered = ['numbered_list', 'ordering', 'process_steps', 'timeline'].includes(block.type)
          const supportsItemMedia = block.type === 'process_steps'
          return (
            <div className="space-y-5">
              <input
                value={block.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
                placeholder={definition.label}
                className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')}
              />
              {block.type === 'process_steps' && (
                <>
                  <MetadataFields block={block} onChange={updateMetadata} />
                  {renderMetadataImageUpload('introImageUrl', 'Upload process intro image')}
                </>
              )}
              <div className="space-y-4">
                {items.map((item, itemIndex) => (
                  <div
                    key={item.id}
                    draggable={!readOnly}
                    onDragStart={() => setDraggingItemId(item.id)}
                    onDragOver={(event) => handleItemDragOver(event, item.id)}
                    onDrop={(event) => handleItemDrop(event, item.id)}
                    onDragEnd={() => setDraggingItemId(null)}
                    className={cn(
                      'grid gap-4 rounded-lg border border-transparent p-2 transition sm:grid-cols-[1fr_auto]',
                      draggingItemId === item.id && 'border-[var(--lux-primary)] opacity-60',
                    )}
                  >
                    <div className="space-y-2">
                      <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder={ordered ? 'Step title' : 'Item title'} className={cn(inlineSurfaceInputClass, 'text-lg font-semibold')} />
                      <textarea value={item.content ?? ''} onChange={(event) => updateItem(item.id, { content: event.target.value })} rows={2} placeholder="Detail" className={inlineSurfaceTextareaClass} />
                      {supportsItemMedia && renderItemMediaControls(item, 'Step media')}
                    </div>
                    {!readOnly && (
                      <div className="flex items-start justify-end gap-1">
                        <IconButton label="Drag item"><GripVertical size={16} /></IconButton>
                        <IconButton label="Move item up" disabled={itemIndex === 0} onClick={() => moveItem(item.id, -1)}><ChevronDown size={16} className="rotate-180" /></IconButton>
                        <IconButton label="Move item down" disabled={itemIndex === items.length - 1} onClick={() => moveItem(item.id, 1)}><ChevronDown size={16} /></IconButton>
                        <IconButton label="Remove item" onClick={() => removeItem(item.id)}><Trash2 size={16} /></IconButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem()}>Add item</InlineAddButton>}
            </div>
          )
        }

        if (block.type === 'divider' || block.type === 'spacer') {
          return (
            <div className="py-4">
              <div className="flex items-center gap-4">
                <span className="h-px flex-1 bg-[var(--lux-line)]" />
                <input
                  value={meta('label')}
                  onChange={(event) => updateMetadata('label', event.target.value)}
                  placeholder={block.type === 'spacer' ? 'Spacer' : 'Divider'}
                  className="w-40 bg-transparent text-center text-xs font-bold uppercase text-[var(--lux-muted)] outline-none placeholder:text-[var(--lux-muted-soft)]"
                />
                <span className="h-px flex-1 bg-[var(--lux-line)]" />
              </div>
            </div>
          )
        }

        if (['image', 'video', 'audio', 'attachment', 'document', 'file_download', 'resource_link'].includes(block.type)) {
          const isImage = block.type === 'image'
          const isVideo = block.type === 'video'
          const isAudio = block.type === 'audio'
          const acceptsUpload = uploadableBlockTypes.includes(block.type)
          return (
            <div className="space-y-4">
                <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={definition.label} className={cn(ghostInputClass, 'text-xl font-bold text-[var(--lux-text-strong)]')} />
              <div
                className={cn(
                  'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5 transition',
                  acceptsUpload && !readOnly && dragActive && 'border-[var(--lux-primary)] bg-[var(--lux-primary-soft)]',
                )}
                onDragOver={acceptsUpload ? handleFileDragOver : undefined}
                onDragEnter={acceptsUpload ? handleFileDragOver : undefined}
                onDragLeave={acceptsUpload ? (event) => {
                  if (!eventHasFiles(event)) return
                  event.preventDefault()
                  event.stopPropagation()
                  setDragActive(false)
                } : undefined}
                onDrop={acceptsUpload ? handleFileDrop : undefined}
              >
                {isImage && block.assetUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={block.assetUrl} alt={meta('alt')} className="max-h-[420px] w-full rounded object-contain" />
                ) : isVideo && block.assetUrl ? (
                  <video controls src={block.assetUrl} className="w-full rounded" />
                ) : isAudio && block.assetUrl ? (
                  <audio controls src={block.assetUrl} className="w-full" />
                ) : block.assetUrl ? (
                  <a
                    href={block.assetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-32 items-center gap-3 rounded border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4 text-sm text-[var(--lux-text)] hover:border-[var(--lux-primary)]"
                  >
                    <Download size={26} className="text-[var(--lux-primary-muted)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{meta('fileName', block.title || definition.label)}</span>
                      <span className="mt-1 block truncate text-xs text-[var(--lux-muted)]">{block.assetUrl}</span>
                    </span>
                  </a>
                ) : (
                  <div className="grid min-h-40 place-items-center rounded border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-center text-sm text-[var(--lux-muted)]">
                    <div>
                      {isImage ? <ImageIcon className="mx-auto mb-2" size={28} /> : isVideo ? <Video className="mx-auto mb-2" size={28} /> : acceptsUpload ? <UploadCloud className="mx-auto mb-2" size={28} /> : <Download className="mx-auto mb-2" size={28} />}
                      {acceptsUpload ? 'No file selected' : 'Add media URL below'}
                    </div>
                  </div>
                )}
                {acceptsUpload && !readOnly && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud size={14} className="mr-1" />
                      Upload file
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMediaPickerTarget({ kind: 'block' })}
                    >
                      Media library
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={acceptForBlockType(block.type)}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        if (file) void applyUploadedFile(file)
                        event.currentTarget.value = ''
                      }}
                    />
                  </div>
                )}
                <input value={block.assetUrl ?? ''} onChange={(event) => update({ assetUrl: event.target.value })} placeholder="Media or file URL" className={cn(inputClass, 'mt-4 w-full')} />
              </div>
              <input value={meta('caption', meta('label'))} onChange={(event) => updateMetadata(block.type === 'file_download' ? 'label' : 'caption', event.target.value)} placeholder="Caption or display label" className={inlineSurfaceInputClass} />
            </div>
          )
        }

        if (block.type === 'image_gallery' || block.type === 'gallery') {
          return (
            <div className="space-y-4">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Gallery title" className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    draggable={!readOnly}
                    onDragStart={() => setDraggingItemId(item.id)}
                    onDragOver={(event) => handleItemDragOver(event, item.id)}
                    onDrop={(event) => handleItemDrop(event, item.id)}
                    onDragEnd={() => setDraggingItemId(null)}
                    className={cn(
                      'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-3 transition',
                      draggingItemId === item.id && 'border-[var(--lux-primary)] opacity-60',
                    )}
                  >
                    {item.mediaUrl ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded bg-[var(--lux-surface-soft)]">
                        <Image
                          src={uploadedAssetUrl(item.mediaUrl)}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 240px, (min-width: 640px) 50vw, 100vw"
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="grid aspect-video place-items-center rounded bg-[var(--lux-surface-soft)] text-sm text-[var(--lux-muted)]">Image</div>
                    )}
                    {renderItemMediaControls(item, 'Image', 'image')}
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder="Caption" className={cn(inlineSurfaceInputClass, 'mt-1')} />
                    {!readOnly && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--lux-muted)]"><GripVertical size={13} /> Drag</span>
                        <button type="button" onClick={() => removeItem(item.id)} className="text-xs font-semibold text-[var(--lux-muted)] hover:text-red-400">Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem({ mediaUrl: '' })}>Add image</InlineAddButton>}
            </div>
          )
        }

        if (branchingDecisionBlockTypes.includes(block.type)) {
          const destinations = lessonDestinations.filter((lesson) => lesson.id !== currentLessonId)
          return (
            <div className="space-y-4">
              <div>
                <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={block.type === 'choice_point' ? 'Decision title' : 'Branching dialogue title'} className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
                <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={3} placeholder="Set up the choice for the learner..." className={cn(inlineSurfaceTextareaClass, 'mt-2')} />
              </div>
              <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-3 text-xs leading-5 text-[var(--lux-muted)]">
                Each choice must point to a different course item. The selected route is used in preview and in the exported SCORM package.
              </div>
              <div className="space-y-3">
                {items.map((item, itemIndex) => (
                  <div key={item.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-[var(--lux-primary-muted)]">Choice {itemIndex + 1}</p>
                      {!readOnly && <IconButton label={`Remove choice ${itemIndex + 1}`} onClick={() => removeItem(item.id)}><Trash2 size={14} /></IconButton>}
                    </div>
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder="Choice label" className={cn(inlineSurfaceInputClass, 'mt-2 font-semibold')} />
                    <textarea value={item.content ?? ''} onChange={(event) => updateItem(item.id, { content: event.target.value })} rows={2} placeholder="Optional feedback shown before routing" className={cn(inlineSurfaceTextareaClass, 'mt-2')} />
                    <select value={item.match ?? ''} onChange={(event) => updateItem(item.id, { match: event.target.value })} className={cn(selectClass, 'mt-2 w-full')} disabled={readOnly}>
                      <option value="">Choose destination...</option>
                      {destinations.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.type === 'quiz' ? 'Quiz' : 'Lesson'}: {lesson.title || 'Untitled item'}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem({ match: '' })}>Add choice</InlineAddButton>}
              {!destinations.length && <p className="text-xs text-amber-500">Add another course item before linking this decision.</p>}
            </div>
          )
        }

        if (['accordion', 'tabs', 'flashcards', 'reveal', 'sorting_activity', 'sorting', 'matching', 'dialogue', 'consequence', 'decision_recap', 'branch_merge', 'conditional_gate', 'character_monologue', 'before_after', 'hotspot', 'labeled_graphic', 'scenario'].includes(block.type)) {
          const isSortingBlock = ['sorting_activity', 'sorting'].includes(block.type)
          const supportsPanelMedia = ['accordion', 'tabs', 'flashcards'].includes(block.type)
          return (
            <div className="space-y-4">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={definition.label} className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={3} placeholder="Prompt or intro" className={inlineSurfaceTextareaClass} />
              {(['accordion', 'tabs', 'flashcards'].includes(block.type) || isSortingBlock) && <MetadataFields block={block} onChange={updateMetadata} />}
              <div className={cn('grid gap-3', block.type === 'flashcards' && 'sm:grid-cols-2')}>
                {items.map((item, itemIndex) => (
                  <div
                    key={item.id}
                    draggable={!readOnly}
                    onDragStart={() => setDraggingItemId(item.id)}
                    onDragOver={(event) => handleItemDragOver(event, item.id)}
                    onDrop={(event) => handleItemDrop(event, item.id)}
                    onDragEnd={() => setDraggingItemId(null)}
                    className={cn(
                      'rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4 transition',
                      draggingItemId === item.id && 'border-[var(--lux-primary)] opacity-60',
                    )}
                  >
                    {!readOnly && (
                      <div className="mb-3 flex items-center justify-end gap-1">
                        <IconButton label="Drag item"><GripVertical size={14} /></IconButton>
                        <IconButton label="Move item up" disabled={itemIndex === 0} onClick={() => moveItem(item.id, -1)}><ChevronDown size={14} className="rotate-180" /></IconButton>
                        <IconButton label="Move item down" disabled={itemIndex === items.length - 1} onClick={() => moveItem(item.id, 1)}><ChevronDown size={14} /></IconButton>
                        <IconButton label="Remove" onClick={() => removeItem(item.id)}><Trash2 size={14} /></IconButton>
                      </div>
                    )}
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value.slice(0, isSortingBlock ? 80 : undefined) })} placeholder={isSortingBlock ? 'Sortable item text' : block.type === 'flashcards' ? 'Front side' : block.type === 'tabs' ? 'Tab title' : block.type === 'accordion' ? 'Header' : 'Title'} className={cn(inlineSurfaceInputClass, 'font-semibold')} />
                    <textarea value={item.content ?? ''} onChange={(event) => updateItem(item.id, { content: event.target.value })} rows={3} placeholder={isSortingBlock ? 'Optional feedback or note' : block.type === 'flashcards' ? 'Back side' : block.type === 'matching' ? 'Category or response' : 'Content'} className={cn(inlineSurfaceTextareaClass, 'mt-2')} />
                    {supportsPanelMedia && renderItemMediaControls(item, block.type === 'flashcards' ? 'Card image' : 'Panel media')}
                    {block.type === 'flashcards' && item.mediaUrl && (
                      <div className="mt-2 inline-flex w-fit overflow-hidden rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface)] p-1">
                        {(['front', 'back'] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            onClick={() => updateItem(item.id, { match: side })}
                            className={cn(
                              'px-3 py-1 text-xs font-bold capitalize transition',
                              (item.match || 'front') === side ? 'bg-[var(--lux-primary)] text-white rounded-full' : 'text-[var(--lux-muted)] hover:text-[var(--lux-text-strong)]'
                            )}
                          >
                            Image on {side}
                          </button>
                        ))}
                      </div>
                    )}
                    {['matching', 'sorting_activity', 'sorting'].includes(block.type) && (
                      <input value={item.match ?? ''} onChange={(event) => updateItem(item.id, { match: event.target.value })} placeholder={isSortingBlock ? 'Target category' : 'Match or category'} className={cn(inlineSurfaceInputClass, 'mt-2')} />
                    )}
                    {isSortingBlock && <p className="mt-2 text-xs font-medium text-[var(--lux-muted-soft)]">Items are capped at 80 characters. Use up to 4 unique target categories.</p>}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem()}>{isSortingBlock ? 'Add sortable item' : block.type === 'flashcards' ? 'Add card' : 'Add panel'}</InlineAddButton>}
            </div>
          )
        }

        if (isQuestionBlock(block.type) || block.type === 'knowledge_check') {
          return (
            <div className="space-y-4 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Question" className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={2} placeholder="Optional instructions" className={inlineSurfaceTextareaClass} />
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 sm:grid-cols-[auto_1fr_auto]">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--lux-muted)]">
                      <input
                        type={block.type === 'multiple_select' ? 'checkbox' : 'radio'}
                        name={`correct-${block.id}`}
                        checked={item.content === 'true'}
                        onChange={(event) => updateItem(item.id, { content: event.target.checked ? 'true' : 'false' })}
                      />
                      Correct
                    </label>
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder="Answer" className={inlineSurfaceInputClass} />
                    {!readOnly && <IconButton label="Remove answer" onClick={() => removeItem(item.id)}><Trash2 size={14} /></IconButton>}
                  </div>
                ))}
              </div>
              {!readOnly && <InlineAddButton onClick={() => addItem({ content: 'false' })}>Add answer</InlineAddButton>}
              <QuestionCommonSettings block={block} onChange={updateMetadata} />
            </div>
          )
        }

        if (block.type === 'table') {
          return (
            <div className="space-y-4">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Table title" className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={5} placeholder="Paste table rows as CSV or tab-separated text" className={cn(textareaClass, 'font-mono')} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Rows"><input type="number" value={Number(metadata.rows ?? 3)} onChange={(event) => updateMetadata('rows', Number(event.target.value))} className={inputClass} /></Field>
                <Field label="Columns"><input type="number" value={Number(metadata.columns ?? 3)} onChange={(event) => updateMetadata('columns', Number(event.target.value))} className={inputClass} /></Field>
                <label className="flex items-end gap-2 pb-2 text-sm text-[var(--lux-muted)]"><input type="checkbox" checked={Boolean(metadata.headerRow ?? true)} onChange={(event) => updateMetadata('headerRow', event.target.checked)} /> Header row</label>
              </div>
            </div>
          )
        }

        if (block.type === 'chart') {
          const chartItems = chartItemsForEditor(metadata.data)
          const updateChartItems = (nextItems: ChartDataItem[]) => updateMetadata('data', chartDataToString(nextItems.slice(0, 12)))
          const updateChartItem = (itemId: string, patch: Partial<ChartDataItem>) => {
            updateChartItems(chartItems.map((item) => item.id === itemId ? { ...item, ...patch } : item))
          }
          const removeChartItem = (itemId: string) => updateChartItems(chartItems.filter((item) => item.id !== itemId))

          return (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <input value={meta('chartTitle', block.title ?? '')} onChange={(event) => updateMetadata('chartTitle', event.target.value)} placeholder="Chart title" className={cn(inlineSurfaceInputClass, 'min-w-[240px] flex-1 text-xl font-bold')} />
                <select value={meta('chartType', 'bar')} onChange={(event) => updateMetadata('chartType', event.target.value)} className={selectClass}>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie</option>
                </select>
              </div>
              <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-3">
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_112px_32px] gap-2 px-1 text-xs font-bold uppercase tracking-wide text-[var(--lux-muted-soft)]">
                  <span>Label</span>
                  <span>Value</span>
                  <span />
                </div>
                <div className="space-y-2">
                  {chartItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_112px_32px] gap-2">
                      <input
                        value={item.label}
                        maxLength={30}
                        onChange={(event) => updateChartItem(item.id, { label: event.target.value.slice(0, 30) })}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        value={item.value}
                        min={0}
                        onChange={(event) => updateChartItem(item.id, { value: Number(event.target.value) || 0 })}
                        className={inputClass}
                      />
                      {!readOnly && (
                        <button type="button" onClick={() => removeChartItem(item.id)} className="grid h-10 w-8 place-items-center rounded-lg text-[var(--lux-muted-soft)] hover:bg-red-500/10 hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && chartItems.length < 12 && (
                  <button
                    type="button"
                    onClick={() => updateChartItems([...chartItems, { id: uid('chart'), label: `Item ${chartItems.length + 1}`, value: 0 }])}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]"
                  >
                    <Plus size={14} />
                    Add data item
                  </button>
                )}
              </div>
              <input value={meta('axisLabels')} onChange={(event) => updateMetadata('axisLabels', event.target.value)} placeholder="Axis labels" className={inlineSurfaceInputClass} />
            </div>
          )
        }

        if (block.type === 'code') {
          return (
            <div className="space-y-3">
              <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder="Code title" className={cn(ghostInputClass, 'text-xl font-bold text-[var(--lux-text-strong)]')} />
              <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={8} placeholder="Paste code..." className={cn(textareaClass, 'font-mono')} />
            </div>
          )
        }

        if (['continue_button', 'button', 'restart_button'].includes(block.type)) {
          return (
            <div className="flex flex-col items-center gap-4 py-6">
              <input value={meta('label', block.content || block.title || definition.label)} onChange={(event) => updateMetadata('label', event.target.value)} className="w-full max-w-xs rounded-full bg-[var(--lux-primary)] px-6 py-3 text-center text-base font-bold text-[var(--lux-text-strong)] outline-none placeholder:text-[var(--lux-text-strong)]/70" />
            </div>
          )
        }

        return (
          <div className="space-y-3">
            <input value={block.title ?? ''} onChange={(event) => update({ title: event.target.value })} placeholder={definition.label} className={cn(ghostInputClass, 'text-2xl font-bold text-[var(--lux-text-strong)]')} />
            <textarea value={block.content ?? ''} onChange={(event) => update({ content: event.target.value })} rows={4} placeholder={definition.description} className={inlineSurfaceTextareaClass} />
            <MetadataFields block={block} onChange={updateMetadata} />
            {items.length > 0 && <ItemsEditor block={block} readOnly={readOnly} onUpdateItems={updateItems} />}
          </div>
        )
      })()}
      </fieldset>
      {mediaPickerTarget && !readOnly && (
        <MediaPicker
          open={Boolean(mediaPickerTarget)}
          onClose={() => setMediaPickerTarget(null)}
          acceptedTypes={selectedBlockMediaTypes}
          onSelect={applyMediaPickerAsset}
        />
      )}
    </div>
  )
}

function InlineAddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--lux-primary-muted)] hover:text-[var(--lux-primary)]"
    >
      <Plus size={14} />
      {children}
    </button>
  )
}

function MetadataFields({
  block,
  onChange,
}: {
  block: CourseBlock
  onChange: (key: string, value: unknown) => void
}) {
  const metadata = block.metadata ?? {}
  const fields: Array<{ key: string; label: string; type?: 'text' | 'number' | 'boolean' | 'select'; options?: string[] }> = []

  if (block.type === 'heading') fields.push({ key: 'subtitle', label: 'Subtitle' }, { key: 'level', label: 'Level', type: 'select', options: ['H1', 'H2', 'H3'] })
  if (block.type === 'callout') fields.push({ key: 'style', label: 'Style', type: 'select', options: ['Info', 'Warning', 'Tip', 'Note'] })
  if (block.type === 'statement') fields.push({ key: 'style', label: 'Style', type: 'select', options: ['Info', 'Warning', 'Tip', 'Note'] })
  if (block.type === 'quote') fields.push({ key: 'layout', label: 'Layout', type: 'select', options: ['standard'] }, { key: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] }, { key: 'spacing', label: 'Spacing', type: 'select', options: ['compact', 'normal', 'wide'] }, { key: 'showQuoteMark', label: 'Quote mark', type: 'boolean' }, { key: 'showAvatar', label: 'Avatar', type: 'boolean' }, { key: 'avatarUrl', label: 'Avatar URL' })
  if (block.type === 'divider') fields.push({ key: 'label', label: 'Label' }, { key: 'style', label: 'Style', type: 'select', options: ['solid', 'dashed', 'dotted'] })
  if (block.type === 'image') fields.push({ key: 'caption', label: 'Caption' }, { key: 'alt', label: 'Alt text' }, { key: 'width', label: 'Width', type: 'select', options: ['small', 'medium', 'full'] })
  if (block.type === 'image_gallery') fields.push({ key: 'layout', label: 'Layout', type: 'select', options: ['2-col grid', '3-col grid', 'carousel'] })
  if (block.type === 'video') fields.push({ key: 'autoplay', label: 'Autoplay', type: 'boolean' }, { key: 'caption', label: 'Caption' })
  if (block.type === 'audio') fields.push({ key: 'transcript', label: 'Transcript' })
  if (block.type === 'dialogue' || block.type === 'branching_dialogue') fields.push({ key: 'bubbleStyle', label: 'Speech bubble style', type: 'select', options: ['Chat', 'Screenplay', 'Comic Strip'] })
  if (block.type === 'character_monologue') fields.push({ key: 'characterName', label: 'Character name' }, { key: 'avatarUrl', label: 'Avatar URL' }, { key: 'emotion', label: 'Emotion', type: 'select', options: ['happy', 'neutral', 'concerned', 'angry', 'surprised'] }, { key: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] })
  if (block.type === 'fill_blank') fields.push({ key: 'acceptedAnswers', label: 'Accepted answers' }, { key: 'caseSensitive', label: 'Case sensitive', type: 'boolean' })
  if (block.type === 'true_false') fields.push({ key: 'correctAnswer', label: 'Correct answer', type: 'select', options: ['True', 'False'] }, { key: 'explanation', label: 'Explanation' })
  if (block.type === 'hotspot') fields.push({ key: 'imageUrl', label: 'Image URL' }, { key: 'regions', label: 'Hotspot regions' })
  if (block.type === 'short_answer') fields.push({ key: 'keywords', label: 'Keyword list' }, { key: 'manualReview', label: 'Manual review', type: 'boolean' })
  if (block.type === 'likert') fields.push({ key: 'scaleSize', label: 'Scale size', type: 'select', options: ['5', '7'] }, { key: 'lowLabel', label: 'Low label' }, { key: 'highLabel', label: 'High label' })
  if (block.type === 'rating_slider') fields.push({ key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }, { key: 'step', label: 'Step', type: 'number' }, { key: 'minLabel', label: 'Min label' }, { key: 'maxLabel', label: 'Max label' })
  if (block.type === 'conditional_gate') fields.push({ key: 'conditionType', label: 'Condition type', type: 'select', options: ['passed quiz', 'viewed lesson', 'answered question correctly'] }, { key: 'target', label: 'Target lesson or quiz' }, { key: 'lockedMessage', label: 'Locked message' })
  if (block.type === 'timeline') fields.push({ key: 'orientation', label: 'Orientation', type: 'select', options: ['horizontal', 'vertical'] })
  if (block.type === 'checklist') fields.push({ key: 'showProgress', label: 'Show progress', type: 'boolean' })
  if (block.type === 'reveal') fields.push({ key: 'triggerLabel', label: 'Trigger label' }, { key: 'hiddenContent', label: 'Hidden content' })
  if (block.type === 'accordion') fields.push({ key: 'behavior', label: 'Open behavior', type: 'select', options: ['single', 'multiple'] })
  if (block.type === 'tabs') fields.push({ key: 'overflowArrows', label: 'Overflow arrows', type: 'boolean' })
  if (block.type === 'flashcards') fields.push({ key: 'layout', label: 'Layout', type: 'select', options: ['grid', 'stack'] }, { key: 'imageSide', label: 'Image side', type: 'select', options: ['front', 'back'] }, { key: 'clickPrompt', label: 'Flip prompt' })
  if (block.type === 'sorting_activity') fields.push({ key: 'instructions', label: 'Instructions' }, { key: 'completionMessage', label: 'Completion message' })
  if (block.type === 'before_after') fields.push({ key: 'beforeImage', label: 'Before image' }, { key: 'afterImage', label: 'After image' }, { key: 'beforeLabel', label: 'Before label' }, { key: 'afterLabel', label: 'After label' })
  if (block.type === 'table') fields.push({ key: 'rows', label: 'Rows', type: 'number' }, { key: 'columns', label: 'Columns', type: 'number' }, { key: 'headerRow', label: 'Header row', type: 'boolean' })
  if (block.type === 'chart') fields.push({ key: 'chartType', label: 'Chart type', type: 'select', options: ['bar', 'line', 'pie'] }, { key: 'axisLabels', label: 'Axis labels' }, { key: 'chartTitle', label: 'Chart title' })
  if (block.type === 'resource_link') fields.push({ key: 'url', label: 'URL' }, { key: 'icon', label: 'Icon' })
  if (block.type === 'file_download') fields.push({ key: 'fileUrl', label: 'File URL' }, { key: 'label', label: 'Display label' }, { key: 'description', label: 'Description' })
  if (block.type === 'glossary') fields.push({ key: 'term', label: 'Term' }, { key: 'definition', label: 'Definition' }, { key: 'example', label: 'Example sentence' })
  if (block.type === 'process_steps') fields.push({ key: 'introTitle', label: 'Intro title' }, { key: 'introText', label: 'Intro text' }, { key: 'introImageUrl', label: 'Intro image URL' }, { key: 'startLabel', label: 'Start button' }, { key: 'summaryTitle', label: 'Summary title' }, { key: 'summaryText', label: 'Summary text' }, { key: 'restartLabel', label: 'Restart button' })
  if (block.type === 'continue_button') fields.push({ key: 'label', label: 'Button label' }, { key: 'completionType', label: 'Completion type', type: 'select', options: ['None', 'Complete Block Directly Above', 'Complete All Blocks Above'] }, { key: 'lockedHint', label: 'Locked hint' }, { key: 'unlockedHint', label: 'Unlocked hint' }, { key: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] })
  if (block.type === 'score_summary') fields.push({ key: 'sourceQuiz', label: 'Source quiz' }, { key: 'passMessage', label: 'Pass message' }, { key: 'failMessage', label: 'Fail message' })
  if (block.type === 'certificate') fields.push({ key: 'logoUrl', label: 'Logo URL' }, { key: 'signatureUrl', label: 'Signature URL' })
  if (block.type === 'completion_message') fields.push({ key: 'imageUrl', label: 'Optional image' })
  if (block.type === 'restart_button') fields.push({ key: 'label', label: 'Button label' }, { key: 'scope', label: 'Scope', type: 'select', options: ['entire course', 'current lesson only'] })

  if (!fields.length) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <Field key={field.key} label={field.label}>
          {field.type === 'boolean' ? (
            <label className="inline-flex h-10 items-center gap-2 text-sm text-[var(--lux-muted)]">
              <input type="checkbox" checked={Boolean(metadata[field.key])} onChange={(e) => onChange(field.key, e.target.checked)} />
              Enabled
            </label>
          ) : field.type === 'select' ? (
            <select
              value={field.key === 'style' && (block.type === 'callout' || block.type === 'statement')
                ? statementStyleLabel(String(metadata[field.key] ?? field.options?.[0] ?? 'Info'))
                : String(metadata[field.key] ?? field.options?.[0] ?? '')}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={selectClass}
            >
              {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={String(metadata[field.key] ?? '')}
              onChange={(e) => onChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      ))}
    </div>
  )
}

function ItemsEditor({
  block,
  readOnly,
  onUpdateItems,
}: {
  block: CourseBlock
  readOnly: boolean
  onUpdateItems: (items: CourseInteractionItem[]) => void
}) {
  const items = block.items ?? []
  const updateItem = (id: string, patch: Partial<CourseInteractionItem>) => {
    onUpdateItems(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  return (
    <Field label={isQuestionBlock(block.type) ? 'Answer options / pairs' : 'Items'}>
      <div className="space-y-2">
        {items.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={item.title} onChange={(e) => updateItem(item.id, { title: e.target.value })} placeholder="Item title" className={inputClass} />
            <input value={item.match ?? item.content ?? ''} onChange={(e) => updateItem(item.id, isQuestionBlock(block.type) || block.type === 'matching' ? { content: e.target.value } : { content: e.target.value })} placeholder={block.type === 'matching' ? 'Match' : 'Detail'} className={inputClass} />
            {!readOnly && (
              <button type="button" onClick={() => onUpdateItems(items.filter((next) => next.id !== item.id))} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--lux-muted-soft)] hover:bg-red-500/10 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => onUpdateItems([...items, { id: uid('item'), title: '', content: '' }])}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--lux-primary-muted)]"
          >
            <Plus size={14} />
            Add item
          </button>
        )}
      </div>
    </Field>
  )
}

function QuestionCommonSettings({
  block,
  onChange,
}: {
  block: CourseBlock
  onChange: (key: string, value: unknown) => void
}) {
  const metadata = block.metadata ?? {}
  return (
    <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-3">
      <p className="text-xs font-semibold uppercase text-[var(--lux-muted-soft)]">Question Settings</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Points"><input type="number" value={Number(metadata.points ?? 1)} onChange={(e) => onChange('points', Number(e.target.value))} className={inputClass} /></Field>
        <Field label="Max attempts"><input type="number" value={Number(metadata.maxAttempts ?? 1)} onChange={(e) => onChange('maxAttempts', Number(e.target.value))} className={inputClass} /></Field>
        <Field label="Hint"><input value={String(metadata.hint ?? '')} onChange={(e) => onChange('hint', e.target.value)} className={inputClass} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--lux-muted)]">
        <label><input type="checkbox" checked={Boolean(metadata.allowRetry)} onChange={(e) => onChange('allowRetry', e.target.checked)} /> Allow retry</label>
        <label><input type="checkbox" checked={Boolean(metadata.shuffle)} onChange={(e) => onChange('shuffle', e.target.checked)} /> Shuffle options</label>
        <label><input type="checkbox" checked={Boolean(metadata.required)} onChange={(e) => onChange('required', e.target.checked)} /> Required</label>
      </div>
    </div>
  )
}

const COURSE_THEME_PRESETS = [
  { id: 'emerald', label: 'Emerald', accent: '#0F6B4A' },
  { id: 'ocean',   label: 'Ocean',   accent: '#2563EB' },
  { id: 'violet',  label: 'Violet',  accent: '#7C3AED' },
  { id: 'rose',    label: 'Rose',    accent: '#E11D48' },
  { id: 'amber',   label: 'Amber',   accent: '#D97706' },
  { id: 'slate',   label: 'Slate',   accent: '#64748B' },
]

const DEFAULT_COURSE_THEME: CourseTheme = {
  accentColor: '#0F6B4A',
  fontPairing: 'modern',
  coverLayout: 'centered',
  navigationMode: 'continuous',
  lessonNumbers: true,
  sidebarEnabled: true,
}

function updateCourseTheme(document: CourseDocument, patch: Partial<CourseTheme>): CourseDocument {
  return {
    ...document,
    theme: {
      ...DEFAULT_COURSE_THEME,
      ...document.theme,
      ...patch,
    },
  }
}

function ScormPanel({
  document,
  scenarioId,
  readOnly,
  readiness,
  onUpdateDocument,
  onSaveBeforeExport,
}: {
  document: CourseDocument
  scenarioId?: string
  readOnly: boolean
  readiness: CourseReadiness
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
  onSaveBeforeExport: () => Promise<boolean>
}) {
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'scorm' | 'pdf'>('scorm')
  const scorm = getScormSettings(document)
  const updateScorm = (patch: Partial<ScormSettings>) => {
    if (readOnly) return
    onUpdateDocument((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        scorm: {
          ...getScormSettings(current),
          ...patch,
        } as unknown as Record<string, unknown>,
      },
      settings: {
        ...current.settings,
        passingScore: patch.passingScore ?? current.settings.passingScore,
        scormVersion: patch.version === 'scorm_2004_3rd' ? '2004' : patch.version === 'scorm_1_2' ? '1.2' : current.settings.scormVersion,
      },
    }))
  }

  const downloadExport = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    window.document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
  }

  const exportScorm = async () => {
    if (!scenarioId) return
    setExporting(true)
    try {
      const response = await scormApi.export(scenarioId)
      downloadExport(response.data, `${scorm.courseIdentifier || 'course'}.zip`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'SCORM export failed'))
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = async () => {
    if (!scenarioId) return
    setExporting(true)
    try {
      const response = await scormApi.exportPdf(scenarioId)
      downloadExport(response.data, `${scorm.courseIdentifier || 'course'}.pdf`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'PDF export failed'))
    } finally {
      setExporting(false)
    }
  }

  const onExport = async () => {
    if (!scenarioId) {
      toast.error('Save the course before exporting.')
      return
    }
    if (!readiness.ready) {
      toast.error(`Resolve ${readiness.errors.length} blocking course check${readiness.errors.length === 1 ? '' : 's'} before exporting.`)
      return
    }
    const saved = await onSaveBeforeExport()
    if (!saved) {
      toast.error('Could not save the latest changes. Please retry before exporting.')
      return
    }
    if (exportFormat === 'pdf') {
      await exportPdf()
      return
    }
    await exportScorm()
  }

  return (
    <section className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
      <h2 className="text-sm font-semibold uppercase text-[var(--lux-muted-soft)]">Export Configuration</h2>
      <fieldset disabled={readOnly}>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <RadioGroup
            label="Export format"
            value={exportFormat}
            options={[['scorm', 'SCORM (.zip)'], ['pdf', 'PDF']]}
            onChange={(value) => setExportFormat(value as 'scorm' | 'pdf')}
          />
          {exportFormat === 'scorm' ? (
            <>
              <RadioGroup label="SCORM Version" value={scorm.version} options={[['scorm_1_2', 'SCORM 1.2'], ['scorm_2004_3rd', 'SCORM 2004 3rd Ed.']]} onChange={(value) => updateScorm({ version: value as ScormSettings['version'] })} />
              <Field label="Passing Score (%)"><PercentageInput value={scorm.passingScore} onCommit={(passingScore) => updateScorm({ passingScore })} /></Field>
              <Field label="Course Identifier"><input value={scorm.courseIdentifier} onChange={(e) => updateScorm({ courseIdentifier: e.target.value })} className={inputClass} /></Field>
              <Field label="Course Title for LMS"><input value={scorm.lmsTitle} onChange={(e) => updateScorm({ lmsTitle: e.target.value })} className={inputClass} /></Field>
              <RadioGroup label="Launch Behavior" value={scorm.launchBehavior} options={[['new_window', 'new window'], ['same_window', 'same window']]} onChange={(value) => updateScorm({ launchBehavior: value as ScormSettings['launchBehavior'] })} />
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">PDF Theme Mode</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={(document.theme?.themeMode ?? 'dark') === 'dark' ? 'primary' : 'secondary'}
                    onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { themeMode: 'dark' }))}
                  >
                    Dark
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={(document.theme?.themeMode ?? 'dark') === 'light' ? 'primary' : 'secondary'}
                    onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { themeMode: 'light' }))}
                  >
                    Light
                  </Button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">PDF Accent Color</p>
                <div className="flex flex-wrap gap-3">
                  {COURSE_THEME_PRESETS.map((preset) => {
                    const active = (document.theme?.accentColor ?? DEFAULT_COURSE_THEME.accentColor) === preset.accent
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { accentColor: preset.accent }))}
                        className="flex items-center gap-2 rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-1.5 text-xs font-semibold"
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: preset.accent,
                            boxShadow: active ? `0 0 0 2px ${preset.accent}` : 'none',
                          }}
                        />
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onExport} loading={exporting} disabled={!scenarioId}>
          {exportFormat === 'pdf' ? 'Export as PDF' : 'Export as SCORM .zip'}
        </Button>
      </div>
    </section>
  )
}

function InlineText({
  value,
  prefix = '',
  placeholder = '',
  className,
  readOnly = false,
  onCommit,
}: {
  value: string
  prefix?: string
  placeholder?: string
  className?: string
  readOnly?: boolean
  onCommit: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (readOnly) {
    return <span className={cn('text-left', className)}>{prefix}{value || placeholder || 'Add value'}</span>
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={cn('text-left', className)}
      >
        {prefix}{value || placeholder || 'Add value'}
      </button>
    )
  }

  return (
    <input
      value={draft}
      autoFocus
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        onCommit(draft)
        setEditing(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onCommit(draft)
          setEditing(false)
        }
        if (event.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      className={cn(inputClass, 'w-full', className)}
      placeholder={placeholder}
    />
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">
      {label}
      {children}
    </label>
  )
}

function RadioGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">{label}</p>
      <div className="space-y-2">
        {options.map(([optionValue, labelText]) => (
          <label key={optionValue} className="flex items-center gap-2 text-sm text-[var(--lux-muted)]">
            <input type="radio" checked={value === optionValue} onChange={() => onChange(optionValue)} />
            {labelText}
          </label>
        ))}
      </div>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md text-[var(--lux-muted-soft)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}

function pageHasBranchingContent(page: CoursePage): boolean {
  return (page.blocks ?? []).some((block) => branchingDecisionBlockTypes.includes(block.type))
}

function CoursePreview({ document, onClose, onUpdateDocument }: { document: CourseDocument; onClose: () => void; onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void }) {
  const pages = useMemo(() => document.pages.length ? document.pages : (document.lessons ?? []).map(previewLessonToPage), [document.lessons, document.pages])
  const courseFormat = getCourseFormat(document)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('course-preview-sidebar') === 'collapsed'
  })
  const accentColor = document.theme?.accentColor ?? '#0F6B4A'
  const previewMode = document.theme?.themeMode ?? 'dark'
  const courseCoverImageUrl = document.theme?.coverImageUrl ? uploadedAssetUrl(document.theme.coverImageUrl) : ''
  const activePageIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1))
  const currentPage = pages[activePageIndex]
  const previousPage = activePageIndex > 0 ? pages[activePageIndex - 1] : null
  const nextPage = activePageIndex < pages.length - 1 ? pages[activePageIndex + 1] : null

  const openPage = (index: number) => {
    if (!pages.length) return
    setCurrentPageIndex(Math.max(0, Math.min(index, pages.length - 1)))
  }

  useEffect(() => {
    window.localStorage.setItem('course-preview-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded')
  }, [sidebarCollapsed])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-5 lux-scrollbar" data-preview-theme={previewMode}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-[var(--lux-line)] bg-[var(--lux-bg)] text-[var(--lux-text-strong)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--lux-line)] bg-[var(--lux-surface)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">Export preview</p>
            <h1 className="mt-1 truncate text-xl font-bold">{document.title}</h1>
            {document.description?.trim() && (
            <p className="mt-1 max-w-xl truncate text-xs text-[var(--lux-muted)]">{document.description}</p>
            )}
            <p className="mt-1 text-xs font-semibold text-[var(--lux-primary-muted)]">{courseFormat} course</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-2.5 py-1.5" title="Change preview theme">
              {COURSE_THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { accentColor: preset.accent }))}
                  title={`${preset.label} theme`}
                  aria-label={`Switch to ${preset.label} theme`}
                  className="h-4 w-4 rounded-full transition-transform hover:scale-125 focus:outline-none"
                  style={{
                    background: preset.accent,
                    boxShadow: accentColor === preset.accent
                      ? `0 0 0 2px var(--lux-surface), 0 0 0 3.5px ${preset.accent}`
                      : 'none',
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { themeMode: previewMode === 'dark' ? 'light' : 'dark' }))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-[var(--lux-text-strong)] transition-colors hover:bg-[var(--lux-elevated)]"
              title={`Switch to ${previewMode === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${previewMode === 'dark' ? 'light' : 'dark'} mode`}
            >
              {previewMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              type="button"
              onClick={() => {
                const courseDocument = normalizeCourseDocument(document, authorNameFrom(user));
                const scormManifest = createManifestPreview(courseDocument);
                const blob = new Blob([scormManifest], { type: 'application/xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${document.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xml`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lux-line)] bg-[var(--lux-primary)] text-[var(--lux-text-strong)] transition-colors hover:bg-[var(--lux-primary-hover)]"
              title="Download SCORM package"
              aria-label="Download SCORM package"
            >
              <Download size={14} className="mr-1" />
              Download
            </button>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]" aria-label="Close preview">
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          className={cn(
            'grid h-[calc(100vh-8rem)] min-h-[520px] grid-rows-[minmax(180px,30vh)_minmax(0,1fr)] overflow-hidden lg:min-h-[620px] lg:grid-rows-1',
            sidebarCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]',
          )}
        >
          <aside
            className={cn(
              'flex min-h-0 flex-col border-b border-[var(--lux-line)] bg-[var(--lux-surface)] transition-all duration-300 ease-in-out lg:border-b-0 lg:border-r',
              sidebarCollapsed ? 'p-2 lg:p-3' : 'p-4',
            )}
          >
            <div className={cn('flex items-center gap-2', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
              {!sidebarCollapsed && (
                <div
                  className={cn(
                    'min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--lux-line)] p-4',
                    courseCoverImageUrl ? 'bg-cover bg-center' : 'bg-[var(--lux-surface-soft)]',
                  )}
                  style={courseCoverImageUrl ? { backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.52), rgba(5, 12, 14, 0.52)), url(${courseCoverImageUrl})` } : undefined}
                >
                  <p className={cn('text-sm font-extrabold leading-snug', courseCoverImageUrl && 'text-white drop-shadow')}>{document.title}</p>
                  {document.description?.trim() && (
                    <p className={cn(
                      'mt-2 line-clamp-4 text-xs leading-5',
                      courseCoverImageUrl ? 'text-white/80 drop-shadow' : 'text-[var(--lux-muted)]',
                    )}>
                      {document.description}
                    </p>
                  )}
                </div>
              )}
              <SidebarToggleButton
                direction={sidebarCollapsed ? 'expand' : 'collapse'}
                label={sidebarCollapsed ? 'Expand preview navigation' : 'Collapse preview navigation'}
                shortcut="Ctrl+["
                onClick={() => setSidebarCollapsed((current) => !current)}
                className={sidebarCollapsed ? 'shrink-0' : 'shrink-0 self-start'}
              />
            </div>
            <div className={cn('min-h-0 flex-1 space-y-2 overflow-y-auto lux-scrollbar', sidebarCollapsed ? 'mt-3 pr-0' : 'mt-4 pr-1')}>
              {pages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => openPage(index)}
                  aria-label={`Go to page ${index + 1}: ${page.title}`}
                  className={cn(
                    'group relative flex w-full items-center rounded-lg border text-left text-sm transition-all duration-200',
                    sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                    index === activePageIndex
                      ? `border-[var(--lux-primary-muted)]/40 bg-[var(--lux-primary)]/25 text-[var(--lux-text-strong)]`
                      : 'border-transparent text-[var(--lux-muted)] hover:border-[var(--lux-primary-muted)]/25 hover:text-[var(--lux-text-strong)]',
                  )}
                >
                  <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--lux-elevated)] text-xs font-bold text-[var(--lux-text-strong)]">
                    {index + 1}
                    {pageHasBranchingContent(page) && (
                      <GitBranch
                        size={9}
                        strokeWidth={2.5}
                        className="absolute -bottom-1 -right-1 rounded-full bg-[var(--lux-primary)] p-[1.5px] text-white"
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden',
                      sidebarCollapsed ? 'max-w-0 opacity-0 w-0' : 'max-w-xs opacity-100 min-w-0 truncate flex-1',
                    )}
                  >
                    {page.title}
                  </span>
                  {sidebarCollapsed && (
                    <div className="pointer-events-none fixed left-[88px] z-50 hidden group-hover:flex group-focus-visible:flex items-center animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-3 py-1.5 text-xs font-bold text-[var(--lux-text-strong)] shadow-xl">
                        {pageHasBranchingContent(page) && <GitBranch size={11} className="shrink-0 text-[var(--lux-primary-muted)]" />}
                        {page.title}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </aside>
          <div className="overflow-y-auto bg-[var(--lux-bg)] p-4 sm:p-7 lux-scrollbar">
            {currentPage ? (
              <PreviewPage
                page={currentPage}
                pageNumber={activePageIndex + 1}
                totalPages={pages.length}
                accentColor={accentColor}
                previousLesson={previousPage ? { number: activePageIndex, title: previousPage.title } : null}
                nextLesson={nextPage ? { number: activePageIndex + 2, title: nextPage.title } : null}
                onOpenPreviousLesson={() => openPage(activePageIndex - 1)}
                onOpenNextLesson={() => openPage(activePageIndex + 1)}
                onOpenLessonById={(lessonId) => {
                  const destinationIndex = pages.findIndex((page) => page.id === lessonId)
                  if (destinationIndex >= 0) openPage(destinationIndex)
                }}
                getLessonTitle={(lessonId) => pages.find((page) => page.id === lessonId)?.title ?? 'Course item'}
              />
            ) : (
              <section className="mx-auto grid min-h-[420px] w-full max-w-[940px] place-items-center rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-8 text-center text-[var(--lux-muted)]">
                No course pages yet.
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewPage({
  page,
  pageNumber,
  totalPages,
  accentColor,
  previousLesson,
  nextLesson,
  onOpenPreviousLesson,
  onOpenNextLesson,
  onOpenLessonById,
  getLessonTitle,
}: {
  page: CoursePage
  pageNumber: number
  totalPages: number
  accentColor: string
  previousLesson: { number: number; title: string } | null
  nextLesson: { number: number; title: string } | null
  onOpenPreviousLesson: () => void
  onOpenNextLesson: () => void
  onOpenLessonById: (lessonId: string) => void
  getLessonTitle: (lessonId: string) => string
}) {
  const blocks = page.blocks ?? []
  const [completedBlocks, setCompletedBlocks] = useState<Set<string>>(() => new Set())
  const [revealedContinueBlocks, setRevealedContinueBlocks] = useState<Set<string>>(() => new Set())

  const markBlockComplete = useCallback((blockId: string) => {
    setCompletedBlocks((current) => {
      if (current.has(blockId)) return current
      const next = new Set(current)
      next.add(blockId)
      return next
    })
  }, [])

  const revealContinueBlock = useCallback((blockId: string) => {
    setRevealedContinueBlocks((current) => {
      if (current.has(blockId)) return current
      const next = new Set(current)
      next.add(blockId)
      return next
    })
    markBlockComplete(blockId)
  }, [markBlockComplete])

  const isBlockComplete = useCallback((block: CourseBlock) => {
    if (block.type === 'continue_button') return revealedContinueBlocks.has(block.id)
    return isPreviewAutoCompleteBlock(block) || completedBlocks.has(block.id)
  }, [completedBlocks, revealedContinueBlocks])

  const renderedBlocks: ReactNode[] = []
  let contentLocked = false

  blocks.forEach((block, index) => {
    if (contentLocked) return
    if (!blockHasContent(block)) return

    if (block.type === 'continue_button') {
      const isRevealed = revealedContinueBlocks.has(block.id)
      const completionType = previewMetaString(block, 'completionType', 'None')
      const previousBlock = [...blocks.slice(0, index)].reverse().find((item) => item.type !== 'continue_button')
      const unlocked = completionType === 'None'
        || (completionType === 'Complete Block Directly Above' && (!previousBlock || isBlockComplete(previousBlock)))
        || (completionType === 'Complete All Blocks Above' && blocks.slice(0, index).every(isBlockComplete))

      renderedBlocks.push(
        <PreviewContinueBlock
          key={block.id}
          block={block}
          accentColor={accentColor}
          unlocked={unlocked}
          revealed={isRevealed}
          onReveal={() => revealContinueBlock(block.id)}
        />,
      )

      if (!isRevealed) contentLocked = true
      return
    }

    renderedBlocks.push(
      <PreviewBlock
        key={block.id}
        block={block}
        accentColor={accentColor}
        completed={isBlockComplete(block)}
        onComplete={() => markBlockComplete(block.id)}
        onOpenLessonById={onOpenLessonById}
        getLessonTitle={getLessonTitle}
      />,
    )
  })

  const pageHasLockedContinue = blocks.some((block) => block.type === 'continue_button' && !revealedContinueBlocks.has(block.id))
  const pageCoverImageUrl = page.coverImageUrl ? uploadedAssetUrl(page.coverImageUrl) : ''

  return (
    <section className="mx-auto w-full max-w-[940px] p-6 sm:p-8">
      {previousLesson && (
        <PreviewLessonHeaderLink
          lessonNumber={previousLesson.number}
          lessonTitle={previousLesson.title}
          onClick={onOpenPreviousLesson}
        />
      )}
      {pageCoverImageUrl ? (
        <header
          className="overflow-hidden rounded-lg border border-[var(--lux-line)] bg-cover bg-center px-5 py-10 shadow-sm sm:px-7 sm:py-12"
          style={{ backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.52), rgba(5, 12, 14, 0.52)), url(${pageCoverImageUrl})` }}
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-white/75">Lesson {pageNumber} of {totalPages}</p>
          <h2 className="mt-2 text-3xl font-bold leading-tight text-white drop-shadow">{page.title}</h2>
          {page.summary && <p className="mt-3 max-w-2xl text-base leading-7 text-white/80">{page.summary}</p>}
        </header>
      ) : (
        <>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">Lesson {pageNumber} of {totalPages}</p>
          <h2 className="text-3xl font-bold leading-tight">{page.title}</h2>
          {page.summary && <p className="mt-3 text-base leading-7 text-[var(--lux-muted)]">{page.summary}</p>}
        </>
      )}
      <div className="mt-7 space-y-7">
        {page.type === 'branching_scenario' ? (
          <PreviewScenario page={page} />
        ) : page.type === 'quiz' ? (
          <PreviewQuiz page={page} accentColor={accentColor} />
        ) : renderedBlocks.length > 0 ? (
          renderedBlocks
        ) : (
          <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">No content yet.</p>
        )}
      </div>
      {nextLesson && (
        <PreviewLessonFooterLink
          lessonNumber={nextLesson.number}
          lessonTitle={nextLesson.title}
          disabled={pageHasLockedContinue}
          onClick={onOpenNextLesson}
        />
      )}
    </section>
  )
}

function PreviewLessonHeaderLink({
  lessonNumber,
  lessonTitle,
  onClick,
}: {
  lessonNumber: number
  lessonTitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mb-8 flex w-full flex-col items-center justify-center border-b border-[var(--lux-line)] px-4 pb-7 text-center text-[var(--lux-muted)] transition hover:bg-[var(--lux-surface-soft)] hover:text-[var(--lux-primary)]"
    >
      <ChevronDown size={26} className="mb-2 rotate-180 transition group-hover:-translate-y-1" />
      <span className="text-sm font-semibold uppercase tracking-wide">
        Lesson {lessonNumber} - {lessonTitle}
      </span>
    </button>
  )
}

function PreviewLessonFooterLink({
  lessonNumber,
  lessonTitle,
  disabled,
  onClick,
}: {
  lessonNumber: number
  lessonTitle: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group mt-8 flex w-full flex-col items-center justify-center border-t border-[var(--lux-line)] px-4 py-10 text-center text-[var(--lux-muted)] transition hover:bg-[var(--lux-surface-soft)] hover:text-[var(--lux-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--lux-muted)]"
    >
      <span className="text-sm font-semibold uppercase tracking-wide">
        Lesson {lessonNumber} - {lessonTitle}
      </span>
      <ChevronDown size={26} className="mt-2 transition group-hover:translate-y-1 group-disabled:translate-y-0" />
    </button>
  )
}

function PreviewBlock({
  block,
  accentColor,
  completed = false,
  onComplete,
  onOpenLessonById,
  getLessonTitle,
}: {
  block: CourseBlock
  accentColor: string
  completed?: boolean
  onComplete?: () => void
  onOpenLessonById: (lessonId: string) => void
  getLessonTitle: (lessonId: string) => string
}) {
  const title = block.title?.trim()
  const content = block.content?.trim()

  if (block.type === 'heading') {
    return (
      <div className="pt-5">
        <h3 className="text-2xl font-bold leading-tight">{content || title || ''}</h3>
        {previewMetaString(block, 'subtitle') && <p className="mt-2 text-base text-[var(--lux-muted)]">{previewMetaString(block, 'subtitle')}</p>}
      </div>
    )
  }

  if (['text', 'paragraph'].includes(block.type)) {
    return <div className="pt-5"><p className="whitespace-pre-wrap text-base leading-7 text-[var(--lux-muted)]">{content || ''}</p></div>
  }

  if (block.type === 'quote') {
    return <PreviewQuoteBlock block={block} />
  }

  if (block.type === 'statement') {
    return <PreviewStatementBlock block={block} />
  }

  if (block.type === 'callout') {
    const styleLabel = statementStyleLabel(previewMetaString(block, 'style', 'Info'))
    return (
      <div className={cn('rounded-lg border p-4', statementStyleClasses(styleLabel))}>
        <p className="text-sm font-bold text-[var(--lux-text-strong)]">{statementCalloutLabel(title, styleLabel)}</p>
        <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-[var(--lux-text-strong)]">{content || ''}</p>
      </div>
    )
  }

  if (block.type === 'process_steps') {
    return <PreviewProcessBlock block={block} accentColor={accentColor} onComplete={onComplete} />
  }

  if (['numbered_list', 'list', 'checklist', 'ordering', 'timeline', 'lesson_summary'].includes(block.type)) {
    return <PreviewListBlock block={block} accentColor={accentColor} />
  }

  if (block.type === 'divider') {
    const label = previewMetaString(block, 'label')
    return (
      <div className="flex items-center gap-4 py-3">
        <span className="h-px flex-1 bg-[var(--lux-line)]" />
        {label && <span className="text-xs font-bold uppercase tracking-wide text-[var(--lux-muted)]">{label}</span>}
        <span className="h-px flex-1 bg-[var(--lux-line)]" />
      </div>
    )
  }

  if (block.type === 'spacer') return <div style={{ height: previewMetaNumber(block, 'height', 48) }} />

  if (['image', 'video', 'audio', 'attachment', 'document', 'file_download', 'resource_link'].includes(block.type)) {
    return <PreviewMediaBlock block={block} accentColor={accentColor} />
  }

  if (block.type === 'image_gallery' || block.type === 'gallery') {
    return <PreviewGalleryBlock block={block} />
  }

  if (isQuestionBlock(block.type) || block.type === 'knowledge_check') {
    return <PreviewQuestionBlock block={block} />
  }

  if (block.type === 'table') return <PreviewTableBlock block={block} />
  if (block.type === 'chart') return <PreviewChartBlock block={block} accentColor={accentColor} />

  if (['button', 'restart_button'].includes(block.type)) {
    const label = previewMetaString(block, 'label', content || title || '')
    return (
      <div className={cn('flex', previewMetaString(block, 'alignment', 'center') === 'left' ? 'justify-start' : previewMetaString(block, 'alignment', 'center') === 'right' ? 'justify-end' : 'justify-center')}>
        <a href={block.assetUrl || '#'} className="inline-flex min-w-36 items-center justify-center rounded-full px-6 py-3 text-sm font-bold text-white" style={{ background: accentColor }}>
          {label}
        </a>
      </div>
    )
  }

  if (block.type === 'code') {
    return <pre className="overflow-x-auto rounded-lg bg-[var(--lux-bg-alt)] p-4 text-xs leading-6 text-[var(--lux-text-strong)] lux-scrollbar">{content || title}</pre>
  }

  if (block.type === 'flashcards') {
    return <PreviewFlashcardsBlock block={block} accentColor={accentColor} onComplete={onComplete} />
  }

  if (branchingDecisionBlockTypes.includes(block.type)) {
    return <PreviewBranchingDecisionBlock block={block} accentColor={accentColor} onOpenLessonById={onOpenLessonById} getLessonTitle={getLessonTitle} />
  }

  if (block.type === 'sorting_activity' || block.type === 'sorting') {
    return <PreviewSortingBlock block={block} accentColor={accentColor} completed={completed} onComplete={onComplete} />
  }

  if (block.type === 'accordion' || block.type === 'tabs') {
    return <PreviewAccordionTabsBlock block={block} accentColor={accentColor} onComplete={onComplete} />
  }

  return <PreviewInteractionBlock block={block} />
}

function PreviewBranchingDecisionBlock({
  block,
  accentColor,
  onOpenLessonById,
  getLessonTitle,
}: {
  block: CourseBlock
  accentColor: string
  onOpenLessonById: (lessonId: string) => void
  getLessonTitle: (lessonId: string) => string
}) {
  const choices = (block.items ?? []).filter((item) => item.title?.trim())
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null)
  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId) ?? null

  if (!choices.length) {
    return <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">Add at least two choices to this decision.</p>
  }

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">{block.type === 'choice_point' ? 'Choice point' : 'Branching dialogue'}</p>
      {block.title && <h3 className="mt-1 text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 grid gap-3">
        {choices.map((choice) => {
          const destinationId = choice.match ?? ''
          const linked = Boolean(destinationId)
          return (
            <button
              key={choice.id}
              type="button"
              disabled={!linked}
              onClick={() => {
                setSelectedChoiceId(choice.id)
                if (destinationId) onOpenLessonById(destinationId)
              }}
              className="rounded-lg border px-4 py-3 text-left text-sm transition enabled:hover:border-[var(--lux-primary-muted)] enabled:hover:bg-[var(--lux-surface-soft)] disabled:cursor-not-allowed disabled:opacity-45"
              style={selectedChoiceId === choice.id ? { borderColor: accentColor, background: `${accentColor}18` } : undefined}
            >
              <span className="block font-bold text-[var(--lux-text-strong)]">{choice.title}</span>
              {choice.content && <span className="mt-1 block text-xs leading-5 text-[var(--lux-muted)]">{choice.content}</span>}
              <span className="mt-2 block text-xs font-semibold" style={{ color: accentColor }}>
                {linked ? `Continue to: ${getLessonTitle(destinationId)}` : 'Destination not linked'}
              </span>
            </button>
          )
        })}
      </div>
      {selectedChoice?.content && <p className="mt-4 rounded-lg bg-[var(--lux-surface-soft)] px-3 py-2 text-sm text-[var(--lux-text)]">{selectedChoice.content}</p>}
    </section>
  )
}

function PreviewStatementBlock({ block }: { block: CourseBlock }) {
  const content = block.content?.trim() || ''
  const styleMeta = previewMetaString(block, 'style', 'Info')
  const styleLabel = statementStyleLabel(styleMeta)
  const callout = statementCalloutLabel(block.title, styleLabel)

  return (
    <section className={cn('rounded-lg border p-5', statementStyleClasses(styleLabel))}>
      <div className="mb-3">
        <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-black">
          {callout}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-xl font-extrabold leading-8 text-black">
        {content}
      </p>
    </section>
  )
}

function statementStyleLabel(value?: string) {
  const normalized = (value || 'Info').replace(/^\s*[^\p{L}\p{N}]*/u, '').trim().toLowerCase()
  if (normalized === 'warning') return 'Warning'
  if (normalized === 'tip') return 'Tip'
  if (normalized === 'note') return 'Note'
  return 'Info'
}

function statementTextLabel(value?: string) {
  const normalized = (value || '').replace(/^\s*[^\p{L}\p{N}]*/u, '').trim()
  return normalized || (value || '').trim()
}

function statementCalloutLabel(title: unknown, styleLabel: string) {
  const trimmed = String(title ?? '').trim()
  return trimmed && !['info', 'warning', 'tip', 'note'].includes(statementTextLabel(trimmed).toLowerCase())
    ? statementTextLabel(trimmed)
    : statementStyleLabel(styleLabel)
}

function statementStyleClasses(styleLabel: string) {
  if (styleLabel === 'Warning') return 'border-red-300 bg-red-100'
  if (styleLabel === 'Tip') return 'border-green-300 bg-green-100'
  if (styleLabel === 'Note') return 'border-yellow-300 bg-yellow-100'
  return 'border-[var(--lux-line)] bg-white'
}

function PreviewQuoteBlock({ block }: { block: CourseBlock }) {
  const body = block.content?.trim() || block.title?.trim() || ''
  const attributionName = previewMetaString(block, 'attributionName')
  const attributionRole = previewMetaString(block, 'attributionRole')
  const avatarUrl = previewMetaString(block, 'avatarUrl')
  const alignment = previewMetaString(block, 'alignment', 'left')
  const spacing = previewMetaString(block, 'spacing', 'normal')
  const showQuoteMark = previewMetaBoolean(block, 'showQuoteMark', true)
  const showAvatar = previewMetaBoolean(block, 'showAvatar', true)
  const alignClass = alignment === 'center' ? 'items-center text-center' : alignment === 'right' ? 'items-end text-right' : 'items-start text-left'
  const spacingClass = spacing === 'compact' ? 'gap-2 py-4' : spacing === 'wide' ? 'gap-5 py-8' : 'gap-3 py-6'
  const avatar = showAvatar && avatarUrl ? uploadedAssetUrl(avatarUrl) : ''
  const attribution = attributionName || attributionRole

  const quoteContent = (
    <div className={cn('flex flex-col', alignClass, spacingClass)}>
      {showQuoteMark && <span className="text-5xl font-black leading-none text-[var(--lux-primary-muted)]">&quot;</span>}
      <blockquote className="max-w-3xl whitespace-pre-wrap text-2xl font-semibold leading-9 text-[var(--lux-text-strong)]">{body}</blockquote>
      {showQuoteMark && <span className="self-end text-5xl font-black leading-none text-[var(--lux-primary-muted)]">&quot;</span>}
      {attribution && (
        <figcaption className={cn('flex items-center gap-3 text-sm text-[var(--lux-text)]', alignment === 'center' && 'justify-center', alignment === 'right' && 'flex-row-reverse')}>
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-11 w-11 rounded-full border border-white/20 object-cover" />
          )}
          <span>
            {attributionName && <span className="block font-bold text-[var(--lux-text-strong)]">{attributionName}</span>}
            {attributionRole && <span className="block text-[var(--lux-muted)]">{attributionRole}</span>}
          </span>
        </figcaption>
      )}
    </div>
  )

  return (
    <figure className="pt-5">
      <div className="px-0">
        {quoteContent}
      </div>
    </figure>
  )
}

function PreviewAccordionTabsBlock({
  block,
  accentColor,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  onComplete?: () => void
}) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  const isTabs = block.type === 'tabs'
  const [activeTabId, setActiveTabId] = useState(() => items[0]?.id ?? '')
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const [visitedIds, setVisitedIds] = useState<Set<string>>(() => new Set(isTabs && items[0]?.id ? [items[0].id] : []))
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const allowMultiple = previewMetaString(block, 'behavior', 'single') === 'multiple'
  const showOverflowArrows = previewMetaBoolean(block, 'overflowArrows', true)
  const activeItemId = items.some((item) => item.id === activeTabId) ? activeTabId : items[0]?.id ?? ''

  const markVisited = useCallback((itemId: string) => {
    setVisitedIds((current) => {
      if (current.has(itemId)) return current
      const next = new Set(current)
      next.add(itemId)
      return next
    })
  }, [])

  useEffect(() => {
    if (items.length > 0 && visitedIds.size >= items.length) onComplete?.()
  }, [items.length, onComplete, visitedIds])

  if (!items.length) {
    return <PreviewInteractionBlock block={block} />
  }

  if (isTabs) {
    const activeItem = items.find((item) => item.id === activeItemId) ?? items[0]
    const selectTab = (itemId: string) => {
      setActiveTabId(itemId)
      markVisited(itemId)
    }

    return (
      <section className="pt-5">
        {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
        {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
        <div className="mt-5 flex items-center gap-2">
          {showOverflowArrows && (
            <button type="button" onClick={() => tabListRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--lux-line)] text-[var(--lux-muted)] hover:border-[var(--lux-primary-muted)] hover:text-[var(--lux-text-strong)]" aria-label="Scroll tabs left">
              <ArrowLeft size={16} />
            </button>
          )}
          <div ref={tabListRef} role="tablist" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 lux-scrollbar">
            {items.map((item) => {
              const selected = item.id === activeItemId
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(item.id)}
                  className="min-w-max rounded-full border px-4 py-2 text-sm font-bold transition"
                  style={selected ? { borderColor: accentColor, background: accentColor, color: '#fff' } : { borderColor: '#313847', color: '#C6CFDA' }}
                >
                  {item.title || ''}
                </button>
              )
            })}
          </div>
          {showOverflowArrows && (
            <button type="button" onClick={() => tabListRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--lux-line)] text-[var(--lux-muted)] hover:border-[var(--lux-primary-muted)] hover:text-[var(--lux-text-strong)]" aria-label="Scroll tabs right">
              <ArrowLeft size={16} className="rotate-180" />
            </button>
          )}
        </div>
        <div className="mt-5 rounded-lg bg-transparent p-4">
          <PreviewPanelContent item={activeItem} />
        </div>
      </section>
    )
  }

  const toggleAccordion = (itemId: string) => {
    markVisited(itemId)
    setOpenIds((current) => {
      const next = allowMultiple ? new Set(current) : new Set<string>()
      if (current.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 divide-y divide-[var(--lux-line)] overflow-hidden rounded-lg border border-[var(--lux-line)]">
        {items.map((item) => {
          const open = openIds.has(item.id)
          return (
            <article key={item.id} className="bg-transparent">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleAccordion(item.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-base font-bold text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-elevated)]"
              >
                <span>{item.title || ''}</span>
                <ChevronDown size={18} className={cn('shrink-0 transition', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="px-4 pb-4">
                  <PreviewPanelContent item={item} />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PreviewPanelContent({ item }: { item: CourseInteractionItem }) {
  return (
    <div>
      {item.mediaUrl && <PreviewItemMedia item={item} />}
      {item.content && <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--lux-text)]">{item.content}</p>}
    </div>
  )
}

function PreviewListBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      <div className="mt-4 grid gap-3">
        {items.map((item, index) => (
          <article key={item.id} className="grid gap-4 rounded-lg bg-transparent p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-extrabold" style={{ background: `${accentColor}33`, color: '#83BFA1' }}>
              {block.type === 'numbered_list' || block.type === 'ordering' || block.type === 'timeline' ? index + 1 : '•'}
            </span>
            <div className="min-w-0">
              {item.title && <h4 className="mt-3 text-base font-bold first:mt-0">{item.title}</h4>}
              {item.content && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{item.content}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function PreviewItemMedia({ item }: { item: CourseInteractionItem }) {
  const mediaUrl = item.mediaUrl ? uploadedAssetUrl(item.mediaUrl) : ''
  if (!mediaUrl) return null

  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(mediaUrl)) {
    return <video controls src={mediaUrl} className="mb-3 w-full rounded-lg" />
  }

  if (/\.(mp3|wav|m4a|aac|oga)(\?|#|$)/i.test(mediaUrl)) {
    return <audio controls src={mediaUrl} className="mb-3 w-full" />
  }

  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)/i.test(mediaUrl)) {
    return <iframe title={item.title || 'Embedded media'} src={mediaUrl} className="mb-3 aspect-video w-full rounded-lg" />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaUrl} alt={item.title} className="mb-3 max-h-72 w-full rounded-lg border border-[var(--lux-line)] object-contain" />
  )
}

function PreviewContinueBlock({
  block,
  accentColor,
  unlocked,
  revealed,
  onReveal,
}: {
  block: CourseBlock
  accentColor: string
  unlocked: boolean
  revealed: boolean
  onReveal: () => void
}) {
  const label = previewMetaString(block, 'label', block.content || block.title || 'Continue')
  const alignment = previewMetaString(block, 'alignment', 'center')
  const hint = unlocked
    ? previewMetaString(block, 'unlockedHint', 'Ready to continue.')
    : previewMetaString(block, 'lockedHint', 'Complete the required activity above to continue.')

  return (
    <section className={cn('border-t border-[var(--lux-line)] pt-5', alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center')}>
      <button
        type="button"
        disabled={!unlocked || revealed}
        onClick={onReveal}
        className="inline-flex min-w-36 items-center justify-center rounded-full px-6 py-3 text-sm font-bold text-[var(--lux-text-strong)] transition disabled:cursor-not-allowed disabled:bg-[var(--lux-line)] disabled:text-[var(--lux-muted)]"
        style={unlocked && !revealed ? { background: accentColor } : undefined}
      >
        {revealed ? 'Unlocked' : label}
      </button>
      <p className="mt-2 text-xs font-semibold text-[var(--lux-muted)]">{revealed ? previewMetaString(block, 'unlockedHint', 'Content unlocked.') : hint}</p>
    </section>
  )
}

function PreviewProcessBlock({
  block,
  accentColor,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  onComplete?: () => void
}) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  const [stepIndex, setStepIndex] = useState(-1)
  const summaryIndex = items.length
  const onSummary = stepIndex === summaryIndex
  const currentStep = stepIndex >= 0 && stepIndex < items.length ? items[stepIndex] : null

  useEffect(() => {
    if (onSummary) onComplete?.()
  }, [onComplete, onSummary])

  const goTo = (index: number) => setStepIndex(Math.max(-1, Math.min(summaryIndex, index)))

  return (
    <section className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
      {stepIndex === -1 ? (
        <div className="mt-3">
          <h3 className="text-2xl font-bold">{previewMetaString(block, 'introTitle', block.title || '')}</h3>
          {(block.content || previewMetaString(block, 'introText')) && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{previewMetaString(block, 'introText', block.content ?? '')}</p>}
          {previewMetaString(block, 'introImageUrl') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedAssetUrl(previewMetaString(block, 'introImageUrl'))} alt="" className="mt-5 max-h-72 w-full rounded-lg object-contain" />
          )}
          <button type="button" onClick={() => goTo(0)} className="mt-5 rounded-full px-5 py-2 text-sm font-bold text-[var(--lux-text-strong)]" style={{ background: accentColor }}>
            {previewMetaString(block, 'startLabel', 'Start')}
          </button>
        </div>
      ) : onSummary ? (
        <div className="mt-3">
          <h3 className="text-2xl font-bold">{previewMetaString(block, 'summaryTitle', 'Process complete')}</h3>
          {previewMetaString(block, 'summaryText') && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{previewMetaString(block, 'summaryText')}</p>}
          <button type="button" onClick={() => goTo(-1)} className="mt-5 rounded-full px-5 py-2 text-sm font-bold text-[var(--lux-text-strong)] bg-[var(--lux-surface)] hover:bg-[var(--lux-surface-soft)]">
            {previewMetaString(block, 'restartLabel', 'Start Again')}
          </button>
        </div>
      ) : currentStep ? (
        <div className="mt-3">
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-[var(--lux-muted)]">
            <span className="grid h-8 w-8 place-items-center rounded-full text-[var(--lux-text-strong)]" style={{ background: accentColor }}>{stepIndex + 1}</span>
            <span>Step {stepIndex + 1} of {items.length}</span>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
            <div>
              {currentStep.title && <h3 className="text-2xl font-bold">{currentStep.title}</h3>}
              {currentStep.content && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{currentStep.content}</p>}
            </div>
            {currentStep.mediaUrl && <PreviewItemMedia item={currentStep} />}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={() => goTo(stepIndex - 1)} className="rounded-full px-4 py-2 text-sm font-bold text-[var(--lux-text-strong)] bg-[var(--lux-surface)] hover:bg-[var(--lux-surface-soft)]">
              Previous
            </button>
            <button type="button" onClick={() => goTo(stepIndex + 1)} className="rounded-full px-4 py-2 text-sm font-bold text-[var(--lux-text-strong)]" style={{ background: accentColor }}>
              {stepIndex === items.length - 1 ? 'Summary' : 'Next'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function PreviewMediaBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  const assetUrl = block.assetUrl || previewMetaString(block, 'fileUrl') || previewMetaString(block, 'url')
  const displayUrl = assetUrl ? uploadedAssetUrl(assetUrl) : ''
  const caption = previewMetaString(block, 'caption', previewMetaString(block, 'label'))

  if (block.type === 'image') {
    return (
      <figure className="border-t border-[var(--lux-line)] pt-5">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt={previewMetaString(block, 'alt', block.title ?? '')} className="max-h-[520px] w-full rounded-lg object-contain" />
        ) : (
          <div className="grid aspect-video place-items-center rounded-lg bg-[var(--lux-surface)] text-sm text-[var(--lux-muted)]">Image</div>
        )}
        {caption && <figcaption className="mt-2 text-center text-sm text-[var(--lux-muted)]">{caption}</figcaption>}
      </figure>
    )
  }

  if (block.type === 'video') return displayUrl ? <video controls src={displayUrl} className="w-full rounded-lg" /> : <PreviewEmptyMedia label="Video" />
  if (block.type === 'audio') return displayUrl ? <audio controls src={displayUrl} className="w-full" /> : <PreviewEmptyMedia label="Audio" />

  return (
    <a href={displayUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg bg-[var(--lux-surface)] p-4 text-[var(--lux-text-strong)] transition hover:bg-[var(--lux-surface-soft)]">
      <Download size={24} style={{ color: accentColor }} />
      <span>
        <span className="block font-semibold">{block.title || previewMetaString(block, 'label') || getBlockDefinition(block.type).label}</span>
        {(caption || displayUrl) && <span className="mt-1 block text-sm text-[var(--lux-muted)]">{caption || displayUrl}</span>}
      </span>
    </a>
  )
}

function PreviewGalleryBlock({ block }: { block: CourseBlock }) {
  const columns = previewMetaNumber(block, 'columns', 3)
  const validItems = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())

  return (
    <section className="pt-5">
      {block.title && <h3 className="mb-4 text-2xl font-bold">{block.title}</h3>}
      <div className={cn('grid gap-4', columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3')}>
        {validItems.map((item) => (
          <figure key={item.id} className="rounded-lg bg-transparent p-3">
            {item.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadedAssetUrl(item.mediaUrl)} alt={item.title} className="aspect-video w-full rounded object-contain" />
            ) : (
              <div className="grid aspect-video place-items-center rounded bg-[var(--lux-surface-soft)] text-sm text-[var(--lux-muted)]">Image</div>
            )}
            {item.title && <figcaption className="mt-2 text-sm text-[var(--lux-muted)]">{item.title}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  )
}

function PreviewQuestionBlock({ block }: { block: CourseBlock }) {
  const options = block.items ?? []
  return (
    <section className="pt-5">
      <h3 className="text-2xl font-bold">{block.title || block.knowledgeCheck?.question || 'Question'}</h3>
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 grid gap-2">
        {(options.length ? options : block.knowledgeCheck?.options?.map((option) => ({ id: option.id, title: option.text, content: option.isCorrect ? 'true' : 'false' })) ?? []).map((item) => (
          <button key={item.id} type="button" className="flex items-center gap-3 rounded-lg bg-[var(--lux-surface)] px-3 py-3 text-left text-sm text-[var(--lux-text-strong)] transition">
            <span className="h-3 w-3 rounded-full bg-[var(--lux-primary-muted)]" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function PreviewFlashcardsBlock({
  block,
  accentColor,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  onComplete?: () => void
}) {
  const items = block.items ?? []
  const [flippedCards, setFlippedCards] = useState<Set<string>>(() => new Set())

  const flipCard = (id: string) => {
    setFlippedCards((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      if (!current.has(id) && items.every((item) => item.id === id || next.has(item.id))) {
        window.setTimeout(() => onComplete?.(), 0)
      }
      return next
    })
  }

  const card = (item: CourseInteractionItem) => {
    const flipped = flippedCards.has(item.id)
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => flipCard(item.id)}
        className="group relative flex min-h-[240px] flex-1 basis-[220px] cursor-pointer flex-col text-center outline-none [perspective:1000px]"
        style={{ minWidth: '200px' }}
      >
        <div 
          className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front Face */}
          <div 
            className="absolute inset-0 flex flex-col overflow-hidden [backface-visibility:hidden]"
            style={{
              boxShadow: '0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${accentColor}`,
              borderRadius: '2px',
              background: 'var(--lux-surface)',
            }}
          >
            <div className="flex w-full justify-end p-3">
              <RefreshCw size={16} className="text-[var(--lux-text-strong)] opacity-60 transition-opacity hover:opacity-100" />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
              {item.mediaUrl && ((item.match || 'front') === 'front') && (
                <div className="mb-4 flex w-full justify-center">
                  <PreviewItemMedia item={item} />
                </div>
              )}
              <p className="text-lg font-normal leading-relaxed text-[var(--lux-text-strong)]">
                {item.title || '\u2014'}
              </p>
            </div>
          </div>

          {/* Back Face */}
          <div 
            className="absolute inset-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{
              boxShadow: '0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${accentColor}`,
              borderRadius: '2px',
              background: 'var(--lux-surface)',
            }}
          >
            <div className="flex w-full justify-end p-3">
              <RefreshCw size={16} className="text-[var(--lux-text-strong)] opacity-60 transition-opacity hover:opacity-100" style={{ transform: 'rotateY(180deg)' }} />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
              {item.mediaUrl && ((item.match || 'front') === 'back') && (
                <div className="mb-4 flex w-full justify-center">
                  <PreviewItemMedia item={item} />
                </div>
              )}
              <p className="text-lg font-normal leading-relaxed text-[var(--lux-text-strong)]">
                {item.content || '\u2014'}
              </p>
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      <div className="mt-5 flex flex-wrap gap-5">{items.map(card)}</div>
    </section>
  )
}

function PreviewSortingBlock({
  block,
  accentColor,
  completed,
  onComplete,
}: {
  block: CourseBlock
  accentColor: string
  completed: boolean
  onComplete?: () => void
}) {
  const items = (block.items ?? []).filter((item) => item.title.trim())
  const categories = Array.from(
    new Set(items.map((item) => item.match?.trim()).filter((category): category is string => Boolean(category))),
  ).slice(0, 4)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [sortedIds, setSortedIds] = useState<Set<string>>(() => new Set())
  const [wrongIds, setWrongIds] = useState<Set<string>>(() => new Set())
  const [firstTryWrongIds, setFirstTryWrongIds] = useState<Set<string>>(() => new Set())

  const unsortedItems = items.filter((item) => !sortedIds.has(item.id))

  const attemptDrop = (category: string) => {
    if (!selectedItemId) return
    const item = items.find((candidate) => candidate.id === selectedItemId)
    if (!item) return

    if ((item.match ?? '').trim() === category) {
      const nextSorted = new Set(sortedIds)
      nextSorted.add(item.id)
      setSortedIds(nextSorted)
      setSelectedItemId(null)
      if (nextSorted.size === items.length) onComplete?.()
      return
    }

    setWrongIds((current) => new Set(current).add(item.id))
    setFirstTryWrongIds((current) => new Set(current).add(item.id))
    window.setTimeout(() => {
      setWrongIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }, 450)
  }

  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content || previewMetaString(block, 'instructions', 'Sort each item into the correct category.')}</p>
      {completed ? (
        <div className="mt-5 rounded-lg border border-[var(--lux-primary-muted)]/40 bg-[var(--lux-primary-muted)]/10 p-4">
          <p className="font-bold text-[var(--lux-text-strong)]">{previewMetaString(block, 'completionMessage', 'All items sorted.')}</p>
          <p className="mt-1 text-sm text-[var(--lux-muted)]">First try score: {items.length - firstTryWrongIds.size} / {items.length}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--lux-muted)]">Items</p>
            {unsortedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-3 text-left text-sm font-semibold transition',
                  selectedItemId === item.id ? 'border-[var(--lux-primary-muted)] bg-[var(--lux-primary-muted)]/15 text-[var(--lux-text-strong)]' : 'border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-[var(--lux-text-strong)] hover:border-[var(--lux-primary-muted)]/60',
                  wrongIds.has(item.id) && 'animate-[sorting-shake_0.4s_ease-in-out]',
                )}
              >
                {item.title.slice(0, 80)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => attemptDrop(category)}
                disabled={!selectedItemId}
                className="min-h-28 rounded-lg border border-dashed border-[var(--lux-primary-muted)]/45 bg-[var(--lux-surface-soft)] p-4 text-left transition hover:border-[var(--lux-primary-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="block text-sm font-bold text-[var(--lux-text-strong)]">{category}</span>
                <span className="mt-2 block text-xs text-[var(--lux-muted)]">Select an item, then choose this target.</span>
                <span className="mt-3 inline-flex rounded-full px-2 py-1 text-xs font-bold text-[var(--lux-text-strong)]" style={{ background: accentColor }}>
                  {items.filter((item) => sortedIds.has(item.id) && (item.match ?? '').trim() === category).length} sorted
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function PreviewInteractionBlock({ block }: { block: CourseBlock }) {
  const items = (block.items ?? []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim())
  return (
    <section className="pt-5">
      {block.title && <h3 className="text-2xl font-bold">{block.title}</h3>}
      {block.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{block.content}</p>}
      {items.length > 0 && (
        <div className={cn('mt-4 grid gap-3', block.type === 'flashcards' && 'sm:grid-cols-2')}>
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-4">
              {item.title && <p className="font-semibold">{item.title}</p>}
              {item.content && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--lux-muted)]">{item.content}</p>}
              {item.match && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted)]">{item.match}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PreviewTableBlock({ block }: { block: CourseBlock }) {
  const rows = parsePreviewTable(block.content ?? '')
  if (!rows.length) return <pre className="rounded-lg border border-[var(--lux-line)] bg-transparent p-4 text-sm text-[var(--lux-muted)]">{block.content || block.title || 'Table'}</pre>
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--lux-line)] bg-transparent lux-scrollbar">
      <table className="min-w-full text-left text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[var(--lux-line)] last:border-b-0">
              {row.map((cell, cellIndex) => rowIndex === 0 ? (
                <th key={cellIndex} className="px-3 py-2 font-bold">{cell}</th>
              ) : (
                <td key={cellIndex} className="px-3 py-2 text-[var(--lux-muted)]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PreviewChartBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  const chartType = previewMetaString(block, 'chartType', 'bar')
  const title = previewMetaString(block, 'chartTitle', block.title || 'Chart')
  const axisLabels = previewMetaString(block, 'axisLabels')
  const rawData = previewMetaString(block, 'data')

  // Parse data — supports JSON [{label,value},...] or legacy space/comma-separated numbers
  const chartData: { label: string; value: number }[] = (() => {
    try {
      const parsed = JSON.parse(rawData)
      if (Array.isArray(parsed)) {
        const mapped = parsed
          .map((item: unknown, i: number) => {
            const obj = item as Record<string, unknown>
            return { label: String(obj?.label ?? obj?.name ?? `Item ${i + 1}`), value: Number(obj?.value ?? obj?.y ?? 0) }
          })
          .filter((item) => Number.isFinite(item.value))
          .slice(0, 12)
        if (mapped.length) return mapped
      }
    } catch {
      // fall through to number parsing
    }
    const numbers = parsePreviewNumbers(rawData).slice(0, 12)
    if (numbers.length) return numbers.map((v, i) => ({ label: `Item ${i + 1}`, value: v }))
    return [
      { label: 'Item 1', value: 40 },
      { label: 'Item 2', value: 70 },
      { label: 'Item 3', value: 55 },
    ]
  })()

  if (chartType === 'pie') return <PreviewPieChart data={chartData} title={title} accentColor={accentColor} />
  if (chartType === 'line') return <PreviewLineChart data={chartData} title={title} accentColor={accentColor} axisLabels={axisLabels} />
  return <PreviewBarChart data={chartData} title={title} accentColor={accentColor} axisLabels={axisLabels} />
}

function PreviewBarChart({
  data,
  title,
  accentColor,
  axisLabels,
}: {
  data: { label: string; value: number }[]
  title: string
  accentColor: string
  axisLabels: string
}) {
  const [mounted, setMounted] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 60)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <h3 className="mb-1 text-2xl font-bold">{title}</h3>
      {axisLabels && <p className="mb-3 text-xs text-[var(--lux-muted)]">{axisLabels}</p>}
      <div className="relative flex h-52 items-end gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-4 pb-4 pt-6">
        {data.map((item, index) => {
          const heightPct = Math.max(6, (item.value / max) * 100)
          const isHovered = hoveredIndex === index
          return (
            <div
              key={index}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {isHovered && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-md border border-[var(--lux-line)] bg-[var(--lux-bg-alt)] px-2.5 py-1.5 text-xs shadow-xl">
                  <span className="font-semibold text-[var(--lux-text)]">{item.label}</span>
                  <span className="font-bold" style={{ color: accentColor }}>{item.value}</span>
                </div>
              )}
              <span
                className="w-full rounded-t"
                style={{
                  height: mounted ? `${heightPct}%` : '4px',
                  background: isHovered ? accentColor : `${accentColor}CC`,
                  transition: `height 0.65s cubic-bezier(0.34,1.2,0.64,1) ${index * 55}ms, background 0.15s ease`,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-2 px-4">
        {data.map((item, index) => (
          <span key={index} className="flex-1 truncate text-center text-[10px] text-[var(--lux-muted)]">{item.label}</span>
        ))}
      </div>
    </section>
  )
}

function PreviewLineChart({
  data,
  title,
  accentColor,
  axisLabels,
}: {
  data: { label: string; value: number }[]
  title: string
  accentColor: string
  axisLabels: string
}) {
  const [mounted, setMounted] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const W = 400
  const H = 180
  const PAD_L = 32
  const PAD_T = 16
  const PAD_R = 16
  const PAD_B = 16
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const vals = data.map((d) => d.value)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const range = max - min || 1

  const points = data.map((item, i) => ({
    x: PAD_L + (i / Math.max(data.length - 1, 1)) * innerW,
    y: PAD_T + (1 - (item.value - min) / range) * innerH,
    label: item.label,
    value: item.value,
  }))

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaStr = [`${PAD_L},${PAD_T + innerH}`, ...points.map((p) => `${p.x},${p.y}`), `${PAD_L + innerW},${PAD_T + innerH}`].join(' ')
  const approxLength = points.length > 1
    ? points.slice(1).reduce((sum, p, i) => {
        const dx = p.x - points[i].x
        const dy = p.y - points[i].y
        return sum + Math.sqrt(dx * dx + dy * dy)
      }, 0)
    : 500

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 80)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <h3 className="mb-1 text-2xl font-bold">{title}</h3>
      {axisLabels && <p className="mb-3 text-xs text-[var(--lux-muted)]">{axisLabels}</p>}
      <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }} aria-label={title}>
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={PAD_L} y1={PAD_T + (1 - t) * innerH}
              x2={PAD_L + innerW} y2={PAD_T + (1 - t) * innerH}
              stroke="#222B3A" strokeWidth={1}
            />
          ))}
          <polygon points={areaStr} fill={`${accentColor}18`} />
          <polyline
            points={polylineStr}
            fill="none"
            stroke={accentColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: approxLength,
              strokeDashoffset: mounted ? 0 : approxLength,
              transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)',
            }}
          />
          {points.map((point, index) => {
            const isHovered = hoveredIndex === index
            const ttX = Math.min(Math.max(point.x, PAD_L + 42), PAD_L + innerW - 42)
            const ttY = point.y - 12
            return (
              <g key={index}>
                <circle
                  cx={point.x} cy={point.y}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? accentColor : '#161C27'}
                  stroke={accentColor}
                  strokeWidth={2}
                  style={{ transition: 'r 0.15s ease, fill 0.15s ease' }}
                />
                {/* Wider invisible hit area */}
                <circle cx={point.x} cy={point.y} r={18} fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                {isHovered && (
                  <g>
                    <rect x={ttX - 40} y={ttY - 34} width={80} height={34} rx={5} fill="#0B0F16" stroke="#313847" strokeWidth={1} />
                    <text x={ttX} y={ttY - 19} textAnchor="middle" fontSize={9} fill="#C6CFDA">{point.label}</text>
                    <text x={ttX} y={ttY - 5} textAnchor="middle" fontSize={12} fontWeight="bold" fill={accentColor}>{point.value}</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-1 flex gap-1 px-2">
        {data.map((item, index) => (
          <span key={index} className="flex-1 truncate text-center text-[10px] text-[var(--lux-muted)]">{item.label}</span>
        ))}
      </div>
    </section>
  )
}

function PreviewPieChart({
  data,
  title,
  accentColor,
}: {
  data: { label: string; value: number }[]
  title: string
  accentColor: string
}) {
  const [mounted, setMounted] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 80)
    return () => window.clearTimeout(id)
  }, [])

  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0) || 1
  const R = 80
  const IR = 46
  const CX = 100
  const CY = 100

  // First segment uses accentColor; rest use evenly-spaced HSL hues
  const palette = data.map((_, i) => (i === 0 ? accentColor : `hsl(${(150 + i * 47) % 360}, 60%, 58%)`))

  const arcs = data.map((item, i) => {
    const startAngle =
      -Math.PI / 2 +
      data
        .slice(0, i)
        .reduce((angle, previous) => angle + (Math.max(0, previous.value) / total) * 2 * Math.PI, 0)
    const slice = (Math.max(0, item.value) / total) * 2 * Math.PI
    const endAngle = startAngle + slice
    const midAngle = startAngle + slice / 2
    const expand = mounted && hoveredIndex === i ? 8 : 0
    const ox = expand * Math.cos(midAngle)
    const oy = expand * Math.sin(midAngle)

    const x1 = CX + ox + R * Math.cos(startAngle)
    const y1 = CY + oy + R * Math.sin(startAngle)
    const x2 = CX + ox + R * Math.cos(endAngle)
    const y2 = CY + oy + R * Math.sin(endAngle)
    const ix1 = CX + ox + IR * Math.cos(startAngle)
    const iy1 = CY + oy + IR * Math.sin(startAngle)
    const ix2 = CX + ox + IR * Math.cos(endAngle)
    const iy2 = CY + oy + IR * Math.sin(endAngle)
    const largeArc = slice > Math.PI ? 1 : 0
    const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${IR} ${IR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`

    return { path, color: palette[i], item }
  })

  const hovered = hoveredIndex !== null ? data[hoveredIndex] : null
  const pct = hovered ? Math.round((Math.max(0, hovered.value) / total) * 100) : null

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <h3 className="mb-4 text-2xl font-bold">{title}</h3>
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
        <div className="relative shrink-0">
          <svg viewBox="0 0 200 200" width={200} height={200} aria-label={title}>
            <g style={{
              transformOrigin: '100px 100px',
              transform: mounted ? 'scale(1)' : 'scale(0)',
              transition: 'transform 0.6s cubic-bezier(0.34,1.4,0.64,1)',
            }}>
              {arcs.map((arc, i) => (
                <path
                  key={i}
                  d={arc.path}
                  fill={arc.color}
                  style={{ transition: 'transform 0.18s ease', transformOrigin: '100px 100px' }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              ))}
            </g>
            {hovered ? (
              <>
                <text x="100" y="93" textAnchor="middle" fontSize="20" fontWeight="bold" fill="white">{hovered.value}</text>
                <text x="100" y="108" textAnchor="middle" fontSize="9" fill="#96A0AF">{hovered.label}</text>
                <text x="100" y="122" textAnchor="middle" fontSize="11" fontWeight="bold" fill={accentColor}>{pct}%</text>
              </>
            ) : (
              <text x="100" y="105" textAnchor="middle" fontSize="10" fill="#96A0AF">Hover to inspect</text>
            )}
          </svg>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {data.map((item, i) => (
            <li
              key={i}
              className="flex cursor-default items-center gap-2 rounded px-2 py-1 text-sm transition"
              style={{ background: hoveredIndex === i ? `${palette[i]}20` : 'transparent' }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: palette[i] }} />
              <span className={cn('min-w-0 truncate', hoveredIndex === i ? 'font-bold text-[var(--lux-text-strong)]' : 'text-[var(--lux-text)]')}>{item.label}</span>
              <span className="ml-auto shrink-0 font-semibold" style={{ color: hoveredIndex === i ? palette[i] : '#96A0AF' }}>{item.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

type QuizPreviewAnswer = string | string[] | Record<string, string>
type QuizPreviewResult = {
  answered: boolean
  correct: boolean
  points: number
  feedback: string
}

function PreviewQuiz({ page, accentColor }: { page: CoursePage; accentColor: string }) {
  const questions = useMemo(() => (page.quiz?.questions ?? []).map(normalizeQuizQuestion), [page.quiz?.questions])
  const [answers, setAnswers] = useState<Record<string, QuizPreviewAnswer>>({})
  const [results, setResults] = useState<Record<string, QuizPreviewResult>>({})
  const [submitted, setSubmitted] = useState(false)
  const possibleScore = questions.reduce((total, question) => total + quizQuestionPoints(question), 0)
  const earnedScore = Object.values(results).reduce((total, result) => total + result.points, 0)
  const percent = possibleScore ? Math.round((earnedScore / possibleScore) * 100) : 0
  const passingScore = page.quiz?.passingScore ?? 80
  const allVerified = questions.length > 0 && questions.every((question) => results[question.id])

  const updateAnswer = (questionId: string, answer: QuizPreviewAnswer) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }))
    setSubmitted(false)
  }

  const verifyQuestion = (question: CourseQuizQuestion) => {
    const result = evaluatePreviewQuizQuestion(question, answers[question.id])
    setResults((current) => ({ ...current, [question.id]: result }))
  }

  const submitQuiz = () => {
    const nextResults = questions.reduce<Record<string, QuizPreviewResult>>((acc, question) => {
      acc[question.id] = evaluatePreviewQuizQuestion(question, answers[question.id])
      return acc
    }, {})
    setResults(nextResults)
    setSubmitted(true)
  }

  if (!questions.length) return <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">No quiz questions yet.</p>

  return (
    <div className="space-y-4">
      {questions.map((question, index) => {
        const type = normalizeQuizQuestionType(question.type)
        const result = results[question.id]
        return (
          <div key={question.id} className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: accentColor }}>Question {index + 1}</p>
            <h3 className="mt-2 text-xl font-bold">{question.text}</h3>
            {question.imageUrl && (
              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadedAssetUrl(question.imageUrl)} alt="" className="max-h-80 w-full object-contain" />
              </div>
            )}
            <div className="mt-4 space-y-2">
              {renderPreviewQuizAnswer({
                question,
                type,
                answer: answers[question.id],
                onChange: (answer) => updateAnswer(question.id, answer),
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => verifyQuestion(question)}
                className="inline-flex rounded-full px-4 py-2 text-sm font-bold text-white"
                style={{ background: accentColor }}
              >
                Verify
              </button>
              <span className="text-xs font-semibold text-[var(--lux-muted)]">{quizQuestionPoints(question)} point{quizQuestionPoints(question) === 1 ? '' : 's'}</span>
            </div>
            {result && (
              <div className={cn(
                'mt-4 rounded-lg border px-4 py-3 text-sm',
                result.correct
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/35 bg-red-500/10 text-red-200',
              )}>
                <p className="font-bold">{result.correct ? 'Correct' : result.answered ? 'Incorrect' : 'Incomplete'}</p>
                {result.feedback && <p className="mt-1 text-[var(--lux-text)]">{result.feedback}</p>}
              </div>
            )}
          </div>
        )
      })}

      <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--lux-text-strong)]">Score {earnedScore} / {possibleScore}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--lux-muted)]">{allVerified ? `${percent}% ${percent >= passingScore ? 'passed' : 'not passed'}` : 'Verify questions or submit to complete.'}</p>
          </div>
          <button type="button" onClick={submitQuiz} className="inline-flex rounded-full px-4 py-2 text-sm font-bold text-white" style={{ background: accentColor }}>
            Submit quiz
          </button>
        </div>
        {submitted && (
          <div className="mt-4 rounded-lg bg-[var(--lux-surface-soft)] px-4 py-3 text-sm text-[var(--lux-text)]">
            {percent >= passingScore ? 'Completion status: Passed' : 'Completion status: Failed'}
          </div>
        )}
      </div>
    </div>
  )
}

function renderPreviewQuizAnswer({
  question,
  type,
  answer,
  onChange,
}: {
  question: CourseQuizQuestion
  type: CanonicalQuizQuestionType
  answer: QuizPreviewAnswer | undefined
  onChange: (answer: QuizPreviewAnswer) => void
}) {
  if (type === 'fill_blank') {
    return (
      <input
        value={typeof answer === 'string' ? answer : ''}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    )
  }

  if (type === 'matching') {
    const selected = isRecordAnswer(answer) ? answer : {}
    const matches = question.options.map((option) => option.match || '').filter(Boolean)
    return question.options.map((option) => (
      <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <span className="font-semibold text-[var(--lux-text-strong)]">{option.text}</span>
        <select
          value={selected[option.id] ?? ''}
          onChange={(event) => onChange({ ...selected, [option.id]: event.target.value })}
          className={selectClass}
        >
          <option value="">Choose match</option>
          {matches.map((match) => <option key={`${option.id}-${match}`} value={match}>{match}</option>)}
        </select>
      </div>
    ))
  }

  const selectedIds = Array.isArray(answer) ? answer : []
  const selectedId = typeof answer === 'string' ? answer : ''

  return question.options.map((option) => (
    <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-3 text-sm transition hover:border-[var(--lux-primary-muted)]">
      <input
        type={type === 'multiple_response' ? 'checkbox' : 'radio'}
        name={`preview-${question.id}`}
        checked={type === 'multiple_response' ? selectedIds.includes(option.id) : selectedId === option.id}
        onChange={(event) => {
          if (type === 'multiple_response') {
            const nextIds = event.target.checked
              ? [...selectedIds, option.id]
              : selectedIds.filter((id) => id !== option.id)
            onChange(nextIds)
            return
          }
          onChange(option.id)
        }}
      />
      <span>{option.text}</span>
    </label>
  ))
}

function evaluatePreviewQuizQuestion(question: CourseQuizQuestion, answer: QuizPreviewAnswer | undefined): QuizPreviewResult {
  const normalized = normalizeQuizQuestion(question)
  const type = normalizeQuizQuestionType(normalized.type)
  const points = quizQuestionPoints(normalized)
  let answered = false
  let correct = false

  if (type === 'multiple_choice') {
    const selectedId = typeof answer === 'string' ? answer : ''
    const selected = normalized.options.find((option) => option.id === selectedId)
    answered = Boolean(selected)
    correct = Boolean(selected?.isCorrect)
  } else if (type === 'multiple_response') {
    const selectedIds = new Set(Array.isArray(answer) ? answer : [])
    const correctIds = normalized.options.filter((option) => option.isCorrect).map((option) => option.id)
    answered = selectedIds.size > 0
    correct = answered && selectedIds.size === correctIds.length && correctIds.every((id) => selectedIds.has(id))
  } else if (type === 'fill_blank') {
    const response = typeof answer === 'string' ? answer : ''
    const normalize = (value: string) => normalized.caseSensitive ? value.trim() : value.trim().toLocaleLowerCase()
    answered = Boolean(response.trim())
    correct = answered && normalized.options.some((option) => normalize(option.text) === normalize(response))
  } else {
    const selected = isRecordAnswer(answer) ? answer : {}
    answered = normalized.options.length > 0 && normalized.options.every((option) => Boolean(selected[option.id]))
    correct = answered && normalized.options.every((option) => selected[option.id] === (option.match ?? ''))
  }

  return {
    answered,
    correct,
    points: correct ? points : 0,
    feedback: previewQuizFeedback(normalized, correct),
  }
}

function previewQuizFeedback(question: CourseQuizQuestion, correct: boolean) {
  if ((question.feedbackMode ?? 'any_response') === 'any_response') {
    return question.feedback ?? ''
  }
  return correct ? question.correctFeedback ?? 'Correct.' : question.incorrectFeedback ?? 'Incorrect.'
}

function quizQuestionPoints(question: CourseQuizQuestion) {
  const points = Number(question.points)
  return Number.isFinite(points) && points > 0 ? points : 1
}

function isRecordAnswer(answer: QuizPreviewAnswer | undefined): answer is Record<string, string> {
  return Boolean(answer) && typeof answer === 'object' && !Array.isArray(answer)
}

function PreviewScenario({ page }: { page: CoursePage }) {
  const nodes = page.scenario?.nodes ?? []
  const startNode = nodes.find((node) => node.id === page.scenario?.startNodeId) ?? nodes[0]

  if (!startNode) {
    return <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">No scenario nodes yet.</p>
  }

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <PreviewScenarioNode node={startNode} />
    </section>
  )
}

function PreviewScenarioNode({ node }: { node: BranchingNode }) {
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">Branching scenario</p>
      <h3 className="mt-1 text-2xl font-bold">{node.speaker || 'Scenario'}</h3>
      <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-[var(--lux-muted)]">{node.text}</p>
      {node.choices.length > 0 && (
        <div className="mt-5 grid gap-3">
          {node.choices.map((choice) => (
            <button key={choice.id} type="button" className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-4 py-3 text-left text-sm text-[var(--lux-text-strong)] transition hover:border-[var(--lux-primary-muted)]">
              {choice.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PreviewEmptyMedia({ label }: { label: string }) {
  return <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-[var(--lux-line)] bg-[var(--lux-surface)] text-sm text-[var(--lux-muted)]">{label}</div>
}

function previewLessonToPage(lesson: CourseLesson): CoursePage {
  return {
    id: lesson.id,
    type: lesson.type === 'quiz' ? 'quiz' : 'lesson',
    title: lesson.title,
    summary: lesson.summary,
    coverImageUrl: lesson.coverImageUrl,
    blocks: lesson.blocks,
    quiz: lesson.quiz
        ? {
          passingScore: lesson.quiz.passingScore,
          timeLimitMinutes: lesson.quiz.timeLimitMinutes,
          attempts: lesson.quiz.attempts,
          randomizeQuestions: lesson.quiz.randomizeQuestions,
          randomizeAnswers: lesson.quiz.randomizeAnswers,
          showFeedback: lesson.quiz.showFeedback,
          questions: lesson.quiz.questions,
        }
      : undefined,
    metadata: lesson.metadata,
  }
}

function isPreviewAutoCompleteBlock(block: CourseBlock) {
  return !['accordion', 'tabs', 'flashcards', 'sorting_activity', 'sorting', 'process_steps', 'continue_button'].includes(block.type)
}

function previewMetaString(block: CourseBlock, key: string, fallback = '') {
  const value = block.metadata?.[key]
  return typeof value === 'string' ? value : fallback
}

function previewMetaNumber(block: CourseBlock, key: string, fallback = 0) {
  const value = block.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function previewMetaBoolean(block: CourseBlock, key: string, fallback = false) {
  const value = block.metadata?.[key]
  return typeof value === 'boolean' ? value : fallback
}

function parsePreviewTable(value: string) {
  return value
    .split('\n')
    .map((row) => row.split(/\t|,/).map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 0)
}

function parsePreviewNumbers(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}
