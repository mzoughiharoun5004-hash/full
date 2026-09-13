import {
  BarChart3,
  BookOpen,
  Film,
  LayoutDashboard,
  PlusCircle,
  PackageOpen,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface DashboardNavItem {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  adminOnly?: boolean
  description?: string
}

export const primaryNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true, description: 'Dashboard summary' },
  { href: '/dashboard/scenarios', label: 'Scenarios', icon: Film, description: 'Create and edit courses' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, description: 'Review course performance' },
  { href: '/dashboard/media', label: 'Media Library', icon: BookOpen, description: 'Manage uploaded assets' },
  { href: '/dashboard/scorm-viewer', label: 'SCORM Viewer', icon: PackageOpen, description: 'Upload and preview SCORM zips' },
]

export const adminNavItems: DashboardNavItem[] = [
  { href: '/dashboard/users', label: 'Users', icon: Users, adminOnly: true, description: 'Manage platform users' },
]

export const utilityNavItems: DashboardNavItem[] = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, description: 'Account and platform settings' },
]

export const quickActions: DashboardNavItem[] = [
  { href: '/dashboard/scenarios/new', label: 'New Scenario', icon: PlusCircle, description: 'Start a blank course' },
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

export function breadcrumbsFor(pathname: string) {
  const crumbs = [{ label: 'Dashboard', href: '/dashboard' }]
  if (pathname === '/dashboard') return crumbs

  const section = [...primaryNavItems, ...adminNavItems, ...utilityNavItems]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]

  if (section) crumbs.push({ label: section.label, href: section.href })
  if (
    pathname.startsWith('/dashboard/scenarios/') &&
    pathname !== '/dashboard/scenarios/new' &&
    !pathname.includes('/edit')
  )
    crumbs.push({ label: 'Details', href: pathname })
  if (pathname === '/dashboard/scenarios/new') crumbs.push({ label: 'New Scenario', href: pathname })
  if (pathname.includes('/scenarios/') && pathname.includes('/edit')) crumbs.push({ label: 'Editor', href: pathname })

  return crumbs
}
