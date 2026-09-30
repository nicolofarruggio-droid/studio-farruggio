import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}
export const THead = ({ className, ...p }: React.ComponentProps<'thead'>) => (
  <thead className={cn('[&_tr]:border-b bg-muted/40', className)} {...p} />
)
export const TBody = ({ className, ...p }: React.ComponentProps<'tbody'>) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />
)
export const TR = ({ className, ...p }: React.ComponentProps<'tr'>) => (
  <tr className={cn('border-b transition-colors hover:bg-muted/30 data-[selezionata=true]:bg-accent/60', className)} {...p} />
)
export const TH = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th className={cn('h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-muted-foreground', className)} {...p} />
)
export const TD = ({ className, ...p }: React.ComponentProps<'td'>) => (
  <td className={cn('px-3 py-2.5 align-middle', className)} {...p} />
)
