'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { MailCheck } from 'lucide-react'
import { registraStudio } from '../azioni'
import { Campo, Checkbox, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Alert } from '@/components/ui/alert'

export function ModuloRegistrazione() {
  const [esito, azione] = useActionState(registraStudio, null)
  if (esito?.ok) {
    return (
      <Alert variant="successo">
        <MailCheck aria-hidden />
        <div className="grid gap-1">
          <p className="font-medium">Controlla la tua casella email</p>
          <p>
            Ti abbiamo mandato un&apos;email a <strong>{esito.dati?.email}</strong>. Apri il link per confermare
            l&apos;indirizzo: lo studio viene creato subito dopo e tu ne diventi l&apos;admin.
          </p>
        </div>
      </Alert>
    )
  }
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <Campo id="nome_studio" etichetta="Nome dello studio" errore={campi?.nome_studio}>
        <Input name="nome_studio" autoComplete="organization" required placeholder="Studio Rossi & Associati" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nome" etichetta="Nome" errore={campi?.nome}>
          <Input name="nome" autoComplete="given-name" required />
        </Campo>
        <Campo id="cognome" etichetta="Cognome" errore={campi?.cognome}>
          <Input name="cognome" autoComplete="family-name" required />
        </Campo>
      </div>
      <Campo id="email" etichetta="Email" errore={campi?.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Campo>
      <Campo id="password" etichetta="Password personale" aiuto="Almeno 10 caratteri." errore={campi?.password}>
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Campo>
      <Campo id="conferma" etichetta="Ripeti la password" errore={campi?.conferma}>
        <Input name="conferma" type="password" autoComplete="new-password" required />
      </Campo>
      <div className="grid gap-1">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="termini" className="mt-0.5" aria-describedby={campi?.termini ? 'termini-errore' : undefined} />
          <span>
            Ho letto i <Link href="/termini" className="text-primary underline" target="_blank">termini di servizio</Link> e
            l&apos;<Link href="/privacy" className="text-primary underline" target="_blank">informativa privacy</Link>.
          </span>
        </label>
        {campi?.termini && <p id="termini-errore" className="text-xs font-medium text-destructive">{campi.termini}</p>}
      </div>
      <PulsanteInvio className="w-full" testoAttesa="Registrazione in corso…">Registra lo studio</PulsanteInvio>
    </form>
  )
}
