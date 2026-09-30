'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { completaRegistrazione } from '../azioni'
import { Campo, Checkbox, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'

export function ModuloCompleta({ nome, cognome, nomeStudio }: { nome: string; cognome: string; nomeStudio: string }) {
  const [esito, azione] = useActionState(completaRegistrazione, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <Campo id="nome_studio" etichetta="Nome dello studio" errore={campi?.nome_studio}>
        <Input name="nome_studio" defaultValue={nomeStudio} required autoComplete="organization" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nome" etichetta="Nome" errore={campi?.nome}>
          <Input name="nome" defaultValue={nome} required autoComplete="given-name" />
        </Campo>
        <Campo id="cognome" etichetta="Cognome" errore={campi?.cognome}>
          <Input name="cognome" defaultValue={cognome} required autoComplete="family-name" />
        </Campo>
      </div>
      <div className="grid gap-1">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="termini" className="mt-0.5" />
          <span>
            Ho letto i <Link href="/termini" className="text-primary underline" target="_blank">termini di servizio</Link> e
            l&apos;<Link href="/privacy" className="text-primary underline" target="_blank">informativa privacy</Link>.
          </span>
        </label>
        {campi?.termini && <p className="text-xs font-medium text-destructive">{campi.termini}</p>}
      </div>
      <PulsanteInvio className="w-full" testoAttesa="Creazione dello studio…">Crea lo studio</PulsanteInvio>
    </form>
  )
}
