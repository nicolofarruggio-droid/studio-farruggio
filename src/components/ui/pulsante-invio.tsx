'use client'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from './button'

/** Pulsante di invio che si disattiva e mostra l'attesa mentre il modulo viene inviato. */
export function PulsanteInvio({ children, testoAttesa, ...props }: ButtonProps & { testoAttesa?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending && testoAttesa ? testoAttesa : children}
    </Button>
  )
}
