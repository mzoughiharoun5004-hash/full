'use client'

import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'

interface AvatarProps {
  name?: string
  firstName?: string
  lastName?: string
  src?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
  xl: 'h-14 w-14 text-lg',
}

const colors = [
  'bg-[#0F6B4A]',
  'bg-[#12805A]',
  'bg-[#1D6F56]',
  'bg-[#C6A765]',
  'bg-[#8C7139]',
  'bg-[#2F5F4D]',
]

function pickColor(name: string) {
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}

export function Avatar({ name, firstName, lastName, src, size = 'md', className }: AvatarProps) {
  const displayName = name ?? `${firstName ?? ''} ${lastName ?? ''}`.trim()
  const initials = firstName && lastName
    ? getInitials(firstName, lastName)
    : displayName.slice(0, 2).toUpperCase()
  const color = pickColor(displayName || 'A')

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={displayName}
        className={cn('rounded-full object-cover flex-shrink-0', sizes[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-[#FFF8EC]',
        sizes[size],
        color,
        className
      )}
    >
      {initials}
    </div>
  )
}
