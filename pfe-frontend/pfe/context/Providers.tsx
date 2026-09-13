'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/context/AuthContext'
import { SocketProvider } from '@/context/SocketContext'
import { ThemeProvider } from '@/context/ThemeContext'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>{children}</SocketProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--lux-surface)',
                color: 'var(--lux-text)',
                border: '1px solid var(--lux-line)',
                borderRadius: '0.625rem',
                fontSize: '0.875rem',
              },
              success: { iconTheme: { primary: 'var(--lux-primary)', secondary: 'var(--lux-bg)' } },
              error: { iconTheme: { primary: '#ef4444', secondary: 'var(--lux-bg)' } },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
