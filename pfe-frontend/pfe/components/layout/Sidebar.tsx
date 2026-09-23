'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  ChevronRight,
  LogOut,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/context/LanguageContext'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { SidebarToggleButton } from './SidebarToggleButton'
import {
  adminNavItems,
  isNavItemActive,
  primaryNavItems,
  quickActions,
  utilityNavItems,
  type DashboardNavItem,
} from './navConfig'
import type { TranslationKey } from '@/lib/translations'

interface SidebarProps {
  collapsed: boolean
  mobile?: boolean
  onCloseMobile?: () => void
  onToggleCollapsed?: () => void
}

interface NavLinkProps extends DashboardNavItem {
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}

function NavLink({
  href,
  labelKey,
  label,
  icon: Icon,
  descriptionKey,
  description,
  active,
  collapsed,
  onNavigate,
}: NavLinkProps) {
  const { t } = useTranslation()
  const displayLabel = t(labelKey) || label
  const displayDesc = descriptionKey ? t(descriptionKey) : description

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={displayLabel}
      className={cn(
        'group relative flex items-center rounded-xl text-sm font-semibold transition-all duration-200 select-none',
        collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
        active
          ? 'bg-[var(--lux-primary-soft)] text-[var(--lux-text-strong)] shadow-xs before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-[var(--lux-primary)] before:shadow-[0_0_8px_rgba(16,185,129,0.8)]'
          : 'text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]',
      )}
    >
      <Icon size={18} className={cn('flex-shrink-0 transition-transform duration-200 group-hover:scale-110', active ? 'text-[var(--lux-primary-muted)]' : '')} />

      <span
        className={cn(
          'transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden',
          collapsed ? 'max-w-0 opacity-0 w-0' : 'max-w-xs opacity-100 flex-1 min-w-0 truncate',
        )}
      >
        {displayLabel}
      </span>

      {!collapsed && active && (
        <ChevronRight size={14} className="flex-shrink-0 text-[var(--lux-primary-muted)]" />
      )}

      {collapsed && (
        <div className="pointer-events-none fixed left-[80px] z-[60] hidden group-hover:flex group-focus-visible:flex items-center animate-in fade-in zoom-in-95 duration-150">
          <div className="whitespace-nowrap rounded-xl border border-[var(--lux-line-strong)] bg-[var(--lux-surface)]/95 backdrop-blur-xl px-3.5 py-2 text-xs shadow-2xl">
            <p className="font-extrabold text-[var(--lux-text-strong)]">{displayLabel}</p>
            {displayDesc && (
              <p className="mt-0.5 text-[11px] font-medium text-[var(--lux-muted-soft)]">{displayDesc}</p>
            )}
          </div>
        </div>
      )}
    </Link>
  )
}

function NavSection({
  labelKey,
  label,
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  labelKey?: TranslationKey
  label?: string
  items: DashboardNavItem[]
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  const displayLabel = labelKey ? t(labelKey) : label

  return (
    <div className="space-y-1">
      {displayLabel && (
        <p
          className={cn(
            'px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--lux-muted-soft)] transition-all duration-200 overflow-hidden whitespace-nowrap',
            collapsed ? 'max-h-0 py-0 opacity-0' : 'max-h-8 opacity-100',
          )}
        >
          {displayLabel}
        </p>
      )}
      {items.map((item) => (
        <NavLink
          key={item.href}
          {...item}
          active={isNavItemActive(pathname, item)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function BrandMark({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  return (
    <Link
      href="/"
      className={cn(
        'group relative flex items-center rounded-xl transition-colors hover:bg-[var(--lux-overlay-hover)]',
        collapsed ? 'justify-center p-1.5' : 'gap-2.5 px-2 py-1.5 min-w-0 flex-1',
      )}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--lux-primary)] text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
        <BookOpen size={17} />
      </div>
      <div
        className={cn(
          'transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden',
          collapsed ? 'max-w-0 opacity-0 w-0' : 'max-w-xs opacity-100 min-w-0 flex-1',
        )}
      >
        <p className="truncate text-sm font-extrabold tracking-tight text-[var(--lux-text-strong)]">SupScenario</p>
        <p className="truncate text-[11px] font-medium text-[var(--lux-muted-soft)]">{t('nav_course_authoring')}</p>
      </div>

      {collapsed && (
        <div className="pointer-events-none fixed left-[80px] z-[60] hidden group-hover:flex items-center animate-in fade-in zoom-in-95 duration-150">
          <div className="whitespace-nowrap rounded-xl border border-[var(--lux-line-strong)] bg-[var(--lux-surface)]/95 backdrop-blur-xl px-3 py-1.5 text-xs shadow-2xl">
            <p className="font-extrabold text-[var(--lux-text-strong)]">SupScenario</p>
            <p className="text-[11px] font-medium text-[var(--lux-muted-soft)]">{t('nav_course_authoring_platform')}</p>
          </div>
        </div>
      )}
    </Link>
  )
}

function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: LucideIcon
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-xl text-[var(--lux-muted-soft)] transition-colors hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]"
    >
      <Icon size={17} />
    </button>
  )
}

export function Sidebar({
  collapsed,
  mobile = false,
  onCloseMobile,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname()
  const { user, isAdmin, logout } = useAuth()
  const { t } = useTranslation()
  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()
  const isCollapsedMode = collapsed && !mobile
  const widthClass = isCollapsedMode ? 'w-[72px]' : 'w-60'

  const handleNavigate = mobile ? onCloseMobile : undefined

  return (
    <aside
      className={cn(
        'relative z-40 flex h-screen max-h-screen flex-shrink-0 flex-col border-r border-[var(--lux-line)] bg-[var(--lux-bg-alt)] transition-[width] duration-300 ease-in-out select-none',
        widthClass,
      )}
    >
      <div className={cn(
        'flex h-[60px] items-center border-b border-[var(--lux-line)] px-3 transition-all duration-200',
        isCollapsedMode ? 'justify-center gap-1' : 'justify-between gap-2',
      )}>
        <BrandMark collapsed={isCollapsedMode} />

        {mobile ? (
          <IconButton label={t('nav_close')} icon={X} onClick={onCloseMobile} />
        ) : (
          <SidebarToggleButton
            direction={isCollapsedMode ? 'expand' : 'collapse'}
            label={isCollapsedMode ? t('nav_expand') : t('nav_collapse')}
            shortcut="Ctrl+["
            onClick={onToggleCollapsed}
            className="flex-shrink-0"
          />
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3 lux-scrollbar">
        <div className="space-y-3">
          <NavSection
            items={quickActions}
            pathname={pathname}
            collapsed={isCollapsedMode}
            onNavigate={handleNavigate}
          />

          <div className="h-px bg-[var(--lux-line)] my-1" />

          <NavSection
            labelKey="nav_workspace"
            items={primaryNavItems}
            pathname={pathname}
            collapsed={isCollapsedMode}
            onNavigate={handleNavigate}
          />

          {isAdmin && (
            <>
              <div className="h-px bg-[var(--lux-line)] my-1" />
              <NavSection
                labelKey="nav_admin"
                items={adminNavItems}
                pathname={pathname}
                collapsed={isCollapsedMode}
                onNavigate={handleNavigate}
              />
            </>
          )}

          <div className="h-px bg-[var(--lux-line)] my-1" />

          <NavSection
            items={utilityNavItems}
            pathname={pathname}
            collapsed={isCollapsedMode}
            onNavigate={handleNavigate}
          />
        </div>
      </nav>

      <div className="border-t border-[var(--lux-line)] px-3 py-3">
        <div
          className={cn(
            'group relative flex items-center rounded-xl transition-colors',
            isCollapsedMode ? 'justify-center p-1.5 hover:bg-[var(--lux-overlay-hover)] cursor-pointer' : 'gap-3 px-2 py-2',
          )}
        >
          <Avatar firstName={user?.firstName} lastName={user?.lastName} name={fullName} size="sm" />

          <div
            className={cn(
              'transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden flex items-center gap-2 min-w-0 flex-1',
              isCollapsedMode ? 'max-w-0 opacity-0 w-0' : 'max-w-xs opacity-100',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--lux-text-strong)]">{fullName || user?.email}</p>
              <p className="truncate text-xs capitalize text-[var(--lux-muted-soft)]">{user?.role?.toLowerCase() ?? 'user'}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="grid h-8 w-8 place-items-center rounded-xl text-[var(--lux-muted-soft)] transition-colors hover:bg-red-500/12 hover:text-red-400"
              title={t('nav_sign_out')}
              aria-label={t('nav_sign_out')}
            >
              <LogOut size={16} />
            </button>
          </div>

          {isCollapsedMode && (
            <div className="pointer-events-none fixed left-[80px] bottom-3 z-[60] hidden group-hover:flex group-focus-visible:flex items-center animate-in fade-in zoom-in-95 duration-150">
              <div className="pointer-events-auto w-56 rounded-2xl border border-[var(--lux-line-strong)] bg-[var(--lux-surface)]/95 backdrop-blur-xl p-3.5 shadow-2xl">
                <div className="border-b border-[var(--lux-line)]/70 pb-2.5 mb-2.5">
                  <p className="truncate text-sm font-bold text-[var(--lux-text-strong)]">{fullName || user?.email}</p>
                  <p className="truncate text-xs font-medium text-[var(--lux-muted-soft)]">{user?.email}</p>
                  <span className="mt-2 inline-block rounded-md bg-[var(--lux-primary-soft)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--lux-primary-muted)] border border-[var(--lux-primary)]/20">
                    {user?.role?.toLowerCase() ?? 'user'}
                  </span>
                </div>
                <div className="space-y-1">
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-[var(--lux-muted)] hover:bg-[var(--lux-primary-soft)] hover:text-[var(--lux-text-strong)] transition-colors"
                  >
                    <Settings size={14} />
                    {t('nav_settings')}
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-red-400 hover:bg-red-500/12 transition-colors"
                  >
                    <LogOut size={14} />
                    {t('nav_sign_out')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
