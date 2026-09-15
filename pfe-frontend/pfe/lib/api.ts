import axios from 'axios'
import Cookies from 'js-cookie'
import { clearAuth, normalizeUser } from '@/lib/auth'
import type {
  Activity,
  AiChangeSet,
  AiCourseBrief,
  AiCourseOutline,
  ActivityType,
  CourseDocument,
  MediaAsset,
  MediaType,
  Question,
  QuestionType,
  Quiz,
  Scenario,
  ScenarioComment,
  ScenarioDocument,
  ScenarioModule,
  ScenarioNotification,
  ScenarioShare,
  ScenarioStatus,
  Sequence,
  CourseTeamRole,
  UploadedScormPackage,
  User,
} from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

type RawRecord = Record<string, unknown>

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null
}

function responseMessageFrom(data: unknown): string | undefined {
  if (typeof data === 'string') return data
  if (!isRecord(data)) return undefined

  const message = data.message
  if (typeof message === 'string') return message
  if (Array.isArray(message)) {
    const messages = message.filter((item): item is string => typeof item === 'string')
    return messages.length ? messages.join(' ') : undefined
  }

  return undefined
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Request failed. Please try again.',
): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot reach the server. Check that the backend is running and try again.'
    }

    if (error.response.status === 401) {
      return 'Invalid email or password.'
    }

    if (error.response.status === 429) {
      return 'Too many attempts. Please wait a moment and try again.'
    }

    return responseMessageFrom(error.response.data) ?? fallback
  }

  return error instanceof Error ? error.message : fallback
}

function asArray(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function stringFrom(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function optionalStringFrom(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberFrom(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function idFrom(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
}

function nameFromUserRecord(user: RawRecord | undefined): string {
  if (!user) return ''

  const fullName = [user.firstName, user.lastName]
    .map((part) => stringFrom(part).trim())
    .filter(Boolean)
    .join(' ')

  return (
    fullName ||
    stringFrom(user.name).trim() ||
    stringFrom(user.email).trim() ||
    (idFrom(user.id) ? `User #${idFrom(user.id)}` : '')
  )
}

const statusMap: Record<string, ScenarioStatus> = {
  brouillon: 'BROUILLON',
  en_cours_validation: 'EN_COURS_VALIDATION',
  approuve: 'APPROUVE',
  exporte: 'EXPORTE',
  archive: 'ARCHIVE',
  DRAFT: 'BROUILLON',
  PUBLISHED: 'APPROUVE',
  ARCHIVED: 'ARCHIVE',
}

function normalizeScenarioStatus(value: unknown): ScenarioStatus {
  const status = stringFrom(value)
  return statusMap[status] ?? statusMap[status.toLowerCase()] ?? 'BROUILLON'
}

function scenarioStatusToBackend(status: ScenarioStatus | string): string {
  const map: Record<string, string> = {
    BROUILLON: 'brouillon',
    EN_COURS_VALIDATION: 'en_cours_validation',
    APPROUVE: 'approuve',
    EXPORTE: 'exporte',
    ARCHIVE: 'archive',
  }
  return map[status] ?? status
}

const activityTypeToFrontend: Record<string, ActivityType> = {
  qcm: 'QUIZ',
  vml: 'TEXT',
  exercice: 'TEXT',
  discussion: 'TEXT',
  appartement: 'TEXT',
  VIDEO: 'VIDEO',
  TEXT: 'TEXT',
  QUIZ: 'QUIZ',
  FILE: 'FILE',
  LINK: 'LINK',
}

function questionTypeToFrontend(type: unknown): QuestionType {
  const raw = stringFrom(type)
  if (raw === 'vrai_faux' || raw === 'TRUE_FALSE') return 'TRUE_FALSE'
  return 'MCQ'
}

function questionTypeToBackend(type: QuestionType): string {
  return type === 'TRUE_FALSE' ? 'vrai_faux' : 'qcm'
}

function mediaTypeFrom(raw: RawRecord): MediaType {
  const type = stringFrom(raw.type).toLowerCase()
  const url = stringFrom(raw.url)
  if (type === 'mass' || type === 'image') return 'IMAGE'
  if (type === 'video') return 'VIDEO'
  if (type === 'audio') return 'AUDIO'
  if (type === 'document') return 'DOCUMENT'
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(url)) return 'IMAGE'
  if (/\.(mp3|wav|ogg|m4a)$/i.test(url)) return 'AUDIO'
  return 'DOCUMENT'
}

function mediaTypeToBackend(file: File): 'mass' | 'video' | 'audio' | 'document' | 'discussion' {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(name)) return 'video'
  if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return 'mass'
  if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio'
  return 'document'
}

function normalizeUserList(data: unknown): User[] {
  const source = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : []

  return source
    .filter(isRecord)
    .map((user) => normalizeUser(user as Parameters<typeof normalizeUser>[0]))
}

function normalizeUserResponse(data: unknown): User | unknown {
  if (!isRecord(data)) return data
  return normalizeUser(data as Parameters<typeof normalizeUser>[0])
}

function normalizeUserMutation(data: object): object {
  const raw = data as RawRecord
  return {
    firstName: raw.firstName,
    lastName: raw.lastName,
    email: raw.email,
    password: typeof raw.password === 'string' && raw.password.trim() ? raw.password : undefined,
    role: typeof raw.role === 'string' ? raw.role.toLowerCase() : undefined,
  }
}

function normalizeAnswerList(question: RawRecord): string[] {
  if (Array.isArray(question.options)) {
    return question.options.filter((option): option is string => typeof option === 'string')
  }
  return asArray(question.reponses).map((answer) => stringFrom(answer.texte))
}

function normalizeCorrectAnswer(question: RawRecord): string {
  if (typeof question.correctAnswer === 'string') return question.correctAnswer
  const correct = asArray(question.reponses).find((answer) => answer.estCorrect === true)
  return correct ? stringFrom(correct.texte) : ''
}

function normalizeQuestion(raw: RawRecord): Question {
  return {
    id: idFrom(raw.id),
    text: stringFrom(raw.text ?? raw.titre ?? raw.texte),
    type: questionTypeToFrontend(raw.type),
    options: normalizeAnswerList(raw),
    correctAnswer: normalizeCorrectAnswer(raw),
    points: optionalNumberFrom(raw.points),
  }
}

function normalizeQuizResponse(data: unknown): Quiz | null {
  if (!isRecord(data)) return null
  return {
    id: idFrom(data.id),
    title: stringFrom(data.title ?? data.titre, 'Quiz'),
    questions: asArray(data.questions).map(normalizeQuestion),
    passingScore: numberFrom(data.passingScore ?? data.scorePourReussir, 70),
    attempts: optionalNumberFrom(data.tentatives),
    activityId: isRecord(data.activite) ? idFrom(data.activite.id) : undefined,
  }
}

function normalizeActivity(raw: RawRecord): Activity {
  return {
    id: idFrom(raw.id),
    title: stringFrom(raw.title ?? raw.titre, 'Untitled activity'),
    type: activityTypeToFrontend[stringFrom(raw.type)] ?? 'TEXT',
    content: optionalStringFrom(raw.content ?? raw.consigne),
    mediaUrl: optionalStringFrom(raw.mediaUrl ?? raw.url),
    duration: optionalNumberFrom(raw.duration ?? raw.duree),
    points: optionalNumberFrom(raw.points),
    order: numberFrom(raw.order ?? raw.ordre),
    quiz: normalizeQuizResponse(raw.quiz) ?? undefined,
  }
}

function normalizeSequence(raw: RawRecord): Sequence {
  return {
    id: idFrom(raw.id),
    title: stringFrom(raw.title ?? raw.titre, 'Untitled sequence'),
    description: optionalStringFrom(raw.description ?? raw.texte),
    order: numberFrom(raw.order ?? raw.ordre),
    activities: asArray(raw.activities ?? raw.activites).map(normalizeActivity),
  }
}

function normalizeModule(raw: RawRecord): ScenarioModule {
  return {
    id: idFrom(raw.id),
    title: stringFrom(raw.title ?? raw.titre, 'Untitled module'),
    description: optionalStringFrom(raw.description),
    order: numberFrom(raw.order ?? raw.ordre),
    sequences: asArray(raw.sequences).map(normalizeSequence),
  }
}

function normalizeScenario(raw: RawRecord): Scenario {
  const status = normalizeScenarioStatus(raw.status ?? raw.statut)
  const createdAt = stringFrom(raw.createdAt ?? raw.dateCreation, new Date().toISOString())
  const title = stringFrom(raw.title ?? raw.titre, 'Untitled scenario')
  const ownerSource = isRecord(raw.author)
    ? raw.author
    : isRecord(raw.user)
      ? raw.user
      : isRecord(raw.owner)
        ? raw.owner
        : isRecord(raw.createdBy)
          ? raw.createdBy
          : undefined
  const ownerId = idFrom(ownerSource?.id ?? raw.ownerId ?? raw.authorId ?? raw.userId ?? raw.createdById)
  const author = ownerSource
    ? normalizeUser(ownerSource as Parameters<typeof normalizeUser>[0])
    : undefined
  const ownerName = (
    stringFrom(raw.ownerName).trim() ||
    nameFromUserRecord(ownerSource) ||
    (ownerId ? `User #${ownerId}` : '')
  )

  return {
    id: idFrom(raw.id),
    title,
    titre: title,
    description: optionalStringFrom(raw.description),
    objectif: optionalStringFrom(raw.objectif),
    niveau: optionalStringFrom(raw.niveau),
    dureeScenario: optionalNumberFrom(raw.dureeScenario),
    courseDocument: isRecord(raw.courseDocument) ? raw.courseDocument as unknown as CourseDocument : undefined,
    courseDocumentVersion: optionalNumberFrom(raw.courseDocumentVersion),
    scenarioDocument: isRecord(raw.scenarioDocument) ? raw.scenarioDocument as unknown as ScenarioDocument : undefined,
    scenarioDocumentVersion: optionalNumberFrom(raw.scenarioDocumentVersion),
    status,
    statut: scenarioStatusToBackend(status),
    template: 'BLANK',
    isPublic: raw.isPublic === true,
    author,
    ownerId: ownerId || undefined,
    ownerName: ownerName || undefined,
    modules: asArray(raw.modules).map(normalizeModule),
    shares: asArray(raw.shares).map(normalizeShare),
    createdAt,
    dateCreation: createdAt,
    updatedAt: stringFrom(raw.updatedAt, createdAt),
  }
}

function normalizeScenarioResponse(data: unknown): Scenario | unknown {
  return isRecord(data) ? normalizeScenario(data) : data
}

function normalizeScenarioList(data: unknown): Scenario[] {
  const source = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : []
  return source.filter(isRecord).map(normalizeScenario)
}

export interface PaginatedScenarios {
  items: Scenario[]
  total: number
  page: number
  limit: number
}

/**
 * The paginated scenario endpoints (`/scenarios`, `/scenarios/my`) return
 * `{ items, total, page, limit }`. This also tolerates a bare array or the
 * legacy `{ data: [...] }` envelope so older/mocked responses (and any
 * caller that hasn't been updated) still normalize instead of silently
 * turning into an empty list.
 */
function normalizeScenarioListResponse(data: unknown): PaginatedScenarios {
  if (isRecord(data) && Array.isArray(data.items)) {
    const items = data.items.filter(isRecord).map(normalizeScenario)
    return {
      items,
      total: numberFrom(data.total, items.length),
      page: numberFrom(data.page, 1),
      limit: numberFrom(data.limit, items.length || 20),
    }
  }

  const items = normalizeScenarioList(data)
  return { items, total: items.length, page: 1, limit: items.length || 20 }
}

function normalizeMediaAsset(raw: RawRecord): MediaAsset {
  const type = mediaTypeFrom(raw)
  const title = stringFrom(raw.originalName ?? raw.filename ?? raw.titre, 'Untitled file')
  const createdAt = stringFrom(raw.createdAt, new Date().toISOString())

  return {
    id: idFrom(raw.id),
    filename: title,
    originalName: title,
    mimetype: stringFrom(raw.mimetype),
    size: numberFrom(raw.size ?? raw.taille),
    url: stringFrom(raw.url),
    type,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    createdAt,
  }
}

function normalizeMediaList(data: unknown): MediaAsset[] {
  const source = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : []
  return source.filter(isRecord).map(normalizeMediaAsset)
}

function normalizeShare(raw: RawRecord): ScenarioShare {
  const userSource = isRecord(raw.user)
    ? raw.user
    : isRecord(raw.sharedWith)
      ? raw.sharedWith
      : {}
  const permission = stringFrom(raw.permission).toLowerCase() === 'edit' ? 'EDIT' : 'READ'
  const rawRole = stringFrom(raw.role).toLowerCase()
  const role: CourseTeamRole =
    rawRole === 'co_author'
      ? 'CO_AUTHOR'
      : rawRole === 'owner'
        ? 'OWNER'
        : 'REVIEWER'

  return {
    id: idFrom(raw.id),
    user: normalizeUser(userSource as Parameters<typeof normalizeUser>[0]),
    permission,
    role,
    canEditStructure: raw.canEditStructure === true,
    canEditContent: raw.canEditContent === true,
    canPublish: raw.canPublish === true,
    createdAt: stringFrom(raw.createdAt ?? raw.sharedAt, new Date().toISOString()),
  }
}

function normalizeShareList(data: unknown): ScenarioShare[] {
  const source = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : []
  return source.filter(isRecord).map(normalizeShare)
}

function normalizeCollaborationUser(raw: unknown): User {
  return normalizeUser((isRecord(raw) ? raw : {}) as Parameters<typeof normalizeUser>[0])
}

function normalizeComment(raw: RawRecord): ScenarioComment {
  return {
    id: idFrom(raw.id),
    targetType: stringFrom(raw.targetType, 'course') as ScenarioComment['targetType'],
    targetId: optionalStringFrom(raw.targetId),
    body: stringFrom(raw.body),
    mentions: Array.isArray(raw.mentions)
      ? raw.mentions.map(idFrom).filter(Boolean)
      : [],
    status: stringFrom(raw.status).toLowerCase() === 'resolved' ? 'resolved' : 'open',
    author: normalizeCollaborationUser(raw.author),
    createdAt: stringFrom(raw.createdAt, new Date().toISOString()),
    updatedAt: stringFrom(raw.updatedAt, new Date().toISOString()),
    resolvedAt: optionalStringFrom(raw.resolvedAt),
  }
}

function normalizeCommentList(data: unknown): ScenarioComment[] {
  const source = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : []
  return source.filter(isRecord).map(normalizeComment)
}

function normalizeScenarioNotification(raw: RawRecord): ScenarioNotification {
  const message = stringFrom(raw.message) as ScenarioNotification['message']
  return {
    id: stringFrom(raw.id, idFrom(raw.scenarioId)),
    message,
    scenarioId: idFrom(raw.scenarioId),
    scenarioTitle: stringFrom(raw.scenarioTitle, 'Untitled scenario'),
    createdAt: stringFrom(raw.createdAt, new Date().toISOString()),
  }
}

function normalizeScenarioNotificationList(data: unknown): ScenarioNotification[] {
  const source = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : []
  return source.filter(isRecord).map(normalizeScenarioNotification)
}

function normalizeScenarioMutation(data: object): object {
  const raw = data as RawRecord
  return {
    ...data,
    titre: raw.titre ?? raw.title,
    statut:
      typeof raw.status === 'string'
        ? scenarioStatusToBackend(raw.status)
        : raw.statut,
    title: undefined,
    status: undefined,
  }
}

function normalizeQuizMutation(activityId: string, data: object): object {
  const raw = data as RawRecord
  return {
    titre: stringFrom(raw.title ?? raw.titre, 'Quiz'),
    description: optionalStringFrom(raw.description),
    tentatives: optionalNumberFrom(raw.attempts ?? raw.tentatives),
    scorePourReussir: numberFrom(raw.passingScore ?? raw.scorePourReussir, 70),
    activiteId: Number(activityId),
  }
}

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('edu_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete?.('Content-Type')
    config.headers.delete?.('content-type')
    delete config.headers['Content-Type']
    delete config.headers['content-type']
  }
  return config
})

// Handle 401 by clearing the local session.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = String(error.config?.url ?? '')
      const requestMethod = String(error.config?.method ?? '').toUpperCase()
      const isLoginAttempt = requestUrl.includes('/auth/login')
      const isPublicRegistration = requestMethod === 'POST' && requestUrl === '/users'

      if (!isLoginAttempt && !isPublicRegistration) {
        clearAuth()
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then((response) => {
      response.data.userInfo = normalizeUserResponse(response.data.userInfo ?? response.data.user)
      return response
    }),
  register: (data: {
    firstName: string
    lastName: string
    email: string
    password: string
  }) => api.post('/users', data).then((response) => {
    response.data = normalizeUserResponse(response.data)
    return response
  }),
  me: () => api.get('/users/me').then((response) => {
    response.data = normalizeUserResponse(response.data)
    return response
  }),
}

export const usersApi = {
  getAll: () => api.get('/users').then((response) => {
    response.data = normalizeUserList(response.data)
    return response
  }),
  search: (query: string) => api.get('/users/search', { params: { q: query } }).then((response) => {
    response.data = normalizeUserList(response.data)
    return response
  }),
  create: (data: {
    firstName: string
    lastName: string
    email: string
    password: string
    role: string
  }) => api.post('/users/managed', normalizeUserMutation(data)).then((response) => {
    response.data = normalizeUserResponse(response.data)
    return response
  }),
  getMe: () => api.get('/users/me').then((response) => {
    response.data = normalizeUserResponse(response.data)
    return response
  }),
  updateMe: (data: Partial<{ firstName: string; lastName: string; email: string; password?: string }>) =>
    api.put('/users/me', data).then((response) => {
      response.data = normalizeUserResponse(response.data)
      return response
    }),
  update: (id: string, data: Partial<{
    firstName: string
    lastName: string
    email: string
    password: string
    role: string
  }>) => api.put(`/users/${id}`, normalizeUserMutation(data)).then((response) => {
    response.data = normalizeUserResponse(response.data)
    return response
  }),
  updateRole: (id: string, role: string) =>
    api.put(`/users/${id}/role`, { role: role.toLowerCase() }).then((response) => {
      response.data = normalizeUserResponse(response.data)
      return response
    }),
  delete: (id: string) => api.delete(`/users/${id}`),
}

export interface ScenarioListParams {
  /** Single status. Use `statuses` instead for a multi-status filter (e.g. Approved = APPROUVE + EXPORTE). */
  status?: ScenarioStatus
  /** One or more statuses, OR-ed together server-side. Takes precedence over `status` if both are set. */
  statuses?: ScenarioStatus[]
  search?: string
  page?: number
  limit?: number
  /** Restrict to scenarios the requester owns or is shared on, regardless of status. */
  mine?: boolean
}

function scenarioListRequestParams(params?: ScenarioListParams) {
  const statusParam = params?.statuses?.length
    ? params.statuses.map((status) => scenarioStatusToBackend(status)).join(',')
    : params?.status
      ? scenarioStatusToBackend(params.status)
      : undefined

  return {
    page: params?.page,
    limit: params?.limit,
    search: params?.search || undefined,
    status: statusParam,
    mine: params?.mine ? 'true' : undefined,
  }
}

export const scenariosApi = {
  /** Returns `{ items, total, page, limit }` — pass `page`/`limit` to paginate server-side. */
  getAll: (params?: ScenarioListParams) =>
    api.get('/scenarios/my', {
      params: scenarioListRequestParams(params),
    }).then((response) => {
      response.data = normalizeScenarioListResponse(response.data)
      return response
    }),
  /** Returns `{ items, total, page, limit }` — pass `page`/`limit` to paginate server-side. */
  getAllAdmin: (params?: ScenarioListParams) =>
    api.get('/scenarios', {
      params: scenarioListRequestParams(params),
    }).then((response) => {
      response.data = normalizeScenarioListResponse(response.data)
      return response
    }),
  getNotifications: () => api.get('/scenarios/notifications').then((response) => {
    response.data = normalizeScenarioNotificationList(response.data)
    return response
  }),
  getOne: (id: string) => api.get(`/scenarios/${id}`).then((response) => {
    response.data = normalizeScenarioResponse(response.data)
    return response
  }),
  create: (data: { title?: string; titre?: string; description?: string; objectif?: string; niveau?: string; dureeScenario?: number; template?: string; isPublic?: boolean; courseDocument?: CourseDocument; scenarioDocument?: ScenarioDocument }) =>
    api.post('/scenarios', normalizeScenarioMutation(data)).then((response) => {
      response.data = normalizeScenarioResponse(response.data)
      return response
    }),
  update: (id: string, data: object) => api.put(`/scenarios/${id}`, normalizeScenarioMutation(data)).then((response) => {
    response.data = normalizeScenarioResponse(response.data)
    return response
  }),
  getCourseDocument: (id: string) => api.get(`/scenarios/${id}/course-document`).then((response) => {
    response.data = response.data as CourseDocument
    return response
  }),
  updateCourseDocument: (id: string, courseDocument: CourseDocument, expectedVersion?: number) =>
    api.put(`/scenarios/${id}/course-document`, { courseDocument, expectedVersion }).then((response) => {
      response.data = response.data as CourseDocument
      return response
    }),

  submit:   (id: string) => api.patch(`/scenarios/${id}/submit`),
  approve:  (id: string) => api.patch(`/scenarios/${id}/approve`),
  reject:   (id: string, data?: { comment?: string }) => api.patch(`/scenarios/${id}/reject`, data),
  markExported: (id: string) => api.patch(`/scenarios/${id}/export`),
  archive:  (id: string) => api.patch(`/scenarios/${id}/archive`),
  duplicate:(id: string) => api.post(`/scenarios/${id}/duplicate`),
  delete:   (id: string) => api.delete(`/scenarios/${id}`),

  getShares: (id: string) => api.get(`/scenario-shares/scenario/${id}`).then((response) => {
    response.data = normalizeShareList(response.data)
    return response
  }),
  share: (id: string, data: { userId?: string; email?: string }) =>
    api.post('/scenario-shares', {
      scenarioId: Number(id),
      sharedWithId: data.userId ? Number(data.userId) : undefined,
      collaboratorEmail: data.email?.trim(),
      permission: 'edit',
      role: 'co_author',
      canEditStructure: true,
      canEditContent: true,
      canPublish: true,
    }).then((response) => {
      response.data = isRecord(response.data) ? normalizeShare(response.data) : response.data
      return response
    }),
  revokeShare: (_id: string, shareId: string) =>
    api.delete(`/scenario-shares/${shareId}`),
  getComments: (id: string) => api.get(`/scenario-shares/scenario/${id}/comments`).then((response) => {
    response.data = normalizeCommentList(response.data)
    return response
  }),
  createComment: (id: string, data: { targetType: ScenarioComment['targetType']; targetId?: string; body: string; mentions?: string[] }) =>
    api.post(`/scenario-shares/scenario/${id}/comments`, {
      targetType: data.targetType,
      targetId: data.targetId,
      body: data.body,
      mentions: data.mentions?.map(Number),
    }).then((response) => {
      response.data = isRecord(response.data) ? normalizeComment(response.data) : response.data
      return response
    }),
  updateComment: (commentId: string, data: { body?: string; mentions?: string[] }) =>
    api.put(`/scenario-shares/comments/${commentId}`, {
      body: data.body?.trim(),
      mentions: data.mentions?.map(Number),
    }).then((response) => {
      response.data = isRecord(response.data) ? normalizeComment(response.data) : response.data
      return response
    }),
  resolveComment: (_id: string, commentId: string) =>
    api.patch(`/scenario-shares/comments/${commentId}/resolve`).then((response) => {
      response.data = isRecord(response.data) ? normalizeComment(response.data) : response.data
      return response
    }),
}

export const aiCoursesApi = {
  createOutline: (brief: AiCourseBrief) =>
    api.post('/ai/courses/outline', brief).then((response) => {
      response.data = response.data as AiCourseOutline
      return response
    }),
  create: (brief: AiCourseBrief, outline?: AiCourseOutline) =>
    api.post('/ai/courses', { ...brief, outline }).then((response) => {
      response.data = normalizeScenarioResponse(response.data)
      return response
    }),
  proposeEdit: (
    scenarioId: string,
    payload: {
      instruction: string
      scope: { type: 'course' } | { type: 'lesson'; lessonId: string } | { type: 'block'; lessonId: string; blockId: string }
      courseDocument: CourseDocument
      expectedVersion: number
    },
  ) => api.post(`/ai/courses/${scenarioId}/changes`, payload).then((response) => {
    response.data = response.data as AiChangeSet
    return response
  }),
  apply: (changeSetId: string) => api.post(`/ai/courses/changes/${changeSetId}/apply`).then((response) => {
    response.data = response.data as CourseDocument
    return response
  }),
  reject: (changeSetId: string) => api.post(`/ai/courses/changes/${changeSetId}/reject`),
}

export const mediaApi = {
  getAll: (params?: { type?: string; search?: string; page?: number; limit?: number }) =>
    api.get('/ressources', { params }).then((response) => {
      response.data = normalizeMediaList(response.data)
      return response
    }),
  upload: async (fileOrFormData: File | FormData) => {
    const file = fileOrFormData instanceof FormData
      ? fileOrFormData.get('file')
      : fileOrFormData

    if (!(file instanceof File)) {
      throw new Error('No file selected')
    }

    const resource = await api.post('/ressources', {
      titre: file.name,
      type: mediaTypeToBackend(file),
      taille: file.size,
    })

    const resourceId = idFrom(resource.data?.id)
    const formData = new FormData()
    formData.append('file', file)

    return api
      .post(`/media/upload/ressource/${resourceId}`, formData)
      .then((response) => {
        response.data = normalizeMediaAsset(response.data)
        return response
      })
  },
  updateTags: (id: string, tags: string[]) => {
    void id
    void tags
    return Promise.reject(new Error('Resource tags are not supported by the backend yet'))
  },
  delete: (id: string) => api.delete(`/ressources/${id}`),
}

export const quizApi = {
  getByActivity: (activityId: string) =>
    api.get(`/quiz/activite/${activityId}`).then((response) => {
      response.data = normalizeQuizResponse(response.data)
      return response
    }),
  create: (activityId: string, data: object) =>
    api.post('/quiz', normalizeQuizMutation(activityId, data)).then((response) => {
      response.data = normalizeQuizResponse(response.data)
      return response
    }),
  update: (quizId: string, data: object) =>
    api.put(`/quiz/${quizId}`, normalizeQuizMutation('', data)).then((response) => {
      response.data = normalizeQuizResponse(response.data)
      return response
    }),
  delete: (quizId: string) => api.delete(`/quiz/${quizId}`),
  questionTypeToBackend,
}

export const analyticsApi = {
  getDashboard: (days?: number) => api.get('/rapports/analytics/dashboard', { params: days ? { days } : undefined }),
  getScenarioStats: (id: string) => api.get(`/rapports/analytics/scenario/${id}`),
  getUserActivity: (userId: string) => api.get(`/rapports/analytics/user/${userId}`),
  getMyStats: (days?: number) => api.get('/rapports/analytics/me', { params: days ? { days } : undefined }),
}

export const rapportApi = {
  getAll: () => api.get('/rapports'),
  getMine: () => api.get('/rapports/my'),
}

export const scormApi = {
  export: (scenarioId: string) =>
    api.get(`/scorm/${scenarioId}/export/scorm`, { responseType: 'blob' }),
  exportPdf: (scenarioId: string) =>
    api.get(`/scorm/${scenarioId}/export/pdf`, { responseType: 'blob' }),
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<UploadedScormPackage>('/scorm/upload', formData)
  },
  getUploaded: (packageId: string) =>
    api.get<UploadedScormPackage>(`/scorm/uploads/${packageId}`),
}

export default api
