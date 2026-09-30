'use client'
import * as React from 'react'
import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({
  className, children, chiudi = true, ...props
}: React.ComponentProps<typeof D.Content> & { chiudi?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <D.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        {chiudi && (
          <D.Close className="absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100" aria-label="Chiudi">
            <X className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  )
}

export const DialogHeader = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('grid gap-1.5 pr-6', className)} {...p} />
)
export const DialogFooter = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...p} />
)
export const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof D.Title>) => (
  <D.Title className={cn('text-lg font-semibold', className)} {...p} />
)
export const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof D.Description>) => (
  <D.Description className={cn('text-sm text-muted-foreground', className)} {...p} />
)
