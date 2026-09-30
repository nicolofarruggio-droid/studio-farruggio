'use client'
import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Send, ShieldOff, UserCheck, UserCog, UserX, XCircle } from 'lucide-react'
import { annullaInvito, cambiaRuolo, disattivaPersona, riattivaPersona, rinviaInvito, togliDuePassaggi } from './azioni'
import { RisultatoInvito } from './modulo-invito'
import { DialogoConferma } from '@/components/studio/dialogo-conferma'
import { Checkbox, Label, Select } from '@/components/ui/campi'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'

export function AzioniInvito({ id, nome, email }: { id: string; nome: string; email: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <DialogoConferma
        etichetta="Rinvia"
        etichettaAccessibile={`Rinvia l'invito a ${nome}`}
        icona={<Send aria-hidden />}
        titolo={`Rinviare l'invito a ${nome}?`}
        descrizione={
          <>
            <p>Creiamo un nuovo link, valido altri 7 giorni, e lo mandiamo a <strong>{email}</strong>.</p>
            <p>Il link precedente smette di funzionare.</p>
          </>
        }
        testoConferma="Rinvia l'invito"
        azione={() => rinviaInvito(id)}
        risultato={(r) => (r.dati && !r.dati.emailInviata ? <RisultatoInvito esito={r.dati} /> : null)}
      />
      <DialogoConferma
        etichetta="Annulla"
        etichettaAccessibile={`Annulla l'invito a ${nome}`}
        icona={<XCircle aria-hidden />}
        titolo={`Annullare l'invito a ${nome}?`}
        descrizione={<p>Il link mandato a <strong>{email}</strong> smette di funzionare. Potrai invitarla di nuovo quando vuoi.</p>}
        testoConferma="Annulla l'invito"
        varianteConferma="destructive"
        azione={() => annullaInvito(id)}
      />
    </div>
  )
}

export type Candidato = { id: string; nome: string; ruolo: string }

export type PersonaRiga = {
  id: string
  nome: string
  ruolo: 'admin' | 'collaboratore'
  attivo: boolean
  clienti: number
  compiti: number
  duePassaggi: boolean
}

function CambiaRuolo({ p, seiTu }: { p: PersonaRiga; seiTu: boolean }) {
  const [ruolo, setRuolo] = useState(p.ruolo)
  const nuovo = ruolo !== p.ruolo
  return (
    <DialogoConferma
      etichetta="Cambia ruolo"
      etichettaAccessibile={`Cambia il ruolo di ${p.nome}`}
      icona={<UserCog aria-hidden />}
      titolo={`Ruolo di ${p.nome}`}
      descrizione={<p>Ora è <strong>{p.ruolo === 'admin' ? 'admin' : 'collaboratore'}</strong>. Il cambio vale subito e finisce nel registro attività.</p>}
      testoConferma="Cambia ruolo"
      pronto={nuovo}
      azione={() => cambiaRuolo(p.id, ruolo)}
    >
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Nuovo ruolo</legend>
        <label className="flex items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
          <input type="radio" name={`ruolo-${p.id}`} value="admin" checked={ruolo === 'admin'} onChange={() => setRuolo('admin')} className="mt-1 accent-primary" />
          <span className="grid gap-0.5 text-sm">
            <span className="font-medium">Admin</span>
            <span className="text-muted-foreground">Vede e gestisce tutto lo studio: clienti, compiti, utenti, impostazioni. Gli accessi tra colleghi ricevuti non servono più e vengono tolti.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
          <input type="radio" name={`ruolo-${p.id}`} value="collaboratore" checked={ruolo === 'collaboratore'} onChange={() => setRuolo('collaboratore')} className="mt-1 accent-primary" />
          <span className="grid gap-0.5 text-sm">
            <span className="font-medium">Collaboratore</span>
            <span className="text-muted-foreground">Vede e lavora secondo la visibilità dello studio; niente utenti, impostazioni e assegnazione dei clienti.</span>
          </span>
        </label>
      </fieldset>
      {seiTu && (
        <Alert variant="avviso">
          <AlertTriangle aria-hidden />
          <p>Stai cambiando il tuo ruolo: da collaboratore non vedrai più le pagine dello Studio. Serve almeno un altro admin attivo.</p>
        </Alert>
      )}
    </DialogoConferma>
  )
}

function Disattiva({ p, candidati, seiTu }: { p: PersonaRiga; candidati: Candidato[]; seiTu: boolean }) {
  const lavoro = p.clienti + p.compiti > 0
  const [nuovo, setNuovo] = useState('')
  const [clienti, setClienti] = useState(p.clienti > 0)
  const [compiti, setCompiti] = useState(p.compiti > 0)
  const altri = candidati.filter((c) => c.id !== p.id)
  const idScelta = `passa-a-${p.id}`
  return (
    <DialogoConferma
      etichetta="Disattiva"
      etichettaAccessibile={`Disattiva ${p.nome}`}
      icona={<UserX aria-hidden />}
      titolo={seiTu ? 'Disattivare il tuo account?' : `Disattivare ${p.nome}?`}
      descrizione={
        <ul className="list-disc space-y-1 pl-5">
          {seiTu && <li><strong>Stai disattivando te stesso:</strong> uscirai subito e potrà riattivarti solo un altro admin.</li>}
          <li>Non potrà più entrare. Resta nell&apos;elenco con il suo storico e puoi riattivarlo quando vuoi.</li>
          <li>Perde gli accessi agli spazi dei colleghi che gli erano stati concessi.</li>
          <li>La sua casella email, se collegata, viene scollegata.</li>
        </ul>
      }
      testoConferma="Disattiva"
      varianteConferma="destructive"
      pronto={!lavoro || nuovo !== ''}
      azione={() =>
        disattivaPersona({
          utente: p.id,
          nuovo: nuovo && nuovo !== 'nessuno' ? nuovo : null,
          clienti: nuovo !== 'nessuno' && clienti,
          compiti: nuovo !== 'nessuno' && compiti,
        })
      }
    >
      {lavoro && (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm">
            {p.nome} ha{' '}
            <strong>{p.clienti} {p.clienti === 1 ? 'cliente' : 'clienti'}</strong> e{' '}
            <strong>{p.compiti} {p.compiti === 1 ? 'compito aperto' : 'compiti aperti'}</strong>. A chi li passiamo?
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={idScelta}>Passa il suo lavoro a</Label>
            <Select id={idScelta} value={nuovo} onChange={(e) => setNuovo(e.target.value)}>
              <option value="">Scegli…</option>
              {altri.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}{c.ruolo === 'admin' ? ' (admin)' : ''}</option>
              ))}
              <option value="nessuno">Non passarlo a nessuno per ora</option>
            </Select>
          </div>
          {nuovo && nuovo !== 'nessuno' && (
            <div className="grid gap-2 text-sm">
              {p.clienti > 0 && (
                <label className="flex items-center gap-2">
                  <Checkbox checked={clienti} onChange={(e) => setClienti(e.target.checked)} />
                  Passa i clienti ({p.clienti})
                </label>
              )}
              {p.compiti > 0 && (
                <label className="flex items-center gap-2">
                  <Checkbox checked={compiti} onChange={(e) => setCompiti(e.target.checked)} />
                  Passa i compiti aperti ({p.compiti}): riceverà una notifica per ognuno
                </label>
              )}
            </div>
          )}
          {nuovo === 'nessuno' && (
            <p className="text-sm text-muted-foreground">Clienti e compiti restano a suo nome: potrai riassegnarli dalle schede dei clienti e dei compiti.</p>
          )}
        </div>
      )}
    </DialogoConferma>
  )
}

export function AzioniPersona({ p, candidati, seiTu }: { p: PersonaRiga; candidati: Candidato[]; seiTu: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {seiTu && <Button asChild variant="ghost" size="sm"><Link href="/profilo">Il tuo profilo</Link></Button>}
      {p.attivo && <CambiaRuolo p={p} seiTu={seiTu} />}
      {p.attivo ? (
        <Disattiva p={p} candidati={candidati} seiTu={seiTu} />
      ) : (
        <DialogoConferma
          etichetta="Riattiva"
          etichettaAccessibile={`Riattiva ${p.nome}`}
          icona={<UserCheck aria-hidden />}
          titolo={`Riattivare ${p.nome}?`}
          descrizione={
            <>
              <p>Potrà di nuovo entrare con la sua email e la sua password, con il ruolo di {p.ruolo}.</p>
              <p>Gli accessi agli spazi dei colleghi e la casella email non tornano da soli: vanno concessi e collegati di nuovo.</p>
            </>
          }
          testoConferma="Riattiva"
          azione={() => riattivaPersona(p.id)}
        />
      )}
      {p.duePassaggi && !seiTu && (
        <DialogoConferma
          etichetta="Togli verifica in due passaggi"
          etichettaAccessibile={`Togli la verifica in due passaggi a ${p.nome}`}
          icona={<ShieldOff aria-hidden />}
          variante="ghost"
          titolo={`Togliere la verifica in due passaggi a ${p.nome}?`}
          descrizione={<p>Serve solo se ha perso il telefono con l&apos;app di autenticazione: da ora entrerà solo con la password e potrà riattivarla dal suo profilo.</p>}
          testoConferma="Togli la verifica"
          varianteConferma="destructive"
          azione={() => togliDuePassaggi(p.id)}
        >
          <Alert variant="avviso">
            <RotateCcw aria-hidden />
            <p>Fallo solo dopo aver verificato di persona o al telefono che la richiesta viene davvero da {p.nome}.</p>
          </Alert>
        </DialogoConferma>
      )}
    </div>
  )
}
