import { cn } from '@/lib/utils'

export function AuthorBadge({ name, coverMode = false }: { name: string; coverMode?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A'

  return (
    <span
      className={cn(
        'grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[var(--lux-primary)] text-base font-medium text-[var(--lux-text-strong)]',
        coverMode && 'ring-1 ring-white/35',
      )}
    >
      {initials}
    </span>
  )
}
