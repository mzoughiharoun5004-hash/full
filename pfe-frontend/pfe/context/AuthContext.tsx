'use client'

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { authApi, getApiErrorMessage } from '@/lib/api'
import {
  AUTH_CHANGED_EVENT,
  setAuth,
  clearAuth,
  getStoredUser,
  hasSession,
  normalizeUser,
  setStoredUser,
} from '@/lib/auth'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  /** True once login succeeded. The JWT itself is in an HttpOnly cookie. */
  hasSession: boolean
  isLoading: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  refreshUser: () => Promise<void>
  logout: () => void
}

interface RegisterData {
  firstName: string
  lastName: string
  email: string
  password: string
}

interface AuthSnapshot {
  user: User | null
  hasSession: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const serverAuthSnapshot: AuthSnapshot = {
  user: null,
  hasSession: false,
  isLoading: true,
}

let cachedAuthKey = ''
let cachedAuthSnapshot: AuthSnapshot = {
  user: null,
  hasSession: false,
  isLoading: false,
}

const authListeners = new Set<() => void>()

// Auth state lives in cookies so non-React code, axios interceptors, and other
// tabs can all notify React through the same external-store subscription.
function subscribeAuth(listener: () => void) {
  authListeners.add(listener)
  if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_CHANGED_EVENT, listener)
  }

  return () => {
    authListeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener(AUTH_CHANGED_EVENT, listener)
    }
  }
}

function readClientAuthSnapshot(): AuthSnapshot {
  const sessionActive = hasSession()
  const storedUser = sessionActive ? getStoredUser() : null
  const key = `${sessionActive ? '1' : '0'}:${storedUser ? JSON.stringify(storedUser) : ''}`

  // useSyncExternalStore expects stable snapshots; reuse the object when the
  // serialized auth state has not changed to avoid extra render loops.
  if (cachedAuthKey === key) return cachedAuthSnapshot

  cachedAuthKey = key
  cachedAuthSnapshot = {
    user: storedUser,
    hasSession: sessionActive,
    isLoading: false,
  }
  return cachedAuthSnapshot
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, hasSession: sessionActive, isLoading } = useSyncExternalStore(
    subscribeAuth,
    readClientAuthSnapshot,
    () => serverAuthSnapshot
  )

  const refreshUser = useCallback(async () => {
    if (!hasSession()) return

    try {
      const { data } = await authApi.me()
      setStoredUser(normalizeUser(data))
    } catch {
      // The axios interceptor clears auth on real 401 responses.
      // Keep the local session for transient refresh failures.
    }
  }, [])

  useEffect(() => {
    if (sessionActive) {
      void refreshUser()
    }
  }, [sessionActive, refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await authApi.login({ email, password })

      // The response also carries access_token, which is deliberately ignored:
      // the same request set the HttpOnly `auth_token` cookie, and that is the
      // only copy of the JWT the browser keeps.
      const rawUser = data.userInfo ?? data.user

      if (!rawUser) {
        throw new Error('Unable to log in. Please try again.')
      }

      setAuth(normalizeUser(rawUser))
    } catch (error: unknown) {
      throw new Error(
        getApiErrorMessage(error, 'Unable to log in. Please try again.'),
      )
    }
  }, [])

  const register = useCallback(async (formData: RegisterData) => {
    try {
      await authApi.register({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email,
        password: formData.password,
      })

      // POST /users creates the account but sets no auth cookie, so the
      // session has to come from a real login round trip.
      await login(formData.email, formData.password)
    } catch (error: unknown) {
      throw new Error(
        getApiErrorMessage(error, 'Unable to create your account. Please try again.'),
      )
    }
  }, [login])

  const logout = useCallback(() => {
    // Clear the local cookies first so the UI never lingers in a signed-in
    // state, then ask the backend to expire the HttpOnly cookie. A failed
    // call must not trap the user in the session, so the redirect always runs.
    clearAuth()
    void authApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        window.location.href = '/'
      })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        hasSession: sessionActive,
        isLoading,
        isAdmin: user?.role === 'ADMIN',
        login,
        register,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
