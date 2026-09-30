import { cn } from '@/lib/utils'

export function Logo({ className, chiaro = false }: { className?: string; chiaro?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill={chiaro ? '#ffffff' : '#2f3a8f'} />
        <circle cx="16" cy="16" r="8.5" fill="none" stroke={chiaro ? '#2f3a8f' : '#fff'} strokeWidth="2.5" />
        <circle cx="16" cy="16" r="3.5" fill={chiaro ? '#2f3a8f' : '#fff'} />
      </svg>
      <span>BigBrotherStudio</span>
    </span>
  )
}
