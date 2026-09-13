import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const token = request.cookies.get('edu_token')
  const userCookie = request.cookies.get('edu_user')?.value
  const { pathname } = request.nextUrl
  const isDashboard = pathname.startsWith('/dashboard')
  const isAuthPage = pathname.startsWith('/auth')
  const isAdminPage = pathname.startsWith('/dashboard/users')

  let role: string | undefined
  if (userCookie) {
    try {
      const decoded = decodeURIComponent(userCookie)
      const parsed = JSON.parse(decoded) as { role?: unknown }
      role = typeof parsed.role === 'string' ? parsed.role.toUpperCase() : undefined
    } catch {
      role = undefined
    }
  }

  if (isDashboard && !token) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  if (isAdminPage && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*'],
}
