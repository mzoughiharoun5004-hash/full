import axios, { type AxiosResponse } from 'axios'
import { clearAuth, normalizeUser } from '@/lib/auth'
import type {
  AiCourseBrief,
  AiCourseOutline,
  CourseDocument,
  MediaAsset,
  Scenario,
  ScenarioDocument,
  ScenarioStatus,
  UploadedScormPackage,
} from '@/types'
import {
  parseAiChangeSet,
  parseAiCourseOutline,
  parseCourseDocument,
  parseMediaAsset,
  parseMediaList,
  parseQuiz,
  parseScenario,
  parseScenarioComment,
  parseScenarioShare,
  parseUser,
  parsePaginatedScenarios,
} from '@/lib/schemas'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // The session travels as the HttpOnly `auth_token` cookie the backend sets
  // on login. No Authorization header is attached: JS never holds the JWT.
  withCredentials: true,
})

api.interceptors.request.use((config) => {
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

/**
 * Best human-readable message for a failed request: the backend's `message`
 * (a string, or an array of validation messages), then the message of a plain
 * Error thrown by our own code, then `fallback`.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data
    const message = data && typeof data === 'object' ? (data as { message?: unknown }).message : undefined

    if (Array.isArray(message)) {
      const joined = message
        .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        .join(', ')
      if (joined) return joined
    } else if (typeof message === 'string' && message.trim()) {
      return message
    }
    return fallback
  }

  if (error instanceof Error && error.message) return error.message
  return fallback
}

/**
 * Runs a Zod parser over a response purely as a check. `response.data` is
 * returned untouched, so callers keep receiving exactly what the backend sent;
 * a mismatch only logs a dev warning (see createSchemaParser in schemas.ts).
 */
function checked<R extends AxiosResponse>(response: R, parse: (data: unknown) => unknown): R {
  parse(response.data)
  return response
}

/**
 * Like `checked`, but for endpoints where the backend payload genuinely isn't
 * shaped like what callers need (media resources use lowercase `type`s and
 * different field names). `transform`'s result actually replaces
 * `response.data`, so callers get the translated value instead of the raw
 * backend payload. `transform` itself still falls back to the raw input on a
 * schema mismatch (see createSchemaParser), so this is never any less safe
 * than `checked`.
 */
function transformed<R extends AxiosResponse, T>(response: R, transform: (data: unknown) => T): Omit<R, 'data'> & { data: T } {
  return { ...response, data: transform(response.data) }
}

/**
 * GET /users and the single-user write endpoints below return raw TypeORM
 * entities: `role` is the full `{ id, name }` Role relation (lowercase
 * name, e.g. 'admin' / 'teacher'), and the creation timestamp is
 * `dateInscription`, not `createdAt`. normalizeUser already translates both
 * correctly — it's the same helper the login/"me" flow relies on — so route
 * these responses through it instead of leaking the raw shape into the
 * Users page. That leak was the actual cause of the page being broken:
 * `user.role === 'ADMIN'` never matched an object, and
 * `<StatusBadge status={user.role} />` was handed an object where it needs
 * a string (React throws rendering an object as a child).
 */
function normalizeUserResponse(data: unknown) {
  return normalizeUser(data as Parameters<typeof normalizeUser>[0])
}
function normalizeUsersResponse(data: unknown) {
  return Array.isArray(data) ? data.map(normalizeUserResponse) : []
}

export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then((response) => {
      const rawUser = response.data?.userInfo ?? response.data?.user
      if (rawUser) parseUser(rawUser)
      return response
    }),
  register: (data: {
    firstName: string
    lastName: string
    email: string
    password: string
  }) => api.post('/users', data).then((response) => checked(response, parseUser)),
  me: () => api.get('/users/me').then((response) => checked(response, parseUser)),
  // Clears the HttpOnly cookie; local cookies are cleared separately by clearAuth().
  logout: () => api.post('/auth/logout'),
}

export const usersApi = {
  getAll: () => api.get('/users').then((response) => transformed(response, normalizeUsersResponse)),
  search: (query: string) => api.get('/users/search', { params: { q: query } }),
  create: (data: {
    firstName: string
    lastName: string
    email: string
    password: string
    role: string
  }) => api.post('/users/managed', data).then((response) => transformed(response, normalizeUserResponse)),
  getMe: () => api.get('/users/me').then((response) => checked(response, parseUser)),
  updateMe: (data: Partial<{ firstName: string; lastName: string; email: string; password?: string }>) =>
    api.put('/users/me', data).then((response) => checked(response, parseUser)),
  update: (id: string, data: Partial<{
    firstName: string
    lastName: string
    email: string
    password: string
    role: string
  }>) => api.put(`/users/${id}`, data).then((response) => transformed(response, normalizeUserResponse)),
  updateRole: (id: string, role: string) =>
    api.put(`/users/${id}/role`, { role: role.toLowerCase() }).then((response) => transformed(response, normalizeUserResponse)),
  delete: (id: string) => api.delete(`/users/${id}`),
}

/**
 * Shape of the paginated list endpoints (`/scenarios`, `/scenarios/my`).
 * Mirrors `PaginatedScenariosSchema` in `lib/schemas.ts`; declared here so
 * callers (and React Query cache writes) can type the payload without
 * importing Zod.
 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export type PaginatedScenarios = Paginated<Scenario>
export type PaginatedMedia = Paginated<MediaAsset>

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
    ? params.statuses.map((status) => {
        // Convert frontend status to backend format
        const statusMap: Record<ScenarioStatus, string> = {
          BROUILLON: 'brouillon',
          EN_COURS_VALIDATION: 'en_cours_validation',
          APPROUVE: 'approuve',
          EXPORTE: 'exporte',
          ARCHIVE: 'archive',
        }
        return statusMap[status]
      }).join(',')
    : params?.status
      ? {
          BROUILLON: 'brouillon',
          EN_COURS_VALIDATION: 'en_cours_validation',
          APPROUVE: 'approuve',
          EXPORTE: 'exporte',
          ARCHIVE: 'archive',
        }[params.status]
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
    }).then((response) => checked(response, parsePaginatedScenarios)),
  /** Returns `{ items, total, page, limit }` — pass `page`/`limit` to paginate server-side. */
  getAllAdmin: (params?: ScenarioListParams) =>
    api.get('/scenarios', {
      params: scenarioListRequestParams(params),
    }).then((response) => checked(response, parsePaginatedScenarios)),
  getNotifications: () => api.get('/scenarios/notifications'),
  getOne: (id: string) => api.get(`/scenarios/${id}`).then((response) => checked(response, parseScenario)),
  create: (data: { title?: string; titre?: string; description?: string; objectif?: string; niveau?: string; dureeScenario?: number; template?: string; isPublic?: boolean; courseDocument?: CourseDocument; scenarioDocument?: ScenarioDocument }) =>
    api.post('/scenarios', data).then((response) => checked(response, parseScenario)),
  update: (id: string, data: object) =>
    api.put(`/scenarios/${id}`, data).then((response) => checked(response, parseScenario)),
  getCourseDocument: (id: string) =>
    api.get(`/scenarios/${id}/course-document`).then((response) => checked(response, parseCourseDocument)),
  updateCourseDocument: (id: string, courseDocument: CourseDocument, expectedVersion?: number) =>
    api.put(`/scenarios/${id}/course-document`, { courseDocument, expectedVersion })
      .then((response) => checked(response, parseCourseDocument)),

  submit:   (id: string) => api.patch(`/scenarios/${id}/submit`),
  approve:  (id: string) => api.patch(`/scenarios/${id}/approve`),
  reject:   (id: string, data?: { comment?: string }) => api.patch(`/scenarios/${id}/reject`, data),
  markExported: (id: string) => api.patch(`/scenarios/${id}/export`),
  archive:  (id: string) => api.patch(`/scenarios/${id}/archive`),
  duplicate:(id: string) => api.post(`/scenarios/${id}/duplicate`),
  delete:   (id: string) => api.delete(`/scenarios/${id}`),

  getShares: (id: string) => api.get(`/scenario-shares/scenario/${id}`),
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
    }).then((response) => checked(response, parseScenarioShare)),
  revokeShare: (_id: string, shareId: string) =>
    api.delete(`/scenario-shares/${shareId}`),
  getComments: (id: string) => api.get(`/scenario-shares/scenario/${id}/comments`),
  createComment: (id: string, data: { targetType: string; targetId?: string; body: string; mentions?: string[] }) =>
    api.post(`/scenario-shares/scenario/${id}/comments`, {
      targetType: data.targetType,
      targetId: data.targetId,
      body: data.body,
      mentions: data.mentions?.map(Number),
    }).then((response) => checked(response, parseScenarioComment)),
  updateComment: (commentId: string, data: { body?: string; mentions?: string[] }) =>
    api.put(`/scenario-shares/comments/${commentId}`, {
      body: data.body?.trim(),
      mentions: data.mentions?.map(Number),
    }).then((response) => checked(response, parseScenarioComment)),
  resolveComment: (_id: string, commentId: string) =>
    api.patch(`/scenario-shares/comments/${commentId}/resolve`)
      .then((response) => checked(response, parseScenarioComment)),
}

export const aiCoursesApi = {
  createOutline: (brief: AiCourseBrief) =>
    api.post('/ai/courses/outline', brief).then((response) => checked(response, parseAiCourseOutline)),
  create: (brief: AiCourseBrief, outline?: AiCourseOutline) =>
    api.post('/ai/courses', { ...brief, outline }).then((response) => checked(response, parseScenario)),
  proposeEdit: (
    scenarioId: string,
    payload: {
      instruction: string
      scope: { type: 'course' } | { type: 'lesson'; lessonId: string } | { type: 'block'; lessonId: string; blockId: string }
      courseDocument: CourseDocument
      expectedVersion: number
    },
  ) => api.post(`/ai/courses/${scenarioId}/changes`, payload).then((response) => checked(response, parseAiChangeSet)),
  apply: (changeSetId: string) =>
    api.post(`/ai/courses/changes/${changeSetId}/apply`).then((response) => checked(response, parseCourseDocument)),
  reject: (changeSetId: string) => api.post(`/ai/courses/changes/${changeSetId}/reject`),
}

export const mediaApi = {
  getAll: (params?: { type?: string; search?: string; page?: number; limit?: number }) =>
    api.get('/ressources', { params }).then((response) => transformed(response, parseMediaList)),
  getByScenario: (
    scenarioId: number,
    params?: { type?: string; search?: string; page?: number; limit?: number },
  ) =>
    api
      .get('/ressources', { params: { scenarioId, ...params } })
      .then((response) => transformed(response, parseMediaList)),
  upload: async (fileOrFormData: File | FormData, scenarioId?: number) => {
    const file = fileOrFormData instanceof FormData
      ? fileOrFormData.get('file')
      : fileOrFormData

    if (!(file instanceof File)) {
      throw new Error('No file selected')
    }

    const resource = await api.post('/ressources', {
      titre: file.name,
      type: 'mass', // Default to image type, backend will determine actual type
      taille: file.size,
      ...(scenarioId ? { scenarioId } : {}),
    })

    const resourceId = resource.data?.id
    const formData = new FormData()
    formData.append('file', file)

    return api
      .post(`/media/upload/ressource/${resourceId}`, formData)
      .then((response) => transformed(response, parseMediaAsset))
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
    api.get(`/quiz/activite/${activityId}`).then((response) => checked(response, parseQuiz)),
  create: (activityId: string, data: object) =>
    api.post('/quiz', data).then((response) => checked(response, parseQuiz)),
  update: (quizId: string, data: object) =>
    api.put(`/quiz/${quizId}`, data).then((response) => checked(response, parseQuiz)),
  delete: (quizId: string) => api.delete(`/quiz/${quizId}`),
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
