'use client'
import { useActionState } from 'react'
import { verificaCodice } from './azioni'
import type { EsitoAzione } from '@/lib/errori'
import { Campo, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'

export function ModuloVerifica({ next }: { next?: string }) {
  const [esito, azione] = useActionState<EsitoAzione | null, FormData>(verificaCodice, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <MessaggioEsito esito={esito} />
      <Campo id="codice" etichetta="Codice di 6 cifre" aiuto="Il codice cambia ogni 30 secondi." errore={campi?.codice}>
        <Input
          name="codice"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={7}
          autoFocus
          required
          className="h-11 text-center font-mono text-xl tracking-[0.4em]"
        />
      </Campo>
      <PulsanteInvio className="w-full" testoAttesa="Verifica…">Verifica ed entra</PulsanteInvio>
    </form>
  )
}
