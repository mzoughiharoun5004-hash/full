'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Command,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { scenariosApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/context/SidebarContext'
import type { ScenarioNotification } from '@/types'
import { SidebarToggleButton } from './SidebarToggleButton'
import {
  adminNavItems,
  breadcrumbsFor,
  primaryNavItems,
  quickActions,
  routeTitle,
  utilityNavItems,
} from './navConfig'

interface TopbarProps {
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onOpenMobileMenu?: () => void
}

export function Topbar({
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileMenu,
}: TopbarProps) {
  const sidebarContext = useSidebar()
  const isCollapsed = sidebarCollapsed ?? sidebarContext.sidebarCollapsed
  const handleToggleSidebar = onToggleSidebar ?? sidebarContext.toggleSidebar
  const handleOpenMobile = onOpenMobileMenu ?? sidebarContext.toggleMobileNav
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAdmin, logout } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const {
    data: notifications = [],
    isLoading: notificationsLoading,
    refetch: refetchNotifications,
  } = useQuery<ScenarioNotification[]>({
    queryKey: ['scenario-notifications', user?.id],
    queryFn: () => scenariosApi.getNotifications().then((response) => response.data as ScenarioNotification[]),
    enabled: Boolean(user?.id),
    refetchInterval: notificationsOpen ? 30_000 : false,
  })

  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()
  const title = routeTitle(pathname)
  const breadcrumbs = breadcrumbsFor(pathname)
  const searchItems = useMemo(
    () => [
      ...quickActions,
      ...primaryNavItems,
      ...(isAdmin ? adminNavItems : []),
      ...utilityNavItems,
    ],
    [isAdmin],
  )
  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return searchItems
    return searchItems.filter((item) =>
      item.label.toLowerCase().includes(term) || item.description?.toLowerCase().includes(term),
    )
  }, [query, searchItems])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setNotificationsOpen(false)
        setAccountOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const goTo = (href: string) => {
    setSearchOpen(false)
    setQuery('')
    router.push(href)
  }

  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-[var(--lux-line)]/70 bg-[var(--lux-bg)]/80 px-4 backdrop-blur-xl lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={handleOpenMobile}
          className="grid h-9 w-9 place-items-center rounded-xl text-[var(--lux-muted)] transition-colors hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text)] lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>

        <SidebarToggleButton
          direction={isCollapsed ? 'expand' : 'collapse'}
          label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={handleToggleSidebar}
          className="hidden lg:inline-flex"
        />

        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold tracking-tight text-[var(--lux-text-strong)]">{title}</h2>
          <nav className="mt-0.5 hidden items-center gap-1 text-xs font-medium text-[var(--lux-muted-soft)] sm:flex">
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.href}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 && <ChevronRight size={12} className="text-[var(--lux-muted-soft)]" />}
                {index === breadcrumbs.length - 1 ? (
                  <span className="max-w-40 truncate text-[var(--lux-muted)] font-semibold">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="max-w-32 truncate hover:text-[var(--lux-text)] transition-colors">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden h-9.5 w-56 items-center gap-2.5 rounded-xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface-soft)]/60 px-3.5 text-xs text-[var(--lux-muted-soft)] transition-all hover:border-[var(--lux-primary)]/40 hover:bg-[var(--lux-elevated)] hover:text-[var(--lux-text)] md:flex shadow-xs"
        >
          <Search size={14} className="text-[var(--lux-muted-soft)]" />
          <span className="flex-1 truncate text-left font-medium">Search workspace</span>
          <kbd className="rounded-md border border-[var(--lux-line)] bg-[var(--lux-overlay)] px-1.5 py-0.5 font-mono text-[10px] font-bold">
            Ctrl K
          </kbd>
        </button>

        <Link
          href="/dashboard/scenarios/new"
          className="hidden h-9.5 items-center gap-2 rounded-xl bg-[var(--lux-primary)] px-4 text-xs font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all hover:bg-[var(--lux-primary-hover)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] active:scale-[0.98] sm:flex"
        >
          <Plus size={15} />
          New scenario
        </Link>

        <ThemeToggle compact />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen((current) => {
                const nextOpen = !current
                if (nextOpen) void refetchNotifications()
                return nextOpen
              })
              setAccountOpen(false)
            }}
            className="relative flex h-9.5 w-9.5 items-center justify-center rounded-xl text-[var(--lux-muted)] transition-colors hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]"
            aria-label="Notifications"
          >
            <Bell size={17} />
            {notifications.length > 0 && (
              <span className="absolute right-2 top-2 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lux-gold)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--lux-gold)]" />
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface)]/95 p-3.5 shadow-2xl backdrop-blur-xl">
              <div className="mb-2.5 flex items-center justify-between border-b border-[var(--lux-line)]/60 pb-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--lux-text-strong)]">Notifications</p>
                {notifications.length > 0 && (
                  <span className="rounded-full bg-[var(--lux-primary-soft)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--lux-primary-muted)]">
                    {notifications.length}
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto lux-scrollbar">
                {notificationsLoading ? (
                  <p className="px-3 py-6 text-center text-xs font-medium text-[var(--lux-muted-soft)]">Loading notifications...</p>
                ) : notifications.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs font-medium text-[var(--lux-muted-soft)]">No new notifications.</p>
                ) : (
                  notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      href={`/dashboard/scenarios/${notification.scenarioId}/edit?mode=view`}
                      onClick={() => setNotificationsOpen(false)}
                      className="block rounded-xl border border-[var(--lux-line)] bg-[var(--lux-overlay)] p-3 transition-colors hover:bg-[var(--lux-primary-soft)]"
                    >
                      <p className="text-xs font-bold text-[var(--lux-text-strong)]">{notification.message}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--lux-muted-soft)]">{notification.scenarioTitle}</p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setAccountOpen((current) => !current)
              setNotificationsOpen(false)
            }}
            className={cn(
              'flex h-9.5 items-center rounded-xl p-0.5 transition-all hover:bg-[var(--lux-overlay-hover)]',
              accountOpen && 'bg-[var(--lux-primary-soft)] ring-2 ring-[var(--lux-primary)]/40',
            )}
            aria-label="Account menu"
          >
            <Avatar firstName={user?.firstName} lastName={user?.lastName} name={fullName} size="sm" />
          </button>

          {accountOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface)]/95 p-2 shadow-2xl backdrop-blur-xl">
              <div className="border-b border-[var(--lux-line)]/60 px-3 py-3">
                <p className="truncate text-sm font-bold text-[var(--lux-text-strong)]">{fullName || user?.email}</p>
                <p className="truncate text-xs font-medium text-[var(--lux-muted-soft)]">{user?.email}</p>
              </div>
              <Link
                href="/dashboard/settings"
                onClick={() => setAccountOpen(false)}
                className="mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-[var(--lux-muted)] hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-text-strong)] transition-colors"
              >
                <Settings size={15} />
                Settings
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="mx-auto mt-16 max-w-xl overflow-hidden rounded-3xl border border-[var(--lux-line)]/80 bg-[var(--lux-surface)]/95 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center gap-3 border-b border-[var(--lux-line)]/70 px-4.5 py-3.5">
              <Command size={18} className="text-[var(--lux-primary-muted)]" />
              <input
                value={query}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages and actions..."
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--lux-text-strong)] outline-none placeholder:text-[var(--lux-muted-soft)]"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-[var(--lux-muted-soft)] hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-text-strong)]"
                aria-label="Close search"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-2.5 lux-scrollbar">
              {filteredItems.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs font-medium text-[var(--lux-muted-soft)]">No matches found.</p>
              ) : (
                filteredItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => goTo(item.href)}
                      className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all hover:bg-[var(--lux-primary-soft)] group"
                    >
                      <span className="grid h-9.5 w-9.5 flex-shrink-0 place-items-center rounded-xl bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)] group-hover:scale-105 transition-transform">
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--lux-text-strong)]">{item.label}</span>
                        {item.description && (
                          <span className="mt-0.5 block truncate text-xs font-medium text-[var(--lux-muted-soft)]">{item.description}</span>
                        )}
                      </span>
                      {pathname === item.href && <CheckCircle2 size={16} className="text-[var(--lux-primary-muted)]" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
