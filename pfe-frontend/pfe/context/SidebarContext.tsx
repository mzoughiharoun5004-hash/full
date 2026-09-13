'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

interface SidebarContextType {
  sidebarCollapsed: boolean
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  toggleSidebar: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: React.Dispatch<React.SetStateAction<boolean>>
  toggleMobileNav: () => void
  closeMobileNav: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

const STORAGE_KEY = 'dashboard-sidebar'

function getInitialSidebarState(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'collapsed'
  } catch {
    return false
  }
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getInitialSidebarState)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Persist collapsed state to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, sidebarCollapsed ? 'collapsed' : 'expanded')
    } catch {
      // Ignore storage write errors
    }
  }, [sidebarCollapsed])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  const toggleMobileNav = useCallback(() => {
    setMobileNavOpen((prev) => !prev)
  }, [])

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false)
  }, [])

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

  // Global Keyboard Shortcuts (Ctrl+[ or Ctrl+B / Cmd+B for sidebar toggle, Esc for mobile close)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (event.key === 'Escape' && mobileNavOpen) {
        setMobileNavOpen(false)
        return
      }

      if (isInput) return

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === '[' || event.key.toLowerCase() === 'b')
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileNavOpen, toggleSidebar])

  return (
    <SidebarContext.Provider
      value={{
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        mobileNavOpen,
        setMobileNavOpen,
        toggleMobileNav,
        closeMobileNav,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
