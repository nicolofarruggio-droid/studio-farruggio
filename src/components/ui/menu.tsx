'use client'
import * as React from 'react'
import { DropdownMenu as M, Popover as P } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({ className, align = 'end', ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-48 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0', className)}
        {...props}
      />
    </M.Portal>
  )
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground', className)}
      {...props}
    />
  )
}

export const MenuSeparator = ({ className, ...p }: React.ComponentProps<typeof M.Separator>) => (
  <M.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...p} />
)
export const MenuLabel = ({ className, ...p }: React.ComponentProps<typeof M.Label>) => (
  <M.Label className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...p} />
)

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor
export function PopoverContent({ className, align = 'end', ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={8}
        className={cn('z-50 rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0', className)}
        {...props}
      />
    </P.Portal>
  )
}
