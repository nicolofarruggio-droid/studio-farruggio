'use client'
import { useActionState, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { concediAccesso, togliAccesso } from './azioni'
import type { EsitoAzione } from '@/lib/errori'
import { Campo, Select } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { DialogoConferma } from '@/components/studio/dialogo-conferma'

type Persona = { id: string; nome: string; ruolo: string }

const LIVELLI = [
  { valore: 'lettura', titolo: 'Solo per vedere', descrizione: 'Vede clienti, compiti, documenti e comunicazioni del collega, ma non li modifica.' },
  { valore: 'completa', titolo: 'Può anche lavorarci', descrizione: 'Aggiorna le date, commenta, carica documenti, cambia lo stato dei compiti del collega.' },
]

export function ModuloAccesso({ collaboratori, proprietari }: { collaboratori: Persona[]; proprietari: Persona[] }) {
  const vuoto = { utente: '', proprietario: '', livello: 'lettura' }
  const [valori, setValori] = useState(vuoto)
  const [esito, azione] = useActionState<EsitoAzione | null, FormData>(async (prima, fd) => {
    const r = await concediAccesso(prima, fd)
    if (r.ok) setValori(vuoto)
    return r
  }, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Campo id="accesso-utente" etichetta="Chi riceve l'accesso (A)" aiuto="Solo collaboratori attivi: gli admin vedono già tutto." errore={campi?.utente}>
          <Select name="utente" value={valori.utente} onChange={(e) => setValori((v) => ({ ...v, utente: e.target.value }))}>
            <option value="">Scegli un collaboratore…</option>
            {collaboratori.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
        </Campo>
        <Campo id="accesso-proprietario" etichetta="Allo spazio di (B)" aiuto="I clienti e i compiti assegnati a questa persona." errore={campi?.proprietario}>
          <Select name="proprietario" value={valori.proprietario} onChange={(e) => setValori((v) => ({ ...v, proprietario: e.target.value }))}>
            <option value="">Scegli un collega…</option>
            {proprietari.filter((p) => p.id !== valori.utente).map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.ruolo === 'admin' ? ' (admin)' : ''}</option>
            ))}
          </Select>
        </Campo>
      </div>
      <fieldset className="grid gap-2" aria-describedby={campi?.livello ? 'accesso-livello-errore' : undefined}>
        <legend className="mb-1 text-sm font-medium">Cosa può fare</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {LIVELLI.map((l) => (
            <label key={l.valore} className="flex items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
              <input
                type="radio"
                name="livello"
                value={l.valore}
                checked={valori.livello === l.valore}
                onChange={() => setValori((v) => ({ ...v, livello: l.valore }))}
                className="mt-1 accent-primary"
              />
              <span className="grid gap-0.5 text-sm">
                <span className="font-medium">{l.titolo}</span>
                <span className="text-muted-foreground">{l.descrizione}</span>
              </span>
            </label>
          ))}
        </div>
        {campi?.livello && <p id="accesso-livello-errore" className="text-xs font-medium text-destructive">{campi.livello}</p>}
      </fieldset>
      <div>
        <PulsanteInvio testoAttesa="Salvataggio…">Concedi l&apos;accesso</PulsanteInvio>
      </div>
    </form>
  )
}

export function TogliAccesso({ id, frase }: { id: string; frase: string }) {
  return (
    <DialogoConferma
      etichetta="Togli accesso"
      etichettaAccessibile={`Togli accesso: ${frase}`}
      icona={<Trash2 aria-hidden />}
      titolo="Togliere l'accesso?"
      descrizione={<p>{frase}. Da subito non potrà più farlo; il cambio finisce nel registro attività.</p>}
      testoConferma="Togli accesso"
      varianteConferma="destructive"
      azione={() => togliAccesso(id)}
    />
  )
}
