import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const stili = cva('flex gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', {
  variants: {
    variant: {
      info: 'border-primary/20 bg-info-sfondo text-foreground [&>svg]:text-primary',
      successo: 'border-successo/30 bg-successo-sfondo text-foreground [&>svg]:text-successo',
      avviso: 'border-avviso/30 bg-avviso-sfondo text-foreground [&>svg]:text-avviso',
      pericolo: 'border-pericolo/30 bg-pericolo-sfondo text-foreground [&>svg]:text-pericolo',
    },
  },
  defaultVariants: { variant: 'info' },
})

export function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof stili>) {
  return <div role={variant === 'pericolo' ? 'alert' : 'status'} className={cn(stili({ variant }), className)} {...props} />
}
