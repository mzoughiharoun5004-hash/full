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
  getToken,
  normalizeUser,
  setStoredUser,
} from '@/lib/auth'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  token: string | null
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
  token: string | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const serverAuthSnapshot: AuthSnapshot = {
  user: null,
  token: null,
  isLoading: true,
}

let cachedAuthKey = ''
let cachedAuthSnapshot: AuthSnapshot = {
  user: null,
  token: null,
  isLoading: false,
}

const authListeners = new Set<() => void>()

// Auth state lives in localStorage so non-React code, axios interceptors, and
// other tabs can all notify React through the same external-store subscription.
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
  const storedToken = getToken()
  const storedUser = storedToken ? getStoredUser() : null
  const key = `${storedToken ?? ''}:${storedUser ? JSON.stringify(storedUser) : ''}`

  // useSyncExternalStore expects stable snapshots; reuse the object when the
  // serialized auth state has not changed to avoid extra render loops.
  if (cachedAuthKey === key) return cachedAuthSnapshot

  cachedAuthKey = key
  cachedAuthSnapshot = {
    user: storedUser,
    token: storedToken,
    isLoading: false,
  }
  return cachedAuthSnapshot
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, token, isLoading } = useSyncExternalStore(
    subscribeAuth,
    readClientAuthSnapshot,
    () => serverAuthSnapshot
  )

  const refreshUser = useCallback(async () => {
    const storedToken = getToken()
    if (!storedToken) return

    try {
      const { data } = await authApi.me()
      setStoredUser(data)
    } catch {
      // The axios interceptor clears auth on real 401 responses.
      // Keep the local session for transient refresh failures.
    }
  }, [])

  useEffect(() => {
    if (token) {
      void refreshUser()
    }
  }, [token, refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await authApi.login({ email, password })

      // Normalize backend auth payloads that may return either userInfo/access_token or user/accessToken.
      const rawUser = data.userInfo ?? data.user
      const jwt: string = data.access_token ?? data.accessToken

      if (!rawUser || !jwt) {
        throw new Error('Unable to log in. Please try again.')
      }

      const normUser = normalizeUser(rawUser)
      setAuth(jwt, normUser)
    } catch (error: unknown) {
      throw new Error(
        getApiErrorMessage(error, 'Unable to log in. Please try again.'),
      )
    }
  }, [])

  const register = useCallback(async (formData: RegisterData) => {
    try {
      const response = await authApi.register({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email,
        password: formData.password,
      })

      const data = response.data ?? {}
      const rawUser = data.userInfo ?? data.user
      const jwt: string = data.access_token ?? data.accessToken ?? ''

      if (rawUser && jwt) {
        const normUser = normalizeUser(rawUser)
        setAuth(jwt, normUser)
        return
      }

      await login(formData.email, formData.password)
    } catch (error: unknown) {
      throw new Error(
        getApiErrorMessage(error, 'Unable to create your account. Please try again.'),
      )
    }
  }, [login])

  const logout = useCallback(() => {
    clearAuth()
    window.location.href = '/'
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
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
