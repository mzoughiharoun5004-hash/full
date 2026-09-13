'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/context/AuthContext'
import { SidebarProvider, useSidebar } from '@/context/SidebarContext'

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen, closeMobileNav } = useSidebar()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/auth/login')
    }
  }, [user, isLoading, router])

  if (isLoading) return <PageLoader />
  if (!user) return null

  const isScenarioAuthoring =
    pathname === '/dashboard/scenarios/new' ||
    (pathname.startsWith('/dashboard/scenarios/') && pathname.endsWith('/edit'))

  if (isScenarioAuthoring) {
    return (
      <div className="h-screen overflow-hidden bg-white text-black">
        <main className="h-full overflow-y-auto lux-scrollbar">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--lux-bg)] text-[var(--lux-text)]">
      {/* Sidebar — fixed height, internal scroll, high z-index for floating tooltips */}
      <div className="sticky top-0 z-40 hidden h-screen flex-shrink-0 lg:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-in fade-in duration-200"
            aria-label="Close navigation"
            onClick={closeMobileNav}
          />
          <div className="absolute inset-y-0 left-0 animate-in slide-in-from-left duration-250">
            <Sidebar
              collapsed={false}
              mobile
              onCloseMobile={closeMobileNav}
            />
          </div>
        </div>
      )}

      {/* Right column — scrolls independently */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Topbar — stays at top, does not scroll */}
        <Topbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          onOpenMobileMenu={() => setMobileNavOpen(true)}
        />

        {/* Page content — scrolls here, not the whole window */}
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-7 lux-scrollbar">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  )
}
