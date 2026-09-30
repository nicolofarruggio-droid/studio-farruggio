import Link from 'next/link'
import {
  AlertTriangle, CheckCircle2, Clock, FileSpreadsheet, Info, Mail, MailCheck, MailWarning, MailX, ShieldCheck, UserX,
} from 'lucide-react'
import { conUtente } from '@/lib/db'
import { nomeCompleto, richiediAdmin } from '@/lib/auth/sessione'
import { conDuePassaggi, elencoPersone, invitiInAttesa, type InvitoInAttesa, type PersonaStudio } from '@/lib/dati/studio'
import { emailConfigurata } from '@/lib/posta'
import { formattaData, formattaDataOra } from '@/lib/date'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { ModuloInvito } from './modulo-invito'
import { AzioniInvito, AzioniPersona } from './azioni-righe'

export const metadata = { title: 'Utenti e inviti' }

function StatoCasella({ stato }: { stato: string }) {
  if (stato === 'collegata') return <Badge variant="successo"><MailCheck aria-hidden /> Collegata</Badge>
  if (stato === 'da_ricollegare') return <Badge variant="avviso"><MailWarning aria-hidden /> Da ricollegare</Badge>
  return <Badge variant="neutro"><Mail aria-hidden /> Non collegata</Badge>
}

function BadgeRuolo({ ruolo }: { ruolo: string }) {
  return <Badge variant={ruolo === 'admin' ? 'default' : 'outline'}>{ruolo === 'admin' ? 'Admin' : 'Collaboratore'}</Badge>
}

function StatoPersona({ p }: { p: PersonaStudio }) {
  if (p.attivo) return <Badge variant="successo"><CheckCircle2 aria-hidden /> Attivo</Badge>
  return (
    <span className="grid gap-0.5">
      <Badge variant="neutro"><UserX aria-hidden /> Disattivato</Badge>
      {p.disattivato_il && <span className="text-xs text-muted-foreground">dal {formattaData(p.disattivato_il)}</span>}
    </span>
  )
}

function StatoInvito({ i }: { i: InvitoInAttesa }) {
  if (i.email_inviata_il) return <Badge variant="successo"><CheckCircle2 aria-hidden /> Email partita il {formattaDataOra(i.email_inviata_il)}</Badge>
  if (i.errore_invio) {
    return (
      <span className="grid gap-0.5">
        <Badge variant="avviso"><MailX aria-hidden /> Email non partita</Badge>
        <span className="text-xs text-muted-foreground">{i.errore_invio}</span>
      </span>
    )
  }
  return <Badge variant="neutro"><Clock aria-hidden /> Email non ancora partita</Badge>
}

function ScadenzaInvito({ i }: { i: InvitoInAttesa }) {
  if (i.scaduto) return <Badge variant="pericolo"><AlertTriangle aria-hidden /> Scaduto il {formattaData(i.scade_il)}</Badge>
  return <span className="text-sm">Scade il {formattaData(i.scade_il)}</span>
}

const riga = (p: PersonaStudio, conDue: boolean) => ({
  id: p.id,
  nome: nomeCompleto(p),
  ruolo: p.ruolo,
  attivo: p.attivo,
  clienti: p.clienti_referente + p.clienti_aggiuntivo,
  compiti: p.compiti_aperti,
  duePassaggi: conDue,
})

export default async function PaginaUtenti() {
  const { persona, utente } = await richiediAdmin()
  const { persone, inviti } = await conUtente(persona, async (tx) => ({
    persone: await elencoPersone(tx),
    inviti: await invitiInAttesa(tx),
  }))
  const duePassaggi = await conDuePassaggi(persone.map((p) => p.id))
  const candidati = persone.filter((p) => p.attivo).map((p) => ({ id: p.id, nome: nomeCompleto(p), ruolo: p.ruolo }))
  const attive = persone.filter((p) => p.attivo).length
  const configurata = emailConfigurata()

  return (
    <>
      <Intestazione
        titolo="Utenti e inviti"
        descrizione="Invita admin e collaboratori, cambia i ruoli, disattiva chi non lavora più nello studio."
        azioni={
          <Button asChild variant="outline">
            <Link href="/studio/utenti/importa"><FileSpreadsheet aria-hidden /> Importa da un file</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-6">
        {!configurata && (
          <Alert variant="info">
            <Info aria-hidden />
            <p>
              Il servizio email non è ancora configurato: dopo ogni invito vedrai il link da copiare e mandare tu alla
              persona.
            </p>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invita una persona</CardTitle>
              <CardDescription>Nome, cognome, indirizzo email e ruolo. Il link per entrare vale 7 giorni.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><ModuloInvito /></CardContent>
        </Card>

        <Card aria-labelledby="titolo-inviti">
          <CardHeader>
            <div>
              <CardTitle id="titolo-inviti">Inviti in attesa ({inviti.length})</CardTitle>
              <CardDescription>Persone invitate che non sono ancora entrate. &quot;Rinvia&quot; crea un nuovo link valido altri 7 giorni.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0 pb-2">
            {inviti.length === 0 ? (
              <p className="px-5 pb-3 text-sm text-muted-foreground">Nessun invito in attesa.</p>
            ) : (
              <>
                {/* telefono: una scheda per invito */}
                <ul className="divide-y border-t md:hidden" role="list">
                  {inviti.map((i) => (
                    <li key={i.id} className="grid gap-2 px-5 py-3">
                      <span>
                        <span className="block font-medium">{nomeCompleto(i)} · {i.ruolo === 'admin' ? 'Admin' : 'Collaboratore'}</span>
                        <span className="block text-xs text-muted-foreground">{i.email}</span>
                      </span>
                      <span className="flex flex-wrap gap-2"><StatoInvito i={i} /><ScadenzaInvito i={i} /></span>
                      <AzioniInvito id={i.id} nome={nomeCompleto(i)} email={i.email} />
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Persona</TH>
                        <TH>Ruolo</TH>
                        <TH>Email di invito</TH>
                        <TH>Scadenza</TH>
                        <TH><span className="sr-only">Azioni</span></TH>
                      </TR>
                    </THead>
                    <TBody>
                      {inviti.map((i) => (
                        <TR key={i.id}>
                          <TD>
                            <span className="block font-medium">{nomeCompleto(i)}</span>
                            <span className="block text-xs text-muted-foreground">{i.email}</span>
                          </TD>
                          <TD>{i.ruolo === 'admin' ? 'Admin' : 'Collaboratore'}</TD>
                          <TD><StatoInvito i={i} /></TD>
                          <TD><ScadenzaInvito i={i} /></TD>
                          <TD><AzioniInvito id={i.id} nome={nomeCompleto(i)} email={i.email} /></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card aria-labelledby="titolo-persone">
          <CardHeader>
            <div>
              <CardTitle id="titolo-persone">Persone dello studio</CardTitle>
              <CardDescription>
                {attive} {attive === 1 ? 'attiva' : 'attive'}
                {persone.length > attive ? `, ${persone.length - attive} disattivate` : ''}. Le persone non si eliminano:
                si disattivano e restano con il loro storico. Lo studio ha sempre almeno un admin attivo.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0 pb-2">
            {/* telefono: una scheda per persona */}
            <ul className="divide-y border-t md:hidden" role="list">
              {persone.map((p) => (
                <li key={p.id} className={`grid gap-2 px-5 py-3 ${p.attivo ? '' : 'bg-muted/30'}`}>
                  <span>
                    <span className="block font-medium">
                      {nomeCompleto(p)}
                      {p.id === utente.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(tu)</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{p.email}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <BadgeRuolo ruolo={p.ruolo} />
                    <StatoPersona p={p} />
                    <StatoCasella stato={p.casella} />
                    {duePassaggi.has(p.id) && <Badge variant="successo"><ShieldCheck aria-hidden /> Due passaggi</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Ultimo accesso: {p.ultimo_accesso ? formattaDataOra(p.ultimo_accesso) : 'mai'}
                  </span>
                  <AzioniPersona seiTu={p.id === utente.id} candidati={candidati} p={riga(p, duePassaggi.has(p.id))} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Nome</TH>
                    <TH>Ruolo</TH>
                    <TH>Stato</TH>
                    <TH>Ultimo accesso</TH>
                    <TH>Casella email</TH>
                    <TH>Due passaggi</TH>
                    <TH><span className="sr-only">Azioni</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {persone.map((p) => (
                    <TR key={p.id} className={p.attivo ? undefined : 'bg-muted/30'}>
                      <TD>
                        <span className="block font-medium">
                          {nomeCompleto(p)}
                          {p.id === utente.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(tu)</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{p.email}</span>
                      </TD>
                      <TD><BadgeRuolo ruolo={p.ruolo} /></TD>
                      <TD><StatoPersona p={p} /></TD>
                      <TD className="text-sm whitespace-nowrap">{p.ultimo_accesso ? formattaDataOra(p.ultimo_accesso) : <span className="text-muted-foreground">Mai</span>}</TD>
                      <TD><StatoCasella stato={p.casella} /></TD>
                      <TD>
                        {duePassaggi.has(p.id) ? (
                          <Badge variant="successo"><ShieldCheck aria-hidden /> Attiva</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">No</span>
                        )}
                      </TD>
                      <TD className="min-w-60">
                        <AzioniPersona seiTu={p.id === utente.id} candidati={candidati} p={riga(p, duePassaggi.has(p.id))} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
