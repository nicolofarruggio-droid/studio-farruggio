import Link from 'next/link'
import { AlertTriangle, CalendarX2, Eye, ClipboardList, Mail, MailCheck, MailWarning, ArrowRight } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente, nomeCompleto } from '@/lib/auth/sessione'
import { statisticheCollaboratori, contatoriRitardi } from '@/lib/dati/dashboard'
import { elencoCompiti } from '@/lib/dati/compiti'
import { elencoClienti } from '@/lib/dati/clienti'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tessera } from '@/components/dashboard/tessera'
import { BannerEmail } from '@/components/dashboard/banner-email'
import { ElencoCompitiCompatto } from '@/components/dashboard/elenco-compiti'
import { VistaCollaboratore } from '@/components/dashboard/vista-collaboratore'
import { BadgeIndicatore } from '@/components/indicatore'

export const metadata = { title: 'Dashboard' }

function StatoCasella({ stato }: { stato: string }) {
  if (stato === 'collegata') return <Badge variant="successo"><MailCheck aria-hidden /> Collegata</Badge>
  if (stato === 'da_ricollegare') return <Badge variant="avviso"><MailWarning aria-hidden /> Da ricollegare</Badge>
  return <Badge variant="neutro"><Mail aria-hidden /> Non collegata</Badge>
}

export default async function PaginaDashboard() {
  const { persona, utente, studio } = await richiediUtente()
  const casella = await conUtente(persona, async (tx) => {
    const [c] = await tx<{ stato: string }[]>`select stato from public.caselle_email where utente_id = ${utente.id}`
    return c?.stato ?? 'non_collegata'
  })

  if (utente.ruolo !== 'admin') {
    return (
      <>
        <Intestazione titolo={`Ciao, ${utente.nome}`} descrizione="Cosa è in ritardo e cosa scade oggi, a colpo d'occhio." />
        <BannerEmail stato={casella} />
        {await conUtente(persona, (tx) => VistaCollaboratore({ tx, utenteId: utente.id, studio }))}
      </>
    )
  }

  const { collaboratori, ritardi, pronti, scaduti, aperti, clientiRitardo } = await conUtente(persona, async (tx) => {
    const [collaboratori, ritardi, pronti, scaduti, aperti, clientiRitardo] = await Promise.all([
      statisticheCollaboratori(tx),
      contatoriRitardi(tx),
      elencoCompiti(tx, { stato: 'pronto_revisione' }),
      elencoCompiti(tx, { stato: 'aperti', scadenza: 'scaduti' }),
      tx<{ n: number }[]>`select count(*)::int as n from public.compiti where stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')`,
      elencoClienti(tx, { ritardo: 'qualsiasi', ordina: 'iva', verso: 'asc' }),
    ])
    return { collaboratori, ritardi, pronti, scaduti, aperti: aperti[0].n, clientiRitardo }
  })

  return (
    <>
      <Intestazione
        titolo="Dashboard"
        descrizione={`${studio.nome} · clienti indietro con IVA e prima nota, compiti scaduti e da controllare.`}
        azioni={<Button asChild><Link href="/compiti/nuovo">Nuovo compito</Link></Button>}
      />
      <BannerEmail stato={casella} />
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tessera titolo="Clienti in ritardo" valore={ritardi.clienti} dettaglio={`IVA ${ritardi.iva} · Prima nota ${ritardi.prima_nota} · su ${ritardi.totale}`} icona={AlertTriangle} tono="pericolo" href="/clienti?ritardo=qualsiasi" />
          <Tessera titolo="Compiti scaduti" valore={scaduti.length} icona={CalendarX2} tono="pericolo" href="/compiti?scadenza=scaduti" />
          <Tessera titolo="Pronti per revisione" valore={pronti.length} icona={Eye} tono="avviso" href="/compiti?stato=pronto_revisione" />
          <Tessera titolo="Compiti aperti" valore={aperti} icona={ClipboardList} href="/compiti" />
        </div>

        {pronti.length > 0 && (
          <Card className="border-avviso/40">
            <CardHeader>
              <div>
                <CardTitle>Pronti per revisione</CardTitle>
                <CardDescription>I collaboratori hanno finito: controlla e chiudi, oppure rimanda indietro.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0"><ElencoCompitiCompatto compiti={pronti} vuoto="" /></CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Collaboratori</CardTitle>
              <CardDescription>Carico di lavoro e ritardi per persona. &quot;Entra nella vista&quot; mostra la dashboard come la vede lui, in sola lettura.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm"><Link href="/studio/utenti">Utenti e inviti</Link></Button>
          </CardHeader>
          <CardContent className="px-0 pt-0 pb-2">
            <Table>
              <THead>
                <TR>
                  <TH>Collaboratore</TH>
                  <TH className="text-right">Clienti</TH>
                  <TH className="text-right">Compiti aperti</TH>
                  <TH className="text-right">In scadenza (7 gg)</TH>
                  <TH className="text-right">Scaduti</TH>
                  <TH className="text-right">Clienti in ritardo</TH>
                  <TH>Casella email</TH>
                  <TH><span className="sr-only">Azioni</span></TH>
                </TR>
              </THead>
              <TBody>
                {collaboratori.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">
                      {nomeCompleto(c)}
                      {c.ruolo === 'admin' && <span className="ml-2 text-xs font-normal text-muted-foreground">admin</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{c.clienti}</TD>
                    <TD className="text-right tabular-nums">{c.compiti_aperti}</TD>
                    <TD className="text-right tabular-nums">{c.compiti_in_scadenza}</TD>
                    <TD className={`text-right tabular-nums ${c.compiti_scaduti ? 'font-semibold text-pericolo' : ''}`}>{c.compiti_scaduti}</TD>
                    <TD className={`text-right tabular-nums ${c.clienti_in_ritardo ? 'font-semibold text-pericolo' : ''}`}>{c.clienti_in_ritardo}</TD>
                    <TD><StatoCasella stato={c.casella} /></TD>
                    <TD className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/collaboratori/${c.id}`} aria-label={`Entra nella vista di ${nomeCompleto(c)}`}>
                          Entra nella vista <ArrowRight />
                        </Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Clienti in ritardo</CardTitle>
                <CardDescription>Soglia: IVA {studio.soglia_ritardo_iva_mesi} mesi, prima nota {studio.soglia_ritardo_prima_nota_mesi} mesi.</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm"><Link href="/clienti?ritardo=qualsiasi">Vedi tutti</Link></Button>
            </CardHeader>
            <CardContent className="pt-0">
              {clientiRitardo.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Nessun cliente in ritardo. Ottimo lavoro.</p>
              ) : (
                <ul className="divide-y" role="list">
                  {clientiRitardo.slice(0, 10).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0">
                        <Link href={`/clienti/${c.id}`} className="font-medium hover:text-primary hover:underline">{c.ragione_sociale}</Link>
                        <span className="block text-xs text-muted-foreground">{c.referente ?? 'Senza collaboratore'}</span>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {c.iva_in_ritardo && <span className="flex items-center gap-1 text-xs"><span className="text-muted-foreground">IVA</span><BadgeIndicatore valore={c.iva} soglia={studio.soglia_ritardo_iva_mesi} /></span>}
                        {c.prima_nota_in_ritardo && <span className="flex items-center gap-1 text-xs"><span className="text-muted-foreground">Prima nota</span><BadgeIndicatore valore={c.prima_nota} soglia={studio.soglia_ritardo_prima_nota_mesi} /></span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Compiti scaduti</CardTitle>
                <CardDescription>Compiti aperti con la scadenza già passata.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0"><ElencoCompitiCompatto compiti={scaduti.slice(0, 10)} vuoto="Nessun compito scaduto." /></CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
