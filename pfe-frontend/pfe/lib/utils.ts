import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date?: string | Date | null, pattern = 'MMM d, yyyy') {
  if (!date) return '-'

  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '-'

  return format(value, pattern)
}

export function timeAgo(date?: string | Date | null) {
  if (!date) return '-'

  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '-'

  return formatDistanceToNow(value, { addSuffix: true })
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function truncate(str: string, max = 60) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

export function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()
}

export function formatUserName(
  user?: { id?: string | number; firstName?: string; lastName?: string; name?: string; email?: string } | null,
  fallback = 'Unknown user',
) {
  const fullName = [user?.firstName, user?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')

  return fullName || user?.name?.trim() || user?.email?.trim() || (user?.id ? `User #${user.id}` : fallback)
}

export function slugify(str: string) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
