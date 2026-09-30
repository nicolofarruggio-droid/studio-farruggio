import Link from 'next/link'
import { AlertCircle, CheckCircle2, Clock, FlaskConical, Info, Mail, MailCheck, MailWarning, MailX } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { formattaData, formattaDataOra, formattaGiorno, formattaOra, oggiISO } from '@/lib/date'
import { conversazioniDiProva, gmailSimulato } from '@/lib/email-lettura/gmail-prova'
import { emailIgnorateRecenti, GIORNI_IGNORATE } from '@/lib/email-lettura/ignorate'
import { configControlli, descriviOrari, prossimoControllo } from '@/lib/email-lettura/orari'
import { Intestazione } from '@/components/intestazione'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CollegaMittente } from './collega-mittente'
import { ModuloCollegaProva, ModuloSimulaEmail, PulsanteControllaOra } from './moduli-prova'
import { ElenchiPermessi } from './permessi'
import { PulsanteScollega } from './pulsante-scollega'

export const metadata = { title: 'La mia email' }

type Casella = {
  id: string
  stato: 'collegata' | 'non_collegata' | 'da_ricollegare'
  indirizzo: string | null
  collegata_il: Date | null
  ultimo_controllo: Date | null
  ultimo_errore: string | null
}
type Controllo = { eseguito_il: Date; email_nuove: number; associate: number; ignorate: number; errori: number }

const ERRORI: Record<string, string> = {
  stato: 'Il collegamento non è andato a buon fine: la richiesta è scaduta o non è valida. Riprova da «Collega la tua email».',
  annullato: 'Hai annullato il collegamento sulla pagina di Google: la casella non è stata collegata.',
  permesso: 'Google non ha concesso esattamente il permesso di sola lettura richiesto: per sicurezza il collegamento è stato annullato e l\'accesso revocato. Riprova.',
  google: 'Google non ha risposto correttamente: la casella non è stata collegata. Riprova tra qualche minuto.',
  gia_collegata: 'Questa casella Gmail è già collegata da un\'altra persona: ognuno può collegare solo la propria.',
  non_attiva: 'La lettura automatica delle email non è attiva per il tuo studio: la casella non è stata collegata.',
}

function quando(d: Date): string {
  const giorno = oggiISO(d)
  if (giorno === oggiISO()) return `oggi alle ${formattaOra(d)}`
  if (giorno === oggiISO(new Date(Date.now() + 86_400_000))) return `domani alle ${formattaOra(d)}`
  return `${formattaGiorno(d)} alle ${formattaOra(d)}`
}

function StatoCasella({ stato }: { stato: Casella['stato'] }) {
  if (stato === 'collegata') return <Badge variant="successo"><MailCheck aria-hidden /> Collegata in sola lettura</Badge>
  if (stato === 'da_ricollegare') return <Badge variant="avviso"><MailWarning aria-hidden /> Da ricollegare</Badge>
  return <Badge variant="neutro"><MailX aria-hidden /> Non collegata</Badge>
}

function Numero({ etichetta, valore, pericolo }: { etichetta: string; valore: number; pericolo?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${pericolo && valore > 0 ? 'text-pericolo' : ''}`}>{valore}</dd>
    </div>
  )
}

export default async function PaginaLaMiaEmail({ searchParams }: PageProps<'/email'>) {
  const { persona, utente, studio } = await richiediUtente()
  const sp = await searchParams
  const prova = gmailSimulato()
  const cfg = configControlli()

  const { casella, controllo, inAttesa, nonRiuscite, riassunte, clienti } = await conUtente(persona, async (tx) => {
    const [casella] = await tx<Casella[]>`
      select id, stato, indirizzo, collegata_il, ultimo_controllo, ultimo_errore
      from public.caselle_email where utente_id = ${utente.id}`
    if (!casella) return { casella: null, controllo: null, inAttesa: 0, nonRiuscite: 0, riassunte: 0, clienti: [] }
    const [[controllo], [conti], clienti] = await Promise.all([
      tx<Controllo[]>`
        select eseguito_il, email_nuove, associate, ignorate, errori from public.controlli_email
        where casella_id = ${casella.id} order by eseguito_il desc limit 1`,
      tx<{ in_attesa: number; non_riuscite: number; riassunte: number }[]>`
        select count(*) filter (where esito in ('in_attesa', 'da_rielaborare') and tentativi < 5)::int as in_attesa,
               count(*) filter (where esito in ('in_attesa', 'da_rielaborare') and tentativi >= 5)::int as non_riuscite,
               count(*) filter (where esito = 'associata' and elaborata_il >= ${casella.collegata_il ?? new Date(0)})::int as riassunte
        from public.email_elaborate where casella_id = ${casella.id}`,
      // i clienti su cui l'utente può lavorare (per "Collega a un cliente")
      casella.stato === 'collegata'
        ? tx<{ id: string; nome: string }[]>`
            select id, nome_visualizzazione as nome from public.clienti
            where public.puo_lavorare_cliente(id) order by lower(nome_visualizzazione)`
        : Promise.resolve([] as { id: string; nome: string }[]),
    ])
    return { casella, controllo: controllo ?? null, inAttesa: conti.in_attesa, nonRiuscite: conti.non_riuscite, riassunte: conti.riassunte, clienti }
  })

  const collegata = casella?.stato === 'collegata'
  const ignorate = collegata ? await emailIgnorateRecenti(persona) : null
  const prossimo = collegata && studio.lettura_email_attiva ? prossimoControllo(new Date(), casella.ultimo_controllo, cfg) : null
  const conversazioni = prova && collegata && casella.indirizzo
    ? (await conversazioniDiProva(casella.indirizzo)).map((c) => ({
        threadId: c.threadId,
        descrizione: `${c.oggetto || '(senza oggetto)'} — ${c.mittente} — ${formattaDataOra(c.data)}`,
      }))
    : []

  return (
    <>
      <Intestazione
        titolo="La mia email"
        descrizione="La tua casella collegata in sola lettura: le email dei clienti diventano riassunti nelle loro Comunicazioni."
      />

      <div className="grid gap-6">
        {sp.collegata === '1' && (
          <Alert variant="successo">
            <CheckCircle2 aria-hidden />
            <p>Casella collegata in sola lettura. Da ora le email che arrivano dai clienti finiranno, riassunte, nelle loro Comunicazioni. Le email già presenti nella casella non vengono lette.</p>
          </Alert>
        )}
        {sp.scollegata === '1' && (
          <Alert variant="successo">
            <CheckCircle2 aria-hidden />
            <p>Casella scollegata: l&apos;accesso concesso a Google è stato revocato e i controlli si sono fermati. Le comunicazioni già scritte restano nelle schede dei clienti.</p>
          </Alert>
        )}
        {typeof sp.errore === 'string' && ERRORI[sp.errore] && (
          <Alert variant="pericolo">
            <AlertCircle aria-hidden />
            <p>{ERRORI[sp.errore]}</p>
          </Alert>
        )}
        {!studio.lettura_email_attiva && (
          <Alert>
            <Info aria-hidden />
            <p>
              La lettura automatica delle email è <strong>spenta</strong> per il tuo studio: finché l&apos;admin non la attiva,
              le caselle non vengono controllate.
            </p>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>Stato della casella</CardTitle>
              <CardDescription>Controlli {descriviOrari(cfg)}.</CardDescription>
            </div>
            <StatoCasella stato={casella?.stato ?? 'non_collegata'} />
          </CardHeader>
          <CardContent className="grid gap-5">
            {!casella || casella.stato === 'non_collegata' ? (
              <Alert variant="avviso" className="items-center">
                <MailWarning aria-hidden />
                <p className="flex-1">La tua casella email non è collegata: le email che ricevi dai clienti non finiscono nelle loro Comunicazioni.</p>
                <Button asChild size="sm"><Link href="/email/collega">Collega la tua email</Link></Button>
              </Alert>
            ) : (
              <>
                {casella.stato === 'da_ricollegare' && (
                  <Alert variant="avviso" className="items-center">
                    <MailWarning aria-hidden />
                    <p className="flex-1">Google ha revocato l&apos;accesso alla tua casella: ricollegala perché le email dei clienti tornino nelle Comunicazioni.</p>
                    <Button asChild size="sm"><Link href="/email/collega">Ricollega la casella</Link></Button>
                  </Alert>
                )}
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Indirizzo</dt><dd className="font-medium break-all">{casella.indirizzo ?? '—'}</dd></div>
                  <div><dt className="text-muted-foreground">Collegata dal</dt><dd className="font-medium">{casella.collegata_il ? formattaDataOra(casella.collegata_il) : '—'}</dd></div>
                  <div><dt className="text-muted-foreground">Permesso concesso a Google</dt><dd className="font-medium">Solo lettura (gmail.readonly)</dd></div>
                  <div><dt className="text-muted-foreground">Email di clienti riassunte dal collegamento</dt><dd className="font-medium tabular-nums">{riassunte}</dd></div>
                  <div>
                    <dt className="text-muted-foreground">Ultimo controllo</dt>
                    <dd className="font-medium">{casella.ultimo_controllo ? formattaDataOra(casella.ultimo_controllo) : 'Non ancora eseguito'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Prossimo controllo</dt>
                    <dd className="flex items-center gap-1.5 font-medium">
                      <Clock className="size-4 text-muted-foreground" aria-hidden />
                      {collegata
                        ? studio.lettura_email_attiva ? (prossimo ? quando(prossimo) : '—') : 'Nessuno: lettura automatica spenta'
                        : 'Nessuno finché la casella non viene ricollegata'}
                    </dd>
                  </div>
                </dl>

                <section aria-labelledby="esito-ultimo" className="grid gap-2">
                  <h3 id="esito-ultimo" className="text-sm font-semibold">
                    Esito dell&apos;ultimo controllo{controllo ? ` (${formattaDataOra(controllo.eseguito_il)})` : ''}
                  </h3>
                  {controllo ? (
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Numero etichetta="Email nuove" valore={controllo.email_nuove} />
                      <Numero etichetta="Associate a clienti" valore={controllo.associate} />
                      <Numero etichetta="Ignorate" valore={controllo.ignorate} />
                      <Numero etichetta="Errori" valore={controllo.errori} pericolo />
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessun controllo eseguito dal collegamento.</p>
                  )}
                  {collegata && casella.ultimo_errore && (
                    <Alert variant="avviso"><MailWarning aria-hidden /><p>{casella.ultimo_errore}</p></Alert>
                  )}
                  {inAttesa > 0 && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-4" aria-hidden />
                      {inAttesa === 1 ? '1 email è in attesa di essere elaborata' : `${inAttesa} email sono in attesa di essere elaborate`} al prossimo controllo.
                    </p>
                  )}
                  {nonRiuscite > 0 && (
                    <p className="flex items-center gap-1.5 text-sm text-pericolo">
                      <AlertCircle className="size-4" aria-hidden />
                      {nonRiuscite === 1 ? '1 email di un cliente non è stata riassunta' : `${nonRiuscite} email di clienti non sono state riassunte`} dopo vari tentativi: controllale direttamente nella casella.
                    </p>
                  )}
                </section>

                <PulsanteScollega indirizzo={casella.indirizzo} />
              </>
            )}
          </CardContent>
        </Card>

        {collegata && ignorate && (
          <Card>
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle>Email ignorate di recente</CardTitle>
                <CardDescription>
                  Email degli ultimi {GIORNI_IGNORATE} giorni che non arrivavano da un indirizzo di un cliente: il loro testo non è stato letto.
                  Mittente, oggetto e data vengono letti ora da Gmail e non sono salvati. Se un mittente è un cliente, collegalo:
                  l&apos;indirizzo viene aggiunto al cliente e le sue email vengono riassunte al prossimo controllo.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {ignorate.stato === 'errore' ? (
                <Alert variant="avviso"><MailWarning aria-hidden /><p>Non è stato possibile leggere le intestazioni da Gmail in questo momento. Riprova più tardi.</p></Alert>
              ) : ignorate.mittenti.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna email ignorata negli ultimi {GIORNI_IGNORATE} giorni.</p>
              ) : (
                <ul className="divide-y" role="list">
                  {ignorate.mittenti.map((m, i) => (
                    <li key={m.indirizzo} className="grid gap-3 py-4 first:pt-0 last:pb-0">
                      <div className="grid gap-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <Mail className="size-4 text-muted-foreground" aria-hidden />
                          <span className="break-all">{m.indirizzo}</span>
                          <Badge variant="neutro">{m.email.length === 1 ? '1 email' : `${m.email.length} email`}</Badge>
                        </p>
                        <ul className="grid gap-0.5 pl-6 text-sm text-muted-foreground">
                          {m.email.map((e) => (
                            <li key={e.gmailId}>
                              <span className="tabular-nums">{formattaData(e.data)} {formattaOra(e.data)}</span> — {e.oggetto || '(senza oggetto)'}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <CollegaMittente indirizzo={m.indirizzo} gmailIds={m.email.map((e) => e.gmailId)} clienti={clienti} indice={i} />
                    </li>
                  ))}
                </ul>
              )}
              {ignorate.stato === 'ok' && ignorate.senzaIndirizzo > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {ignorate.senzaIndirizzo === 1 ? '1 email non aveva' : `${ignorate.senzaIndirizzo} email non avevano`} un mittente leggibile.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {prova && (
          <Card className="border-dashed">
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle className="flex items-center gap-2"><FlaskConical className="size-5" aria-hidden /> Modalità di prova</CardTitle>
                <CardDescription>
                  Solo sviluppo e test (GMAIL_SIMULATO=1): una casella finta, senza Google, per provare tutto il flusso.
                  Non è disponibile in produzione.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6">
              {!collegata ? (
                <ModuloCollegaProva />
              ) : (
                <>
                  <section aria-labelledby="simula" className="grid gap-3">
                    <h3 id="simula" className="text-sm font-semibold">Simula l&apos;arrivo di un&apos;email</h3>
                    <ModuloSimulaEmail conversazioni={conversazioni} />
                  </section>
                  <section aria-labelledby="controlla" className="grid gap-3 border-t pt-5">
                    <h3 id="controlla" className="text-sm font-semibold">Controllo immediato</h3>
                    <p className="text-sm text-muted-foreground">Esegue subito il controllo di questa casella, come farebbe il processo pianificato.</p>
                    <PulsanteControllaOra />
                  </section>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>Cosa può fare l&apos;AI con la tua casella</CardTitle>
              <CardDescription>
                Le email che non arrivano da un cliente vengono ignorate e il loro testo non viene letto né salvato.
                Nelle Comunicazioni finisce solo il riassunto, con mittente, oggetto e nomi degli allegati: mai il testo integrale o gli allegati.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ElenchiPermessi compatto />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
