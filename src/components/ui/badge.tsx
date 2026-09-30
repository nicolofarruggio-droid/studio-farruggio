import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const stiliBadge = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        neutro: 'border-transparent bg-muted text-muted-foreground',
        successo: 'border-transparent bg-successo-sfondo text-successo',
        avviso: 'border-transparent bg-avviso-sfondo text-avviso',
        pericolo: 'border-transparent bg-pericolo-sfondo text-pericolo',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof stiliBadge>) {
  return <span className={cn(stiliBadge({ variant }), className)} {...props} />
}
