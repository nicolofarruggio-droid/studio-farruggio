'use client'
import { useId, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/campi'

/** Link da copiare e mandare a mano (per esempio quando l'email di invito non è partita). */
export function CopiaLink({ link, etichetta = 'Link di invito da mandare' }: { link: string; etichetta?: string }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [copiato, setCopiato] = useState(false)

  async function copia() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // senza permesso per gli appunti: seleziono il testo, l'utente copia con Ctrl+C
      campo.current?.focus()
      campo.current?.select()
      return
    }
    setCopiato(true)
    setTimeout(() => setCopiato(false), 4000)
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{etichetta}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          ref={campo}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button type="button" onClick={copia} variant={copiato ? 'secondary' : 'default'}>
          {copiato ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiato ? 'Copiato' : 'Copia link'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {copiato ? 'Link copiato: incollalo in un messaggio alla persona invitata.' : 'Il link vale 7 giorni e funziona una sola volta.'}
      </p>
    </div>
  )
}
