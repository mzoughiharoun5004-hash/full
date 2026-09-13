'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

export type ThemeName = 'dark' | 'light'

interface ThemeContextValue {
  themeName: ThemeName
  setTheme: (theme: ThemeName) => void
  resetToSystemTheme: () => void
  toggleTheme: () => void
}

interface ThemeSnapshot {
  themeName: ThemeName
}

const STORAGE_KEY = 'edu_theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

const serverSnapshot: ThemeSnapshot = { themeName: 'dark' }
let clientSnapshot: ThemeSnapshot = { themeName: 'dark' }
let mediaQuery: MediaQueryList | null = null
const listeners = new Set<() => void>()

function getSystemTheme(): ThemeName {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(): ThemeName | null {
  if (typeof window === 'undefined') return null

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'dark' || stored === 'light' ? stored : null
}

function applyTheme(theme: ThemeName | null) {
  if (typeof document === 'undefined') return

  if (theme) {
    document.documentElement.dataset.theme = theme
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

function readThemeSnapshot(): ThemeSnapshot {
  const themeName = readStoredTheme() ?? getSystemTheme()

  if (clientSnapshot.themeName !== themeName) {
    clientSnapshot = { themeName }
  }

  return clientSnapshot
}

function notifyThemeChanged() {
  readThemeSnapshot()
  listeners.forEach((listener) => listener())
}

function subscribeTheme(listener: () => void) {
  listeners.add(listener)
  applyTheme(readStoredTheme())

  if (!mediaQuery) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', notifyThemeChanged)
  }

  return () => {
    listeners.delete(listener)

    if (!listeners.size && mediaQuery) {
      mediaQuery.removeEventListener('change', notifyThemeChanged)
      mediaQuery = null
    }
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeName } = useSyncExternalStore(
    subscribeTheme,
    readThemeSnapshot,
    () => serverSnapshot
  )

  const setTheme = useCallback((theme: ThemeName) => {
    window.localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    notifyThemeChanged()
  }, [])

  const resetToSystemTheme = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY)
    applyTheme(null)
    notifyThemeChanged()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(themeName === 'dark' ? 'light' : 'dark')
  }, [setTheme, themeName])

  const value = useMemo(
    () => ({ themeName, setTheme, resetToSystemTheme, toggleTheme }),
    [resetToSystemTheme, setTheme, themeName, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
