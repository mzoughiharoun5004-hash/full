import {
  BookOpen,
  Film,
  LayoutDashboard,
  PlusCircle,
  PackageOpen,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { TranslationKey } from '@/lib/translations'

export interface DashboardNavItem {
  href: string
  label: string        // English fallback
  labelKey: TranslationKey
  icon: LucideIcon
  exact?: boolean
  adminOnly?: boolean
  description?: string
  descriptionKey?: TranslationKey
}

export const primaryNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Overview', labelKey: 'nav_overview', icon: LayoutDashboard, exact: true, description: 'Dashboard summary', descriptionKey: 'nav_overview_desc' },
  { href: '/dashboard/scenarios', label: 'Scenarios', labelKey: 'nav_scenarios', icon: Film, description: 'Create and edit courses', descriptionKey: 'nav_scenarios_desc' },
  { href: '/dashboard/media', label: 'Media Library', labelKey: 'nav_media', icon: BookOpen, description: 'Manage uploaded assets', descriptionKey: 'nav_media_desc' },
  { href: '/dashboard/scorm-viewer', label: 'SCORM Viewer', labelKey: 'nav_scorm', icon: PackageOpen, description: 'Upload and preview SCORM zips', descriptionKey: 'nav_scorm_desc' },
]

export const adminNavItems: DashboardNavItem[] = [
  { href: '/dashboard/users', label: 'Users', labelKey: 'nav_users', icon: Users, adminOnly: true, description: 'Manage platform users', descriptionKey: 'nav_users_desc' },
]

export const utilityNavItems: DashboardNavItem[] = [
  { href: '/dashboard/settings', label: 'Settings', labelKey: 'nav_settings', icon: Settings, description: 'Account and platform settings', descriptionKey: 'nav_settings_desc' },
]

export const quickActions: DashboardNavItem[] = [
  { href: '/dashboard/scenarios/new', label: 'New Scenario', labelKey: 'nav_new_scenario', icon: PlusCircle, description: 'Start a blank course', descriptionKey: 'nav_new_scenario_desc' },
]

const navigableItems = [
  ...quickActions,
  ...primaryNavItems,
  ...adminNavItems,
  ...utilityNavItems,
]

export function isNavItemActive(pathname: string, item: Pick<DashboardNavItem, 'href' | 'exact'>) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function activeRouteItem(pathname: string) {
  const exact = navigableItems.find((item) => pathname === item.href)
  if (exact) return exact

  return navigableItems
    .filter((item) => !item.exact && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

export function routeTitle(pathname: string) {
  if (pathname.includes('/scenarios/') && pathname.includes('/edit')) return 'Scenario Editor'
  if (pathname === '/dashboard/scenarios/new') return 'New Scenario'
  const activeItem = activeRouteItem(pathname)
  return activeItem?.label ?? 'Overview'
}

export function routeTitleKey(pathname: string): TranslationKey {
  if (pathname.includes('/scenarios/') && pathname.includes('/edit')) return 'nav_scenarios'
  if (pathname === '/dashboard/scenarios/new') return 'nav_new_scenario'
  const activeItem = activeRouteItem(pathname)
  return activeItem?.labelKey ?? 'nav_overview'
}

export function breadcrumbsFor(pathname: string) {
  const crumbs = [{ label: 'Dashboard', href: '/dashboard', labelKey: 'nav_overview' as TranslationKey }]
  if (pathname === '/dashboard') return crumbs

  const section = [...primaryNavItems, ...adminNavItems, ...utilityNavItems]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]

  if (section) crumbs.push({ label: section.label, href: section.href, labelKey: section.labelKey })
  if (
    pathname.startsWith('/dashboard/scenarios/') &&
    pathname !== '/dashboard/scenarios/new' &&
    !pathname.includes('/edit')
  )
    crumbs.push({ label: 'Details', href: pathname, labelKey: 'nav_scenarios' as TranslationKey })
  if (pathname === '/dashboard/scenarios/new') crumbs.push({ label: 'New Scenario', href: pathname, labelKey: 'nav_new_scenario' as TranslationKey })
  if (pathname.includes('/scenarios/') && pathname.includes('/edit')) crumbs.push({ label: 'Editor', href: pathname, labelKey: 'nav_scenarios' as TranslationKey })

  return crumbs
}
