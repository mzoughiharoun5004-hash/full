import Cookies from 'js-cookie'
import type { User, UserRole } from '@/types'

const TOKEN_KEY = 'edu_token'
const USER_KEY = 'edu_user'
export const AUTH_CHANGED_EVENT = 'edu-auth-change'

// Only store the minimum needed to render the UI without a network call.
type StoredUser = Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>

const COOKIE_OPTIONS = {
  expires: 1,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
}

function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  }
}

export function setAuth(token: string, user: User) {
  const minimalUser: StoredUser = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  }
  Cookies.set(TOKEN_KEY, token, COOKIE_OPTIONS)
  Cookies.set(USER_KEY, JSON.stringify(minimalUser), COOKIE_OPTIONS)
  notifyAuthChanged()
}

export function setStoredUser(user: User) {
  const minimalUser: StoredUser = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  }
  Cookies.set(USER_KEY, JSON.stringify(minimalUser), COOKIE_OPTIONS)
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

export function clearAuth() {
  Cookies.remove(TOKEN_KEY)
  Cookies.remove(USER_KEY)
  notifyAuthChanged()
}

export function getToken(): string | null {
  return Cookies.get(TOKEN_KEY) ?? null
}

export function getStoredUser(): User | null {
  const raw = Cookies.get(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as User }
  catch { return null }
}

export function isAuthenticated(): boolean {
  return !!getToken()
}
