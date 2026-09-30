import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Bot, Building2, Info, Mail, MessageSquare, Pencil, Phone, Plus, Users, Handshake, MoreHorizontal, Sparkles, Paperclip, Archive } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { leggiSchedaCliente, type SchedaCliente } from '@/lib/dati/scheda-cliente'
import { colleghi } from '@/lib/dati/clienti'
import { descriviAggiornamento, formattaData, formattaDataOra } from '@/lib/date'
import { euro } from '@/lib/utils'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { IndicatoreRapido } from '@/components/indicatore-rapido'
import { NOMI_INDICATORE } from '@/components/indicatore'
import { ElencoCompitiCompatto } from '@/components/dashboard/elenco-compiti'
import { SezioneEmail } from './sezione-email'
import { ModuloComunicazione } from './comunicazioni'
import { Assegnazioni } from './assegnazioni'
import { PulsanteArchivia } from './archivia'

export const metadata = { title: 'Scheda cliente' }

const CANALI: Record<string, { etichetta: string; icona: typeof Mail }> = {
  email: { etichetta: 'Email', icona: Mail },
  telefono: { etichetta: 'Telefono', icona: Phone },
  incontro: { etichetta: 'Incontro', icona: Handshake },
  whatsapp: { etichetta: 'WhatsApp', icona: MessageSquare },
  altro: { etichetta: 'Altro', icona: MoreHorizontal },
}

const ORIGINI: Record<string, string> = { manuale: '', importazione: 'importazione', agente: 'agente AI', annullamento: 'annullamento' }

function valoreStorico(data: string | null, na: boolean | null) {
  if (na) return 'Non applicabile'
  return data ? descriviAggiornamento(data) : 'Da impostare'
}

function Provenienza({ c }: { c: SchedaCliente['comunicazioni'][number] }) {
  if (c.fonte === 'email_automatica')
    return <>Riassunto automatico dalla casella di {c.autore ?? 'un utente'}{c.mittente ? ` · da ${c.mittente}` : ''}</>
  if (c.fonte === 'email_incollata') return <>Riassunto AI di un&apos;email, controllato da {c.autore ?? 'un utente'}</>
  return <>Scritto da {c.autore ?? 'un utente'}</>
}

function Dato({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

export default async function PaginaCliente({ params, searchParams }: PageProps<'/clienti/[id]'>) {
  const { id } = await params
  const q = await searchParams
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { persona, utente, studio } = await richiediUtente()
  const admin = utente.ruolo === 'admin'
  const { s, persone } = await conUtente(persona, async (tx) => ({ s: await leggiSchedaCliente(tx, id), persone: admin ? await colleghi(tx) : [] }))
  if (!s) notFound()
  const { cliente } = s
  const puoCreareCompiti = admin || studio.creazione_compiti !== 'solo_admin'

  if (!s.completo) {
    return (
      <>
        <Intestazione titolo={cliente.nome_visualizzazione} />
        <Alert className="mb-6"><Info aria-hidden /><p>Vedi questo cliente solo per i compiti che ti riguardano.</p></Alert>
        <Card>
          <CardHeader><CardTitle>Compiti che ti riguardano</CardTitle></CardHeader>
          <CardContent className="pt-0"><ElencoCompitiCompatto compiti={[...s.compitiAperti, ...s.compitiChiusi]} vuoto="Nessun compito." /></CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <Link href="/clienti" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Tutti i clienti
      </Link>
      <Intestazione
        titolo={
          <span className="flex flex-wrap items-center gap-2">
            {cliente.nome_visualizzazione}
            {cliente.stato === 'archiviato' && <Badge variant="neutro"><Archive aria-hidden /> Archiviato</Badge>}
          </span>
        }
        descrizione={cliente.ragione_sociale}
        azioni={
          <>
            {puoCreareCompiti && <Button asChild variant="outline"><Link href={`/compiti/nuovo?cliente=${cliente.id}`}><Plus /> Nuovo compito</Link></Button>}
            {admin && <PulsanteArchivia cliente={cliente.id} stato={cliente.stato} />}
            {admin && <Button asChild><Link href={`/clienti/${cliente.id}/modifica`}><Pencil /> Modifica anagrafica</Link></Button>}
          </>
        }
      />
      {q.creato && <Alert variant="successo" className="mb-4"><p>Cliente creato.</p></Alert>}
      {q.salvato && <Alert variant="successo" className="mb-4"><p>Anagrafica salvata.</p></Alert>}
      {s.stessoTitolare.length > 0 && (
        <Alert variant="avviso" className="mb-4">
          <AlertTriangle aria-hidden />
          <p>
            Stesso titolare di altri clienti:{' '}
            {s.stessoTitolare.map((c, i) => (
              <span key={c.id}><Link href={`/clienti/${c.id}`} className="font-medium underline">{c.nome_visualizzazione}</Link>{i < s.stessoTitolare.length - 1 ? ', ' : ''}</span>
            ))}
          </p>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Aggiornamenti contabili</CardTitle>
                <CardDescription>Fino a quando il lavoro è aggiornato. {s.puoLavorare ? 'Clicca sul valore per aggiornarlo.' : ''}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-0">
              <div className="grid gap-4 sm:grid-cols-2">
                {(['iva', 'prima_nota'] as const).map((t) => (
                  <div key={t} className="grid gap-2 rounded-lg border p-4">
                    <p className="text-sm font-semibold">Aggiornamento {NOMI_INDICATORE[t]}</p>
                    <IndicatoreRapido
                      cliente={cliente.id} nomeCliente={cliente.ragione_sociale} tipo={t} valore={s.indicatori[t]}
                      soglia={t === 'iva' ? studio.soglia_ritardo_iva_mesi : studio.soglia_ritardo_prima_nota_mesi} modificabile={s.puoLavorare}
                    />
                    {s.indicatori[t] && (
                      <p className="text-xs text-muted-foreground">
                        Modificato il {formattaDataOra(s.indicatori[t]!.aggiornato_il)}{s.indicatori[t]!.da ? ` da ${s.indicatori[t]!.da}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-primary">Storico delle modifiche ({s.storico.length})</summary>
                {s.storico.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nessuna modifica.</p>
                ) : (
                  <div className="mt-2 rounded-lg border">
                    <Table>
                      <THead><TR><TH>Quando</TH><TH>Indicatore</TH><TH>Prima</TH><TH>Dopo</TH><TH>Chi</TH></TR></THead>
                      <TBody>
                        {s.storico.map((r) => (
                          <TR key={r.id}>
                            <TD className="whitespace-nowrap">{formattaDataOra(r.modificato_il)}</TD>
                            <TD>{NOMI_INDICATORE[r.tipo]}</TD>
                            <TD>{r.valore_precedente === null && r.na_precedente === null ? '—' : valoreStorico(r.valore_precedente, r.na_precedente)}</TD>
                            <TD className="font-medium">{valoreStorico(r.valore_nuovo, r.na_nuovo)}</TD>
                            <TD>
                              {r.da_agente && <Bot className="mr-1 inline size-3.5" aria-label="agente" />}
                              {r.da ?? '—'}
                              {ORIGINI[r.origine] && <span className="text-xs text-muted-foreground"> · {ORIGINI[r.origine]}</span>}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )}
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Indirizzi email collegati</CardTitle>
                <CardDescription>L&apos;AI riconosce le email del cliente solo dall&apos;indirizzo esatto del mittente: tienili aggiornati.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <SezioneEmail cliente={cliente.id} email={s.email} modificabile={s.puoLavorare} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Comunicazioni</CardTitle>
                <CardDescription>
                  {s.caselleCollegate > 0
                    ? `${s.caselleCollegate === 1 ? '1 casella email collegata' : `${s.caselleCollegate} caselle email collegate`} nello studio: le email del cliente vengono riassunte in automatico.`
                    : 'Nessuna casella email collegata nello studio: le email del cliente non vengono riassunte in automatico.'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-0">
              {s.puoLavorare && <ModuloComunicazione cliente={cliente.id} />}
              {s.comunicazioni.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna comunicazione registrata.</p>
              ) : (
                <ol className="relative grid gap-4 border-l pl-5" aria-label="Storico delle comunicazioni, dalla più recente">
                  {s.comunicazioni.map((c) => {
                    const canale = CANALI[c.canale] ?? CANALI.altro
                    const Icona = canale.icona
                    return (
                      <li key={c.id} className="relative">
                        <span className="absolute top-0.5 -left-[1.95rem] flex size-6 items-center justify-center rounded-full border bg-card">
                          <Icona className="size-3.5 text-muted-foreground" aria-hidden />
                        </span>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{canale.etichetta}</span>
                          <span>{formattaDataOra(c.data)}</span>
                          {c.fonte !== 'manuale' && <Sparkles className="size-3.5" aria-label="riassunto AI" />}
                          <span><Provenienza c={c} /></span>
                        </p>
                        {c.oggetto && <p className="mt-1 text-sm font-medium">{c.oggetto}{c.numero_messaggio && c.numero_messaggio > 1 ? <span className="font-normal text-muted-foreground"> · messaggio {c.numero_messaggio} della conversazione</span> : null}</p>}
                        <p className="mt-1 text-sm whitespace-pre-line">{c.testo}</p>
                        {c.allegati.length > 0 && (
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="size-3.5" aria-hidden /> Allegati: {c.allegati.join(', ')}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4" aria-hidden /> Anagrafica</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <dl className="grid gap-3">
                <Dato etichetta={s.titolari.length > 1 ? 'Titolari' : 'Titolare'}>
                  {s.titolari.length > 0 && (
                    <ul>{s.titolari.map((t, i) => <li key={i}>{t.nome} {t.cognome}{t.principale && s.titolari.length > 1 ? ' (principale)' : ''}</li>)}</ul>
                  )}
                </Dato>
                <Dato etichetta="Partita IVA">{cliente.partita_iva}</Dato>
                <Dato etichetta="Codice fiscale">{cliente.codice_fiscale}</Dato>
                <Dato etichetta="Telefono">{cliente.telefono && <a href={`tel:${cliente.telefono}`} className="hover:underline">{cliente.telefono}</a>}</Dato>
                <Dato etichetta="N. dipendenti">{cliente.numero_dipendenti ?? ''}</Dato>
                <Dato etichetta="Fatturato">{cliente.fatturato ? euro.format(Number(cliente.fatturato)) : ''}</Dato>
                {cliente.alias.length > 0 && <Dato etichetta="Alias">{cliente.alias.join(', ')}</Dato>}
                {cliente.note && <Dato etichetta="Note interne"><span className="whitespace-pre-line">{cliente.note}</span></Dato>}
                <Dato etichetta="Nel gestionale dal">{formattaData(cliente.creato_il)}</Dato>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" aria-hidden /> Collaboratori assegnati</CardTitle></CardHeader>
            <CardContent className="grid gap-3 pt-0">
              <Assegnazioni cliente={cliente.id} assegnati={s.assegnati} colleghi={persone.filter((p) => p.attivo)} admin={admin} />
              {s.storicoAssegnazioni.length > 1 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-primary">Storico delle assegnazioni</summary>
                  <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    {s.storicoAssegnazioni.map((a, i) => (
                      <li key={i}>
                        {a.nome}{a.referente ? ' (referente)' : ''}: dal {formattaData(a.dal)}{a.al ? ` al ${formattaData(a.al)}` : ' a oggi'}
                        {a.assegnato_da ? ` · assegnato da ${a.assegnato_da}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Compiti</CardTitle>
              {puoCreareCompiti && <Button asChild variant="ghost" size="sm"><Link href={`/compiti/nuovo?cliente=${cliente.id}`}><Plus /> Nuovo</Link></Button>}
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Aperti ({s.compitiAperti.length})</p>
              <ElencoCompitiCompatto compiti={s.compitiAperti} vuoto="Nessun compito aperto." />
              {s.compitiChiusi.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary">Compiti chiusi ({s.compitiChiusi.length})</summary>
                  <ElencoCompitiCompatto compiti={s.compitiChiusi} vuoto="" />
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
