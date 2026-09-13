"use client"

import type { Metadata } from 'next'
import { Providers } from '@/context/Providers'
import './globals.css'
import { useEffect } from 'react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = localStorage.getItem('edu_theme')
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.dataset.theme = theme
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [])

  return (
    <html lang="en" suppressHydrationWarning>
      <head></head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
