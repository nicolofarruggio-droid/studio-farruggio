'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { accedi } from '../azioni'
import { Campo, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'

export function ModuloAccesso({ next }: { next?: string }) {
  const [esito, azione] = useActionState(accedi, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <MessaggioEsito esito={esito} />
      <Campo id="email" etichetta="Email" errore={campi?.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Campo>
      <Campo id="password" etichetta="Password" errore={campi?.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Campo>
      <div className="-mt-2 text-right text-sm">
        <Link href="/password-dimenticata" className="text-primary hover:underline">
          Password dimenticata?
        </Link>
      </div>
      <PulsanteInvio className="w-full" testoAttesa="Accesso in corso…">Accedi</PulsanteInvio>
    </form>
  )
}
