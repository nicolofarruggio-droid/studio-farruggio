'use client'
import { useActionState, useState } from 'react'
import { AlertTriangle, MailCheck } from 'lucide-react'
import { invita, type EsitoInvito } from './azioni'
import type { EsitoAzione } from '@/lib/errori'
import { Campo, Input, Select } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Alert } from '@/components/ui/alert'
import { CopiaLink } from '@/components/studio/copia-link'

/** Esito di un invito: email partita, oppure il link da copiare. */
export function RisultatoInvito({ esito }: { esito: EsitoInvito }) {
  if (esito.emailInviata) {
    return (
      <Alert variant="successo">
        <MailCheck aria-hidden />
        <p>
          Invito mandato a <strong>{esito.email}</strong>. Riceverà un&apos;email con il link per scegliere la sua password
          (vale 7 giorni).
        </p>
      </Alert>
    )
  }
  return (
    <div className="grid gap-3">
      <Alert variant="avviso">
        <AlertTriangle aria-hidden />
        <div className="grid gap-1">
          <p className="font-medium">L&apos;email per {esito.email} non è partita.</p>
          <p>{esito.motivo} L&apos;invito però è valido: copia il link e mandalo tu (per email, chat o messaggio).</p>
        </div>
      </Alert>
      {esito.link && <CopiaLink link={esito.link} />}
    </div>
  )
}

const vuoto = { nome: '', cognome: '', email: '', ruolo: 'collaboratore' }

export function ModuloInvito() {
  const [valori, setValori] = useState(vuoto)
  const [esito, azione] = useActionState<EsitoAzione<EsitoInvito> | null, FormData>(async (prima, fd) => {
    const r = await invita(prima, fd)
    if (r.ok) setValori(vuoto) // invito creato: il modulo si svuota per il prossimo
    return r
  }, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  const cambia = (k: keyof typeof vuoto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValori((v) => ({ ...v, [k]: e.target.value }))

  return (
    <div className="grid gap-4">
      {esito?.ok && esito.dati ? <RisultatoInvito esito={esito.dati} /> : <MessaggioEsito esito={esito} />}
      <form action={azione} className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_11rem_auto]" noValidate>
        <Campo id="invito-nome" etichetta="Nome" errore={campi?.nome}>
          <Input name="nome" autoComplete="off" required value={valori.nome} onChange={cambia('nome')} />
        </Campo>
        <Campo id="invito-cognome" etichetta="Cognome" errore={campi?.cognome}>
          <Input name="cognome" autoComplete="off" value={valori.cognome} onChange={cambia('cognome')} />
        </Campo>
        <Campo id="invito-email" etichetta="Email" errore={campi?.email}>
          <Input name="email" type="email" autoComplete="off" required value={valori.email} onChange={cambia('email')} />
        </Campo>
        <Campo id="invito-ruolo" etichetta="Ruolo" errore={campi?.ruolo}>
          <Select name="ruolo" value={valori.ruolo} onChange={cambia('ruolo')}>
            <option value="collaboratore">Collaboratore</option>
            <option value="admin">Admin</option>
          </Select>
        </Campo>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
          <span aria-hidden className="hidden text-sm leading-none lg:block">&nbsp;</span>
          <PulsanteInvio testoAttesa="Invio in corso…">Invita</PulsanteInvio>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        La persona riceve un&apos;email con lo studio, il ruolo, l&apos;indirizzo con cui entrare e il link per scegliere la
        sua password. Gli admin vedono e gestiscono tutto lo studio; i collaboratori vedono secondo la visibilità scelta in
        Impostazioni.
      </p>
    </div>
  )
}
