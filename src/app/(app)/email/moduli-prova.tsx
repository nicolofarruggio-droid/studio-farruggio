'use client'
import { useActionState } from 'react'
import { Campo, Checkbox, Input, Label, Select, Textarea } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { collegaCasellaProva, controllaOra, simulaEmail } from './azioni'

// Modalità di prova (GMAIL_SIMULATO=1): casella finta, arrivo simulato di email e "Controlla ora".

export function ModuloCollegaProva() {
  const [esito, azione] = useActionState(collegaCasellaProva, null)
  return (
    <form action={azione} className="grid gap-3">
      <MessaggioEsito esito={esito} />
      <div>
        <PulsanteInvio variant="secondary" testoAttesa="Collegamento…">Collega casella di prova</PulsanteInvio>
      </div>
    </form>
  )
}

export function PulsanteControllaOra() {
  const [esito, azione] = useActionState(controllaOra, null)
  return (
    <form action={azione} className="grid gap-3">
      <MessaggioEsito esito={esito} />
      <div>
        <PulsanteInvio testoAttesa="Controllo in corso…">Controlla ora</PulsanteInvio>
      </div>
    </form>
  )
}

export function ModuloSimulaEmail({ conversazioni }: { conversazioni: { threadId: string; descrizione: string }[] }) {
  const [esito, azione] = useActionState(simulaEmail, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4">
      <MessaggioEsito esito={esito} />
      <div className="grid gap-4 md:grid-cols-2">
        <Campo id="sim-mittente" etichetta="Mittente" aiuto="Per esempio: Enzo D'Agosta <info@autoshop-esempio.it>" errore={campi?.mittente}>
          <Input name="mittente" required autoComplete="off" />
        </Campo>
        <Campo id="sim-oggetto" etichetta="Oggetto" facoltativo aiuto="Se rispondi a una conversazione, lascialo vuoto per usare «R: …»." errore={campi?.oggetto}>
          <Input name="oggetto" autoComplete="off" />
        </Campo>
      </div>
      <Campo id="sim-testo" etichetta="Testo dell'email" errore={campi?.testo}>
        <Textarea name="testo" rows={5} required />
      </Campo>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo id="sim-allegati" etichetta="Nomi degli allegati" facoltativo aiuto="Separati da virgole, per esempio: fattura-agosto.pdf, estratto-conto.pdf" errore={campi?.allegati}>
          <Input name="allegati" autoComplete="off" />
        </Campo>
        <Campo id="sim-conversazione" etichetta="Risposta a una conversazione esistente" facoltativo aiuto="L'email arriva nella stessa conversazione (stesso thread di Gmail).">
          <Select name="conversazione" defaultValue="">
            <option value="">Nessuna: nuova conversazione</option>
            {conversazioni.map((c) => <option key={c.threadId} value={c.threadId}>{c.descrizione}</option>)}
          </Select>
        </Campo>
      </div>
      <Campo id="sim-altri" etichetta="Recapita anche alle caselle di prova di" facoltativo aiuto="Indirizzi dei colleghi, separati da virgole: la stessa email (stesso Message-ID) arriva anche a loro, per provare che non si creano doppioni." errore={campi?.altri}>
        <Input name="altri" autoComplete="off" />
      </Campo>
      <div className="flex items-center gap-2">
        <Checkbox id="sim-html" name="soloHtml" />
        <Label htmlFor="sim-html" className="font-normal">Solo versione HTML (senza testo semplice)</Label>
      </div>
      <div>
        <PulsanteInvio variant="secondary" testoAttesa="Invio…">Simula l&apos;arrivo dell&apos;email</PulsanteInvio>
      </div>
    </form>
  )
}
