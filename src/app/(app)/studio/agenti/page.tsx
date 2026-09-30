import Link from 'next/link'
import { Ban, Bot, CheckCircle2, CircleSlash, Clock, FileJson, Inbox, ShieldAlert, Undo2, XCircle } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { formattaData, formattaDataOra, isoValida } from '@/lib/date'
import { AZIONI_AGENTE, AZIONI_VIETATE, DESCRIZIONI_AZIONI, ETICHETTE_LIVELLO, tuttiIPermessi } from '@/lib/api/permessi-agente'
import { AZIONI_REGISTRO_AGENTE, GIORNI_ANNULLAMENTO, descriviVoceRegistro, eAzioneRegistroAgente, motivoNonAnnullabile } from '@/lib/api/registro'
import { limitiDaAmbiente } from '@/lib/api/limiti'
import { Intestazione } from '@/components/intestazione'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Select } from '@/components/ui/campi'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { agentiDelloStudio, azioniDegliAgenti, proposte, type TokenAgente } from './dati'
import { annulla, approva, impostaAttivo, revocaToken } from './azioni'
import { ModuloNuovoAgente, ModuloNuovoToken, ModuloPermessi, ModuloRifiuta, PulsanteAzione } from './moduli'

export const metadata = { title: 'Agenti AI e API' }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function StatoToken({ t, adesso }: { t: TokenAgente; adesso: Date }) {
  if (t.revocato_il) return <Badge variant="neutro"><Ban aria-hidden /> Revocato il {formattaData(t.revocato_il)}</Badge>
  if (new Date(t.scade_il).getTime() <= adesso.getTime()) return <Badge variant="avviso"><Clock aria-hidden /> Scaduto il {formattaData(t.scade_il)}</Badge>
  return <Badge variant="successo"><CheckCircle2 aria-hidden /> Valido fino al {formattaData(t.scade_il)}</Badge>
}

function StatoProposta({ stato }: { stato: string }) {
  if (stato === 'approvata') return <Badge variant="successo"><CheckCircle2 aria-hidden /> Approvata</Badge>
  if (stato === 'rifiutata') return <Badge variant="neutro"><CircleSlash aria-hidden /> Rifiutata</Badge>
  if (stato === 'fallita') return <Badge variant="pericolo"><XCircle aria-hidden /> Non riuscita</Badge>
  return <Badge variant="avviso"><Clock aria-hidden /> In attesa</Badge>
}

export default async function PaginaAgenti({ searchParams }: PageProps<'/studio/agenti'>) {
  const { persona } = await richiediAdmin()
  const sp = await searchParams
  const param = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const filtri = {
    dal: isoValida(param('dal')) ? param('dal') : undefined,
    al: isoValida(param('al')) ? param('al') : undefined,
    tipo: eAzioneRegistroAgente(param('tipo')) ? param('tipo') : undefined,
    agente: uuid.test(param('agente')) ? param('agente') : undefined,
  }
  const { agenti, token, coda, azioni } = await conUtente(persona, async (tx) => {
    const [{ agenti, token }, coda, azioni] = await Promise.all([agentiDelloStudio(tx), proposte(tx), azioniDegliAgenti(tx, filtri)])
    return { agenti, token, coda, azioni }
  })
  const limiti = limitiDaAmbiente()
  const adesso = new Date()

  return (
    <>
      <Intestazione
        titolo="Agenti AI e API"
        descrizione="Account dedicati per Claude Cowork e altri agenti: permessi, token di accesso, proposte da approvare e tutto ciò che hanno fatto."
        azioni={
          <Button asChild variant="outline">
            <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer"><FileJson aria-hidden /> Specifica dell&apos;API (OpenAPI)</a>
          </Button>
        }
      />

      <nav aria-label="Sezioni della pagina" className="mb-6 flex flex-wrap gap-2 text-sm">
        <a href="#proposte" className="rounded-md border bg-card px-3 py-1.5 hover:bg-accent">
          Proposte in attesa{coda.inAttesa.length ? ` (${coda.inAttesa.length})` : ''}
        </a>
        <a href="#account" className="rounded-md border bg-card px-3 py-1.5 hover:bg-accent">Account agente ({agenti.length})</a>
        <a href="#azioni" className="rounded-md border bg-card px-3 py-1.5 hover:bg-accent">Azioni degli agenti</a>
      </nav>

      <div className="grid gap-6">
        <Alert>
          <ShieldAlert aria-hidden />
          <div className="grid gap-2">
            <p>
              Un agente lavora con un <strong>account suo</strong>, mai con le credenziali di una persona. Appartiene solo a questo
              studio, segue le stesse regole di accesso dell&apos;interfaccia e parte <strong>in sola lettura</strong>: le scritture
              si abilitano una per una, subito (&quot;Sì&quot;) oppure come proposte che un admin approva. Ogni sua azione compare
              nello storico con il suo nome. Limiti: {limiti.letture} letture e {limiti.scritture} scritture al minuto per token;
              oltre, le richieste vengono rifiutate e gli admin ricevono un avviso.
            </p>
            <div>
              <p className="font-medium">Un agente non può mai, nemmeno abilitato:</p>
              <ul className="ml-5 list-disc">
                {AZIONI_VIETATE.map((a) => <li key={a}>{a};</li>)}
              </ul>
              <p className="mt-1 text-muted-foreground">
                Commenti, descrizioni e documenti sono solo dati: i permessi dell&apos;agente si cambiano esclusivamente da questa pagina.
              </p>
            </div>
          </div>
        </Alert>

        {/* Proposte ------------------------------------------------------------------------- */}
        <Card id="proposte" className="scroll-mt-20">
          <CardHeader>
            <div>
              <CardTitle>Proposte in attesa</CardTitle>
              <CardDescription>
                Azioni preparate dagli agenti abilitati in modalità &quot;solo proposta&quot;. Approvando, l&apos;azione viene eseguita a tuo
                nome, con i tuoi permessi.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0">
            {coda.inAttesa.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Inbox className="size-4" aria-hidden /> Nessuna proposta in attesa.</p>
            ) : (
              <ul className="grid gap-3" role="list">
                {coda.inAttesa.map((p) => (
                  <li key={p.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto]">
                    <div className="grid min-w-0 gap-1">
                      <p className="break-words font-medium">{p.descrizione.titolo}</p>
                      {p.descrizione.dettagli.length > 0 && (
                        <ul className="grid gap-0.5 text-sm text-muted-foreground">
                          {p.descrizione.dettagli.map((d, i) => <li key={i} className="whitespace-pre-wrap break-words">{d}</li>)}
                        </ul>
                      )}
                      <p className="text-xs text-muted-foreground">
                        <Bot className="mr-1 inline size-3.5" aria-hidden />Proposta da {p.agente} il {formattaDataOra(p.creata_il)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                      <PulsanteAzione azione={approva} campi={{ proposta: p.id }} etichetta="Approva" variante="default"
                        etichettaAccessibile={`Approva: ${p.descrizione.titolo}`} />
                      <ModuloRifiuta proposta={p.id} titolo={p.descrizione.titolo} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {coda.decise.length > 0 && (
              <details className="rounded-lg border px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">Ultime proposte decise ({coda.decise.length})</summary>
                <ul className="mt-3 grid gap-2 text-sm" role="list">
                  {coda.decise.map((p) => (
                    <li key={p.id} className="grid gap-1 border-t pt-2 first:border-0 first:pt-0">
                      <span className="flex flex-wrap items-center gap-2"><StatoProposta stato={p.stato} /> {p.descrizione.titolo}</span>
                      <span className="text-xs text-muted-foreground">
                        Proposta da {p.agente} il {formattaDataOra(p.creata_il)}
                        {p.decisa_il && ` · decisa da ${p.decisa_da_nome ?? '—'} il ${formattaDataOra(p.decisa_il)}`}
                        {p.esito && ` · ${p.esito}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>

        {/* Account ------------------------------------------------------------------------- */}
        <section id="account" className="grid scroll-mt-20 gap-4" aria-labelledby="titolo-account">
          <h2 id="titolo-account" className="text-lg font-semibold">Account agente</h2>
          {agenti.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessun account agente. Creane uno qui sotto per collegare Claude Cowork o un altro agente.</p>
          )}
          {agenti.map((a) => {
            const permessi = tuttiIPermessi(a.permessi_agente)
            const abilitati = AZIONI_AGENTE.filter((x) => permessi[x] !== 'no')
            const suoiToken = token.filter((t) => t.agente_id === a.id)
            return (
              <Card key={a.id} aria-labelledby={`agente-${a.id}`}>
                <CardHeader>
                  <div className="grid gap-1">
                    <CardTitle id={`agente-${a.id}`} className="flex flex-wrap items-center gap-2">
                      <Bot className="size-4" aria-hidden /> {a.nome}
                      {a.attivo
                        ? <Badge variant="successo"><CheckCircle2 aria-hidden /> Attivo</Badge>
                        : <Badge variant="pericolo"><Ban aria-hidden /> Sospeso</Badge>}
                    </CardTitle>
                    {a.descrizione && <CardDescription>{a.descrizione}</CardDescription>}
                    <p className="text-xs text-muted-foreground">
                      Creato il {formattaData(a.creato_il)} · Ultimo uso: {a.ultimo_uso ? formattaDataOra(a.ultimo_uso) : 'mai'} ·{' '}
                      {abilitati.length === 0
                        ? 'sola lettura'
                        : abilitati.map((x) => `${DESCRIZIONI_AZIONI[x].etichetta.toLowerCase()} (${ETICHETTE_LIVELLO[permessi[x]].toLowerCase()})`).join(', ')}
                    </p>
                  </div>
                  {a.attivo ? (
                    <PulsanteAzione azione={impostaAttivo} campi={{ agente: a.id, attivo: 'false' }} etichetta="Sospendi"
                      variante="destructive" etichettaAccessibile={`Sospendi ${a.nome}`}
                      conferma={{
                        titolo: `Sospendere ${a.nome}?`,
                        testo: 'Finché è sospeso, tutte le richieste con i suoi token vengono rifiutate. Puoi riattivarlo quando vuoi.',
                        pulsante: 'Sospendi',
                      }} />
                  ) : (
                    <PulsanteAzione azione={impostaAttivo} campi={{ agente: a.id, attivo: 'true' }} etichetta="Riattiva"
                      etichettaAccessibile={`Riattiva ${a.nome}`} />
                  )}
                </CardHeader>
                <CardContent className="grid gap-6">
                  <ModuloPermessi agente={a.id} nome={a.nome} permessi={permessi} />

                  <div className="grid gap-3">
                    <h3 className="text-sm font-medium">Token di accesso</h3>
                    {suoiToken.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nessun token: senza token l&apos;agente non può usare l&apos;API.</p>
                    ) : (
                      <Table>
                        <THead>
                          <TR>
                            <TH>Nome</TH>
                            <TH>Prefisso</TH>
                            <TH>Stato</TH>
                            <TH className="hidden md:table-cell">Creato</TH>
                            <TH className="hidden md:table-cell">Ultimo uso</TH>
                            <TH><span className="sr-only">Azioni</span></TH>
                          </TR>
                        </THead>
                        <TBody>
                          {suoiToken.map((t) => (
                            <TR key={t.id}>
                              <TD className="font-medium">
                                {t.nome}
                                <span className="block text-xs font-normal text-muted-foreground md:hidden">
                                  Ultimo uso: {t.ultimo_uso_il ? formattaDataOra(t.ultimo_uso_il) : 'mai'}
                                </span>
                              </TD>
                              <TD><code className="font-mono text-xs">{t.prefisso}…</code></TD>
                              <TD><StatoToken t={t} adesso={adesso} /></TD>
                              <TD className="hidden whitespace-nowrap md:table-cell">{formattaData(t.creato_il)}</TD>
                              <TD className="hidden whitespace-nowrap md:table-cell">{t.ultimo_uso_il ? formattaDataOra(t.ultimo_uso_il) : 'mai'}</TD>
                              <TD className="text-right">
                                {!t.revocato_il && (
                                  <PulsanteAzione azione={revocaToken} campi={{ token: t.id }} etichetta="Revoca" variante="destructive"
                                    etichettaAccessibile={`Revoca il token ${t.nome} (${t.prefisso})`}
                                    conferma={{
                                      titolo: `Revocare il token "${t.nome}"?`,
                                      testo: 'Le richieste con questo token verranno rifiutate subito. Non si può annullare: per ricollegare l\'agente crea un nuovo token.',
                                      pulsante: 'Revoca il token',
                                    }} />
                                )}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    )}
                    <ModuloNuovoToken agente={a.id} nome={a.nome} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Nuovo account agente</CardTitle>
                <CardDescription>Per esempio uno per Claude Cowork. Puoi crearne più d&apos;uno, con permessi diversi.</CardDescription>
              </div>
            </CardHeader>
            <CardContent><ModuloNuovoAgente /></CardContent>
          </Card>
        </section>

        {/* Azioni ------------------------------------------------------------------------- */}
        <Card id="azioni" className="scroll-mt-20">
          <CardHeader>
            <div>
              <CardTitle>Azioni degli agenti</CardTitle>
              <CardDescription>
                Tutto ciò che gli agenti hanno fatto, dal più recente. Le modifiche agli indicatori e ai compiti degli ultimi {GIORNI_ANNULLAMENTO} giorni
                si possono annullare, se nel frattempo nessuno le ha cambiate di nuovo.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0">
            <form method="get" action="/studio/agenti#azioni" className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end" aria-label="Filtra le azioni degli agenti">
              <div className="grid gap-1.5">
                <Label htmlFor="filtro-dal">Dal</Label>
                <Input id="filtro-dal" name="dal" type="date" defaultValue={filtri.dal ?? ''} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filtro-al">Al</Label>
                <Input id="filtro-al" name="al" type="date" defaultValue={filtri.al ?? ''} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filtro-tipo">Tipo</Label>
                <Select id="filtro-tipo" name="tipo" defaultValue={filtri.tipo ?? ''}>
                  <option value="">Tutti i tipi</option>
                  {Object.entries(AZIONI_REGISTRO_AGENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filtro-agente">Agente</Label>
                <Select id="filtro-agente" name="agente" defaultValue={filtri.agente ?? ''}>
                  <option value="">Tutti gli agenti</option>
                  {agenti.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="outline">Filtra</Button>
                <Button asChild variant="ghost"><Link href="/studio/agenti#azioni">Azzera</Link></Button>
              </div>
            </form>

            {azioni.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna azione degli agenti{filtri.dal || filtri.al || filtri.tipo || filtri.agente ? ' con questi filtri' : ''}.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Quando</TH>
                    <TH className="hidden md:table-cell">Agente</TH>
                    <TH className="hidden md:table-cell">Tipo</TH>
                    <TH>Cosa ha fatto</TH>
                    <TH>Annullamento</TH>
                  </TR>
                </THead>
                <TBody>
                  {azioni.map((r) => {
                    const motivo = motivoNonAnnullabile(r, adesso)
                    const descrizione = descriviVoceRegistro(r.azione, r.dettagli)
                    const tipo = AZIONI_REGISTRO_AGENTE[r.azione as keyof typeof AZIONI_REGISTRO_AGENTE] ?? r.azione
                    const link = r.entita === 'compito' && r.entita_id ? `/compiti/${r.entita_id}`
                      : r.entita === 'cliente' && r.entita_id ? `/clienti/${r.entita_id}` : null
                    return (
                      <TR key={r.id}>
                        <TD className="align-top">
                          <span className="whitespace-nowrap">{formattaDataOra(r.creato_il)}</span>
                          <span className="block text-xs text-muted-foreground md:hidden">{r.agente ?? 'Agente'} · {tipo}</span>
                        </TD>
                        <TD className="hidden align-top md:table-cell"><span className="inline-flex items-center gap-1"><Bot className="size-3.5" aria-hidden /> {r.agente ?? 'Agente'}</span></TD>
                        <TD className="hidden align-top md:table-cell">{tipo}</TD>
                        <TD className="min-w-56 max-w-md align-top break-words">
                          {descrizione}
                          {link && <> · <Link href={link} className="text-primary underline-offset-4 hover:underline">Apri</Link></>}
                        </TD>
                        <TD className="align-top">
                          {r.annullato_il ? (
                            <Badge variant="neutro"><Undo2 aria-hidden /> Annullata il {formattaDataOra(r.annullato_il)}{r.annullato_da_nome ? ` da ${r.annullato_da_nome}` : ''}</Badge>
                          ) : motivo ? (
                            <p className="max-w-xs text-xs text-muted-foreground">{motivo}</p>
                          ) : (
                            <PulsanteAzione azione={annulla} campi={{ azione: r.id }} etichetta="Annulla" etichettaAccessibile={`Annulla: ${descrizione}`}
                              conferma={{
                                titolo: 'Annullare questa azione dell\'agente?',
                                testo: `${descrizione}. Il valore di prima viene ripristinato con il tuo nome e resta traccia di tutto nello storico.`,
                                pulsante: 'Sì, annulla l\'azione',
                                indietro: 'No, lascia com\'è',
                              }} />
                          )}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
            {azioni.length === 200 && <p className="text-xs text-muted-foreground">Sono mostrate le ultime 200 azioni: usa i filtri per restringere.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
