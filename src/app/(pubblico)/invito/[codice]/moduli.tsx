'use client'
import { useActionState, useTransition } from 'react'
import { accettaInvito, accettaInvitoConPassword } from '../../azioni'
import { Campo, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { Button } from '@/components/ui/button'
import { MessaggioEsito } from '@/components/ui/messaggio'
import type { EsitoAzione } from '@/lib/errori'
import { useState } from 'react'

export function ModuloPasswordInvito({ codice, email }: { codice: string; email: string }) {
  const [esito, azione] = useActionState(accettaInvitoConPassword.bind(null, codice), null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <Campo id="email" etichetta="Email con cui entrerai">
        <Input value={email} readOnly disabled />
      </Campo>
      <Campo id="password" etichetta="Scegli la tua password" aiuto="Almeno 10 caratteri. La conosci solo tu." errore={campi?.password}>
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Campo>
      <Campo id="conferma" etichetta="Ripeti la password" errore={campi?.conferma}>
        <Input name="conferma" type="password" autoComplete="new-password" required />
      </Campo>
      <PulsanteInvio className="w-full" testoAttesa="Salvataggio…">Salva la password ed entra</PulsanteInvio>
    </form>
  )
}

export function PulsanteAccetta({ codice }: { codice: string }) {
  const [inCorso, avvia] = useTransition()
  const [esito, setEsito] = useState<EsitoAzione | null>(null)
  return (
    <div className="grid gap-3">
      <MessaggioEsito esito={esito} />
      <Button className="w-full" disabled={inCorso} onClick={() => avvia(async () => setEsito(await accettaInvito(codice)))}>
        {inCorso ? 'Un momento…' : 'Accetta l\'invito ed entra'}
      </Button>
    </div>
  )
}
