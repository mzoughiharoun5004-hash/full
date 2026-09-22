import Cookies from 'js-cookie'
import type { User, UserRole } from '@/types'

// The JWT is never held by JavaScript. It lives only in the backend's HttpOnly
// `auth_token` cookie (set by POST /auth/login, cleared by POST /auth/logout),
// so an XSS payload cannot read or exfiltrate the session.
//
// The two cookies below are non-credentials:
//   edu_session — presence flag so proxy.ts can gate /dashboard without a
//                 round trip. Forging it only renders a shell; every API call
//                 is still authorized server-side from the HttpOnly cookie.
//   edu_user    — display data (name, role) for the sidebar/topbar.
const SESSION_KEY = 'edu_session'
const USER_KEY = 'edu_user'
// Written by earlier versions of the app; removed on every auth transition so
// no stale JWT lingers in a JS-readable cookie.
const LEGACY_TOKEN_KEY = 'edu_token'
export const AUTH_CHANGED_EVENT = 'edu-auth-change'

// Only store the minimum needed to render the UI without a network call.
type StoredUser = Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>

const COOKIE_OPTIONS = {
  // Matches the one-day maxAge of the backend auth cookie.
  expires: 1,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
}

function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  }
}

function toStoredUser(user: User): StoredUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  }
}

/**
 * Record a signed-in session. Call this *after* a request that made the
 * backend set the HttpOnly cookie (login), never on its own — the flag alone
 * grants no access.
 */
export function setAuth(user: User) {
  Cookies.remove(LEGACY_TOKEN_KEY)
  Cookies.set(SESSION_KEY, '1', COOKIE_OPTIONS)
  Cookies.set(USER_KEY, JSON.stringify(toStoredUser(user)), COOKIE_OPTIONS)
  notifyAuthChanged()
}

export function setStoredUser(user: User) {
  Cookies.set(USER_KEY, JSON.stringify(toStoredUser(user)), COOKIE_OPTIONS)
  notifyAuthChanged()
}


export function normalizeUser(raw: {
  id: string | number
  email: string
  role?: string | { name?: string }
  firstName?: string
  lastName?: string
  name?: string
  createdAt?: string
  dateInscription?: string
  updatedAt?: string
  lastLoginAt?: string | null
  previousLoginAt?: string | null
}): User {
  let role: UserRole = 'EDUCATOR'

  if (raw.role) {
    const roleName = typeof raw.role === 'object' ? raw.role.name : raw.role
    const normalizedRole = roleName?.toUpperCase()
    if (normalizedRole === 'ADMIN') {
      role = 'ADMIN'
    }
    if (normalizedRole === 'EDUCATOR' || normalizedRole === 'TEACHER') {
      role = 'EDUCATOR'
    }
  }

  const nameParts = raw.name?.trim().split(/\s+/) ?? []
  const firstName = raw.firstName ?? nameParts[0] ?? ''
  const lastName = raw.lastName ?? nameParts.slice(1).join(' ')

  return {
    id: String(raw.id),
    firstName,
    lastName,
    email: raw.email,
    name: raw.name,
    role,
    createdAt: raw.createdAt ?? raw.dateInscription ?? new Date().toISOString(),
    updatedAt: raw.updatedAt,
    lastLoginAt: raw.lastLoginAt,
    previousLoginAt: raw.previousLoginAt,
  }
}

/**
 * Drop the client-side session. The HttpOnly cookie can only be expired by the
 * backend, so callers that are logging out must also hit POST /auth/logout.
 */
export function clearAuth() {
  Cookies.remove(SESSION_KEY)
  Cookies.remove(USER_KEY)
  Cookies.remove(LEGACY_TOKEN_KEY)
  notifyAuthChanged()
}

export function hasSession(): boolean {
  return Cookies.get(SESSION_KEY) === '1'
}

export function getStoredUser(): User | null {
  const raw = Cookies.get(USER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as User & { role?: unknown }
    // Coerce legacy object-form roles, e.g. { name: 'EDUCATOR' }, stored by older code.
    // IMPORTANT: must NOT call normalizeUser here — that function sets
    // createdAt: new Date().toISOString() when the field is absent, producing a
    // different value on every call and breaking useSyncExternalStore's snapshot cache.
    if (parsed.role && typeof parsed.role === 'object') {
      const roleName = (parsed.role as { name?: string }).name?.toUpperCase()
      parsed.role = roleName === 'ADMIN' ? 'ADMIN' : 'EDUCATOR'
    } else if (typeof parsed.role === 'string') {
      const up = parsed.role.toUpperCase()
      parsed.role = up === 'ADMIN' ? 'ADMIN' : 'EDUCATOR'
    }
    // Coerce numeric id (backend sends number, schema expects string)
    if (typeof parsed.id !== 'string') parsed.id = String(parsed.id)
    return parsed as User
  }
  catch { return null }
}

export function isAuthenticated(): boolean {
  return hasSession()
}
