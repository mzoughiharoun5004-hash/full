'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { translations, type TranslationKey } from '@/lib/translations'

export type Locale = 'en' | 'fr'

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

interface LanguageSnapshot {
  locale: Locale
}

const STORAGE_KEY = 'edu_locale'
const LanguageContext = createContext<LanguageContextValue | null>(null)

const serverSnapshot: LanguageSnapshot = { locale: 'en' }
let clientSnapshot: LanguageSnapshot = { locale: 'en' }
const langListeners = new Set<() => void>()

function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'en' || stored === 'fr' ? stored : null
}

function readLocaleSnapshot(): LanguageSnapshot {
  const locale = readStoredLocale() ?? 'en'
  if (clientSnapshot.locale !== locale) {
    clientSnapshot = { locale }
  }
  return clientSnapshot
}

function notifyLocaleChanged() {
  readLocaleSnapshot()
  langListeners.forEach((listener) => listener())
}

function subscribeLocale(listener: () => void) {
  langListeners.add(listener)
  return () => { langListeners.delete(listener) }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { locale } = useSyncExternalStore(
    subscribeLocale,
    readLocaleSnapshot,
    () => serverSnapshot,
  )

  const setLocale = useCallback((newLocale: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, newLocale)
    notifyLocaleChanged()
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

export function useTranslation() {
  const { locale } = useLanguage()
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let str: string = (translations[locale][key] as string) ?? (translations.en[key] as string) ?? key
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        })
      }
      return str
    },
    [locale],
  )
  return { t, locale }
}
