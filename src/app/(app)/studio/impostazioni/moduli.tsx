'use client'
import { useActionState, useState } from 'react'
import { AlertTriangle, MailSearch, Power, PowerOff } from 'lucide-react'
import {
  salvaAnagrafica, salvaCreazioneCompiti, salvaLetturaEmail, salvaSoglie, salvaVisibilita,
} from './azioni'
import type { EsitoAzione } from '@/lib/errori'
import { OPZIONI_CREAZIONE, OPZIONI_VISIBILITA } from '@/lib/studio/testi'
import { Campo, Checkbox, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { DialogoConferma } from '@/components/studio/dialogo-conferma'

type Anagrafica = {
  nome: string
  ragione_sociale: string | null
  partita_iva: string | null
  codice_fiscale: string | null
  indirizzo: string | null
  telefono: string | null
  email: string | null
  pec: string | null
}

export function ModuloAnagrafica({ dati }: { dati: Anagrafica }) {
  // i valori restano nei campi anche se il salvataggio non va a buon fine
  const [valori, setValori] = useState(() =>
    Object.fromEntries(Object.entries(dati).map(([k, v]) => [k, v ?? ''])) as Record<keyof Anagrafica, string>,
  )
  const [esito, azione] = useActionState<EsitoAzione | null, FormData>(salvaAnagrafica, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  const campo = (k: keyof Anagrafica, props: React.ComponentProps<'input'> = {}) => (
    <Input name={k} value={valori[k]} onChange={(e) => setValori((v) => ({ ...v, [k]: e.target.value }))} {...props} />
  )
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Campo id="st-nome" etichetta="Nome dello studio" aiuto="Compare nel menu e nelle email di invito." errore={campi?.nome}>
          {campo('nome', { required: true, autoComplete: 'organization' })}
        </Campo>
        <Campo id="st-ragione" etichetta="Ragione sociale" facoltativo errore={campi?.ragione_sociale}>
          {campo('ragione_sociale')}
        </Campo>
        <Campo id="st-piva" etichetta="Partita IVA" facoltativo errore={campi?.partita_iva}>
          {campo('partita_iva', { inputMode: 'numeric' })}
        </Campo>
        <Campo id="st-cf" etichetta="Codice fiscale" facoltativo errore={campi?.codice_fiscale}>
          {campo('codice_fiscale')}
        </Campo>
        <Campo id="st-indirizzo" etichetta="Indirizzo" facoltativo errore={campi?.indirizzo} className="md:col-span-2">
          {campo('indirizzo', { autoComplete: 'street-address' })}
        </Campo>
        <Campo id="st-telefono" etichetta="Telefono" facoltativo errore={campi?.telefono}>
          {campo('telefono', { type: 'tel', autoComplete: 'tel' })}
        </Campo>
        <Campo id="st-email" etichetta="Email" facoltativo errore={campi?.email}>
          {campo('email', { type: 'email' })}
        </Campo>
        <Campo id="st-pec" etichetta="PEC" facoltativo errore={campi?.pec}>
          {campo('pec', { type: 'email' })}
        </Campo>
      </div>
      <div>
        <PulsanteInvio testoAttesa="Salvataggio…">Salva i dati dello studio</PulsanteInvio>
      </div>
    </form>
  )
}

function SceltaRadio<T extends string>({
  nome, opzioni, valore, onChange, legenda,
}: {
  nome: string
  opzioni: { valore: T; titolo: string; descrizione: string }[]
  valore: T
  onChange: (v: T) => void
  legenda: string
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">{legenda}</legend>
      {opzioni.map((o) => (
        <label key={o.valore} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
          <input type="radio" name={nome} value={o.valore} checked={valore === o.valore} onChange={() => onChange(o.valore)} className="mt-1 accent-primary" />
          <span className="grid gap-0.5 text-sm">
            <span className="font-medium">{o.titolo}</span>
            <span className="text-muted-foreground">{o.descrizione}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function ModuloVisibilita({ attuale }: { attuale: (typeof OPZIONI_VISIBILITA)[number]['valore'] }) {
  const [valore, setValore] = useState(attuale)
  const scelta = OPZIONI_VISIBILITA.find((o) => o.valore === valore)!
  const prima = OPZIONI_VISIBILITA.find((o) => o.valore === attuale)!
  return (
    <div className="grid gap-4">
      <SceltaRadio nome="visibilita" legenda="Visibilità tra collaboratori" opzioni={OPZIONI_VISIBILITA} valore={valore} onChange={setValore} />
      <p className="text-xs text-muted-foreground">
        In ogni caso restano solo agli admin inviti, ruoli, impostazioni, creazione, archiviazione e assegnazione dei clienti.
      </p>
      <div>
        <DialogoConferma
          etichetta="Salva la visibilità"
          variante="default"
          dimensione="default"
          disabilitato={valore === attuale}
          titolo="Cambiare la visibilità tra collaboratori?"
          descrizione={
            <>
              <p>Da <strong>{prima.titolo}</strong> a <strong>{scelta.titolo}</strong>.</p>
              <p>{scelta.descrizione}</p>
              <p>Vale subito per tutti i collaboratori e finisce nel registro attività con il valore prima e dopo.</p>
            </>
          }
          testoConferma="Cambia la visibilità"
          azione={() => salvaVisibilita(valore)}
        />
      </div>
    </div>
  )
}

export function ModuloCreazioneCompiti({ attuale }: { attuale: (typeof OPZIONI_CREAZIONE)[number]['valore'] }) {
  const [valore, setValore] = useState(attuale)
  const scelta = OPZIONI_CREAZIONE.find((o) => o.valore === valore)!
  const prima = OPZIONI_CREAZIONE.find((o) => o.valore === attuale)!
  return (
    <div className="grid gap-4">
      <SceltaRadio nome="creazione_compiti" legenda="Chi può creare compiti" opzioni={OPZIONI_CREAZIONE} valore={valore} onChange={setValore} />
      <div>
        <DialogoConferma
          etichetta="Salva"
          variante="default"
          dimensione="default"
          disabilitato={valore === attuale}
          titolo="Cambiare chi può creare compiti?"
          descrizione={
            <>
              <p>Da <strong>{prima.titolo}</strong> a <strong>{scelta.titolo}</strong>.</p>
              <p>{scelta.descrizione} Gli admin creano sempre compiti per chiunque.</p>
            </>
          }
          testoConferma="Conferma"
          azione={() => salvaCreazioneCompiti(valore)}
        />
      </div>
    </div>
  )
}

export function ModuloSoglie({ iva, primaNota }: { iva: number; primaNota: number }) {
  const [valori, setValori] = useState({ iva: String(iva), primaNota: String(primaNota) })
  const [esito, azione] = useActionState<EsitoAzione | null, FormData>(salvaSoglie, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Campo id="soglia-iva" etichetta="IVA: in ritardo dopo (mesi)" aiuto="Con 2 mesi, a fine settembre serve almeno luglio." errore={campi?.soglia_ritardo_iva_mesi}>
          <Input name="soglia_ritardo_iva_mesi" type="number" min={0} max={36} step={1} inputMode="numeric" value={valori.iva} onChange={(e) => setValori((v) => ({ ...v, iva: e.target.value }))} className="max-w-32" />
        </Campo>
        <Campo id="soglia-pn" etichetta="Prima nota: in ritardo dopo (mesi)" aiuto="Da 0 a 36 mesi." errore={campi?.soglia_ritardo_prima_nota_mesi}>
          <Input name="soglia_ritardo_prima_nota_mesi" type="number" min={0} max={36} step={1} inputMode="numeric" value={valori.primaNota} onChange={(e) => setValori((v) => ({ ...v, primaNota: e.target.value }))} className="max-w-32" />
        </Campo>
      </div>
      <div>
        <PulsanteInvio testoAttesa="Salvataggio…">Salva le soglie</PulsanteInvio>
      </div>
    </form>
  )
}

export function InterruttoreLetturaEmail({ attiva }: { attiva: boolean }) {
  const [confermo, setConfermo] = useState(false)
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Stato:</span>
        {attiva ? (
          <Badge variant="successo"><Power aria-hidden /> Attiva</Badge>
        ) : (
          <Badge variant="neutro"><PowerOff aria-hidden /> Spenta</Badge>
        )}
      </div>
      <Alert variant="avviso">
        <AlertTriangle aria-hidden />
        <div className="grid gap-1">
          <p className="font-medium">Da attivare solo dopo aver chiuso i punti della sezione 16.5 delle specifiche.</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Verifica di Google per il permesso di sola lettura su Gmail (per gli studi fuori dal dominio della piattaforma).</li>
            <li>Parere di un consulente del lavoro o privacy sullo Statuto dei lavoratori (art. 4) e informativa ai collaboratori.</li>
            <li>Privacy dei clienti: informativa, accordo di trattamento dati, fornitore AI come sub-responsabile, eventuale DPIA.</li>
          </ul>
        </div>
      </Alert>
      <div>
        {attiva ? (
          <DialogoConferma
            etichetta="Spegni la lettura automatica"
            icona={<PowerOff aria-hidden />}
            dimensione="default"
            titolo="Spegnere la lettura automatica delle email?"
            descrizione={<p>Le caselle collegate non vengono più controllate. Le comunicazioni già salvate restano nelle schede dei clienti.</p>}
            testoConferma="Spegni"
            azione={() => salvaLetturaEmail(false)}
          />
        ) : (
          <DialogoConferma
            etichetta="Attiva la lettura automatica"
            icona={<MailSearch aria-hidden />}
            dimensione="default"
            titolo="Attivare la lettura automatica delle email?"
            descrizione={
              <p>
                Le caselle collegate dai collaboratori verranno controllate in sola lettura e le email dei clienti riassunte
                nelle loro schede. Il cambio finisce nel registro attività.
              </p>
            }
            testoConferma="Attiva"
            pronto={confermo}
            azione={() => salvaLetturaEmail(true)}
          >
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confermo} onChange={(e) => setConfermo(e.target.checked)} className="mt-0.5" />
              <span>Confermo che i punti della sezione 16.5 (verifica Google, parere sullo Statuto dei lavoratori, privacy) sono stati chiusi per questo studio.</span>
            </label>
          </DialogoConferma>
        )}
      </div>
    </div>
  )
}
