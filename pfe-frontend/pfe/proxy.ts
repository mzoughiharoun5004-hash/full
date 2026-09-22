import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// These cookies are UI hints, not credentials — the JWT sits in the HttpOnly
// `auth_token` cookie that only the backend reads. Redirects here save a
// round trip; the real authorization happens on every API call.
export function proxy(request: NextRequest) {
  const session = request.cookies.get('edu_session')
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

  if (isDashboard && !session) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  if (isAdminPage && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*'],
}
