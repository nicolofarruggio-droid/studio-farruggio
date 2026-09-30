import Link from 'next/link'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { ArrowLeft, Bot, CircleSlash, Lock, Undo2 } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import {
  commentiCompito, documentiCompito, eventiCompito, leggiCompito, nomiPerCronologia,
} from '@/lib/dati/scheda-compito'
import { limiteDocumenti } from '@/lib/documenti'
import { UUID_VALIDO } from '@/lib/documenti/regole'
import { formattaDataOra } from '@/lib/date'
import { Intestazione } from '@/components/intestazione'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BadgePriorita, BadgeStato, Scadenza } from '@/components/stato-compito'
import { AzioniCompito } from '../_componenti/azioni-compito'
import { ElencoDocumenti } from '../_componenti/documenti'
import { CaricaDocumenti } from '../_componenti/carica-documenti'
import { ElencoCommenti } from '../_componenti/commenti'
import { ModuloCommento } from '../_componenti/modulo-commento'
import { Cronologia } from '../_componenti/cronologia'
import { AvvisoModifiche } from '../_componenti/avviso-modifiche'

const carica = cache(async (id: string) => {
  const { persona } = await richiediUtente()
  if (!UUID_VALIDO.test(id)) return null
  return conUtente(persona, async (tx) => {
    const compito = await leggiCompito(tx, id)
    if (!compito) return null
    const [documenti, commenti, eventi] = await Promise.all([documentiCompito(tx, id), commentiCompito(tx, id), eventiCompito(tx, id)])
    const clientiCitati = [...new Set(eventi.flatMap((e) => {
      const c = (e.dati as { cliente?: { prima?: string; dopo?: string } }).cliente
      return c ? [c.prima, c.dopo].filter((x): x is string => !!x) : []
    }))]
    const nomi = await nomiPerCronologia(tx, clientiCitati)
    return { compito, documenti, commenti, eventi, nomi }
  })
})

export async function generateMetadata({ params }: PageProps<'/compiti/[id]'>) {
  const dati = await carica((await params).id)
  return { title: dati ? `${dati.compito.titolo} · Compito` : 'Compito non trovato' }
}

function Voce({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{nome}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/** Scheda compito (sezioni 8 e 9): stato e azioni, documenti sempre visibili, commenti e cronologia. */
export default async function PaginaCompito({ params, searchParams }: PageProps<'/compiti/[id]'>) {
  const { id } = await params
  const { utente } = await richiediUtente()
  const dati = await carica(id)
  if (!dati) notFound()
  const { compito: k, documenti, commenti, eventi, nomi } = dati
  const q = await searchParams
  const aperto = k.stato === 'assegnato' || k.stato === 'in_lavorazione' || k.stato === 'pronto_revisione'
  const rimandato = k.rimandato_motivo !== null && k.stato === 'in_lavorazione'

  return (
    <>
      <Intestazione
        titolo={k.titolo}
        descrizione={
          <span className="flex flex-wrap items-center gap-2">
            <BadgeStato stato={k.stato} />
            <BadgePriorita priorita={k.priorita} />
            <span>{k.cliente ?? 'Senza cliente'}</span>
            <span aria-hidden>·</span>
            <Scadenza scadenza={k.scadenza} conOrario={k.scadenza_con_orario} chiuso={!aperto} />
          </span>
        }
        azioni={<Button asChild variant="outline"><Link href="/compiti"><ArrowLeft /> Tutti i compiti</Link></Button>}
      />

      <div className="grid gap-4">
        {q.esito === 'modificato' && <AvvisoModifiche />}

        {rimandato && (
          <Alert variant="avviso" className="border-2" role="alert">
            <Undo2 aria-hidden />
            <div className="grid gap-1.5">
              <p className="font-semibold">
                Rimandato indietro da {k.rimandato_da_nome ?? 'chi controlla il compito'}
                {k.rimandato_il && ` il ${formattaDataOra(k.rimandato_il)}`}
              </p>
              {k.rimandato_motivo ? (
                <p className="whitespace-pre-wrap break-words">{k.rimandato_motivo}</p>
              ) : (
                <p className="text-muted-foreground">Nessuna spiegazione scritta: chiedi chiarimenti nei commenti.</p>
              )}
              <p className="text-xs text-muted-foreground">Quando hai sistemato, segna di nuovo il compito &quot;pronto per revisione&quot;.</p>
            </div>
          </Alert>
        )}

        {k.stato === 'annullato' && (
          <Alert variant="pericolo" role="status">
            <CircleSlash aria-hidden />
            <div className="grid gap-1">
              <p className="font-semibold">Compito annullato{k.annullato_il && ` il ${formattaDataOra(k.annullato_il)}`}</p>
              {k.motivo_annullamento && <p className="whitespace-pre-wrap break-words">Motivo: {k.motivo_annullamento}</p>}
            </div>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Azioni</CardTitle>
          </CardHeader>
          <CardContent>
            <AzioniCompito
              compito={k.id}
              stato={k.stato}
              puoLavorare={k.puo_lavorare}
              puoControllare={k.puo_controllare}
              sonoAssegnatario={k.sono_assegnatario}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid content-start gap-4 lg:col-span-2">
            <Card>
              <CardHeader><CardTitle>Descrizione</CardTitle></CardHeader>
              <CardContent>
                {k.descrizione ? (
                  <p className="text-sm whitespace-pre-wrap break-words">{k.descrizione}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna descrizione.</p>
                )}
              </CardContent>
            </Card>

            <Card id="documenti">
              <CardHeader>
                <div>
                  <CardTitle>Documenti ({documenti.length})</CardTitle>
                  <CardDescription>Restano sempre nel compito, anche quando è chiuso. Si aprono con un link valido pochi minuti.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ElencoDocumenti documenti={documenti} />
                {aperto && k.puo_caricare ? (
                  <CaricaDocumenti compito={k.id} limiteByte={limiteDocumenti()} />
                ) : !aperto ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="size-4" aria-hidden /> Il compito è chiuso: per aggiungere documenti va riaperto.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card id="commenti">
              <CardHeader><CardTitle>Commenti ({commenti.length})</CardTitle></CardHeader>
              <CardContent className="grid gap-5">
                <ElencoCommenti commenti={commenti} io={utente.id} />
                {k.puo_commentare ? (
                  <ModuloCommento compito={k.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">Puoi leggere i commenti, ma non scriverne su questo compito.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-4">
            <Card>
              <CardHeader><CardTitle>Dettagli</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-3">
                  <Voce nome="Stato"><BadgeStato stato={k.stato} /></Voce>
                  <Voce nome="Priorità">{k.priorita === 'normale' ? 'Normale' : <BadgePriorita priorita={k.priorita} />}</Voce>
                  <Voce nome="Scadenza"><Scadenza scadenza={k.scadenza} conOrario={k.scadenza_con_orario} chiuso={!aperto} /></Voce>
                  <Voce nome="Cliente">
                    {!k.cliente_id ? 'Senza cliente'
                      : k.cliente_visibile ? <Link href={`/clienti/${k.cliente_id}`} className="font-medium text-primary hover:underline">{k.cliente}</Link>
                        : k.cliente}
                  </Voce>
                  <Voce nome="Assegnato a">
                    {k.assegnatari.length ? k.assegnatari.map((a) => a.nome + (a.id === utente.id ? ' (tu)' : '')).join(', ') : 'Nessuno'}
                  </Voce>
                  <Voce nome="Creato da">
                    {k.creato_da_agente && <><Bot className="inline size-4 align-[-3px]" aria-hidden /> agente · </>}
                    {k.creato_da_nome ?? 'Utente non più presente'}
                    {k.creato_da === utente.id && ' (tu)'}
                    <span className="block text-xs text-muted-foreground">il {formattaDataOra(k.creato_il)}</span>
                  </Voce>
                  {k.stato === 'completato' && k.completato_il && (
                    <Voce nome="Completato">
                      il {formattaDataOra(k.completato_il)}
                      {k.completato_da_nome && <span className="block text-xs text-muted-foreground">chiuso da {k.completato_da_nome}</span>}
                    </Voce>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card id="cronologia">
              <CardHeader><CardTitle>Cronologia</CardTitle></CardHeader>
              <CardContent className="pl-7">
                <Cronologia eventi={eventi} nomi={nomi} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
