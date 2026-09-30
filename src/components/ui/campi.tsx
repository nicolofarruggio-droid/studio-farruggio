import * as React from 'react'
import { cn } from '@/lib/utils'

const base =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(base, 'h-9 py-1', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(base, 'min-h-20 py-2', className)} {...props} />
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(base, 'h-9 py-1 pr-8', className)} {...props} />
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="label" className={cn('text-sm font-medium leading-none', className)} {...props} />
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

/** Campo di un modulo con etichetta, aiuto ed errore collegati per l'accessibilità. */
export function Campo({
  id, etichetta, aiuto, errore, children, className, facoltativo,
}: {
  id: string
  etichetta: React.ReactNode
  aiuto?: React.ReactNode
  errore?: string
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
  className?: string
  facoltativo?: boolean
}) {
  const descr = [aiuto ? `${id}-aiuto` : null, errore ? `${id}-errore` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {etichetta}
        {facoltativo && <span className="ml-1 font-normal text-muted-foreground">(facoltativo)</span>}
      </Label>
      {React.cloneElement(children, { id, 'aria-describedby': descr, 'aria-invalid': errore ? true : undefined })}
      {aiuto && (
        <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
          {aiuto}
        </p>
      )}
      {errore && (
        <p id={`${id}-errore`} className="text-xs font-medium text-destructive">
          {errore}
        </p>
      )}
    </div>
  )
}
