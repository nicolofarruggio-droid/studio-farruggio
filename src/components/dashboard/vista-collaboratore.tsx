import Link from 'next/link'
import { AlarmClock, CalendarX2, ClipboardList, AlertTriangle, KeyRound } from 'lucide-react'
import type { Tx } from '@/lib/db'
import { elencoClienti } from '@/lib/dati/clienti'
import { elencoCompiti } from '@/lib/dati/compiti'
import { contatoriRitardi } from '@/lib/dati/dashboard'
import { statoScadenza } from '@/lib/date'
import type { Studio } from '@/lib/auth/sessione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { IndicatoreRapido } from '@/components/indicatore-rapido'
import { Tessera } from './tessera'
import { ElencoCompitiCompatto } from './elenco-compiti'

type Accesso = { id: string; persona_id: string; nome: string; livello: 'lettura' | 'completa'; verso: 'ricevuto' | 'concesso' }

/** Dashboard del collaboratore (sezione 9): i miei clienti con i due indicatori e i miei compiti aperti. */
export async function VistaCollaboratore({
  tx, utenteId, studio, sola_lettura = false,
}: { tx: Tx; utenteId: string; studio: Studio; sola_lettura?: boolean }) {
  const [clienti, compiti, assegnatiDaMe, ritardi, accessi, rimandati] = await Promise.all([
    elencoClienti(tx, { soloMiei: utenteId, ordina: 'ragione_sociale' }),
    elencoCompiti(tx, { assegnatiA: utenteId, stato: 'aperti' }),
    elencoCompiti(tx, { creatiDa: utenteId, stato: 'aperti' }),
    contatoriRitardi(tx, utenteId),
    tx<Accesso[]>`
      select a.id, u.id as persona_id, trim(u.nome || ' ' || u.cognome) as nome, a.livello, 'ricevuto' as verso
      from public.accessi_colleghi a join public.utenti u on u.id = a.proprietario_id where a.utente_id = ${utenteId}
      union all
      select a.id, u.id, trim(u.nome || ' ' || u.cognome), a.livello, 'concesso'
      from public.accessi_colleghi a join public.utenti u on u.id = a.utente_id where a.proprietario_id = ${utenteId}`,
    tx<{ id: string }[]>`select id from public.compiti where rimandato_il is not null and stato = 'in_lavorazione'`,
  ])
  const altrui = assegnatiDaMe.filter((k) => !k.assegnatari.some((a) => a.id === utenteId))
  const scaduti = compiti.filter((k) => statoScadenza(k.scadenza) === 'scaduto').length
  const oggi = compiti.filter((k) => statoScadenza(k.scadenza) === 'oggi').length
  const ricevuti = accessi.filter((a) => a.verso === 'ricevuto')
  const concessi = accessi.filter((a) => a.verso === 'concesso')

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tessera titolo="Clienti in ritardo" valore={ritardi.clienti} dettaglio={`IVA ${ritardi.iva} · Prima nota ${ritardi.prima_nota}`} icona={AlertTriangle} tono="pericolo" href={sola_lettura ? undefined : '/clienti?ritardo=qualsiasi'} />
        <Tessera titolo="Compiti scaduti" valore={scaduti} icona={CalendarX2} tono="pericolo" href={sola_lettura ? undefined : '/compiti?scadenza=scaduti'} />
        <Tessera titolo="Scadono oggi" valore={oggi} icona={AlarmClock} tono="avviso" href={sola_lettura ? undefined : '/compiti?scadenza=oggi'} />
        <Tessera titolo="Compiti aperti" valore={compiti.length} icona={ClipboardList} href={sola_lettura ? undefined : '/compiti'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{sola_lettura ? 'Compiti aperti' : 'I miei compiti aperti'}</CardTitle>
              <CardDescription>Ordinati per scadenza.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ElencoCompitiCompatto compiti={compiti} vuoto="Nessun compito aperto." mostraAssegnatari={false} rimandati={new Set(rimandati.map((r) => r.id))} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>{sola_lettura ? 'Clienti assegnati' : 'I miei clienti'}</CardTitle>
              <CardDescription>
                {clienti.length} clienti · {ritardi.clienti} in ritardo{ritardi.da_impostare ? ` · ${ritardi.da_impostare} da impostare` : ''}. {sola_lettura ? '' : 'Clicca su un indicatore per aggiornarlo.'}
              </CardDescription>
            </div>
            {!sola_lettura && <Button asChild variant="outline" size="sm"><Link href="/clienti">Tutti i clienti</Link></Button>}
          </CardHeader>
          <CardContent className="px-0 pt-0 pb-2">
            {clienti.length === 0 ? (
              <p className="px-5 pb-3 text-sm text-muted-foreground">Nessun cliente assegnato.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Cliente</TH>
                    <TH>IVA</TH>
                    <TH>Prima nota</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...clienti]
                    .sort((a, b) => Number(b.iva_in_ritardo || b.prima_nota_in_ritardo) - Number(a.iva_in_ritardo || a.prima_nota_in_ritardo))
                    .map((c) => (
                      <TR key={c.id}>
                        <TD className="max-w-64">
                          <Link href={`/clienti/${c.id}`} className="font-medium hover:text-primary hover:underline">{c.ragione_sociale}</Link>
                          {c.titolare && <p className="truncate text-xs text-muted-foreground">{c.titolare}</p>}
                        </TD>
                        <TD><IndicatoreRapido cliente={c.id} nomeCliente={c.ragione_sociale} tipo="iva" valore={c.iva} soglia={studio.soglia_ritardo_iva_mesi} modificabile={!sola_lettura && c.puo_lavorare} /></TD>
                        <TD><IndicatoreRapido cliente={c.id} nomeCliente={c.ragione_sociale} tipo="prima_nota" valore={c.prima_nota} soglia={studio.soglia_ritardo_prima_nota_mesi} modificabile={!sola_lettura && c.puo_lavorare} /></TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {altrui.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Compiti che hai assegnato</CardTitle>
              <CardDescription>Li segui tu: quando sono pronti per revisione puoi chiuderli o rimandarli indietro.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0"><ElencoCompitiCompatto compiti={altrui} vuoto="" /></CardContent>
        </Card>
      )}

      {(ricevuti.length > 0 || concessi.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" aria-hidden /> Accessi tra colleghi</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1 font-medium">Spazi dei colleghi a cui hai accesso</p>
              {ricevuti.length === 0 ? <p className="text-muted-foreground">Nessuno.</p> : (
                <ul className="list-disc pl-5">
                  {ricevuti.map((a) => (
                    <li key={a.id}>
                      {a.nome} · {a.livello === 'lettura' ? 'solo per vedere' : 'puoi anche lavorarci'}
                      {!sola_lettura && (
                        <span className="ml-2 inline-flex gap-2">
                          <Link href={`/clienti?collaboratore=${a.persona_id}`} className="text-primary hover:underline">clienti</Link>
                          <Link href={`/compiti?collaboratore=${a.persona_id}`} className="text-primary hover:underline">compiti</Link>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 font-medium">Chi ha accesso al tuo spazio</p>
              {concessi.length === 0 ? <p className="text-muted-foreground">Nessuno.</p> : (
                <ul className="list-disc pl-5">
                  {concessi.map((a) => <li key={a.id}>{a.nome} · {a.livello === 'lettura' ? 'solo per vedere' : 'può anche lavorarci'}</li>)}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
