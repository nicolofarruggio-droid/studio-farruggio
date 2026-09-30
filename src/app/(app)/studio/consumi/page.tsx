import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Coins, Info, Sparkles } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { consumiAI, type RigaConsumi } from '@/lib/dati/studio'
import { oggiISO } from '@/lib/date'
import { numero } from '@/lib/utils'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Alert } from '@/components/ui/alert'

export const metadata = { title: 'Consumi AI' }

const FUNZIONI: Record<RigaConsumi['funzione'], string> = {
  importazione: 'Importazione clienti (lettura del file)',
  riassunto_email: 'Riassunto delle email in arrivo',
  riassunto_incollato: 'Riassunto di un\'email incollata',
}
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const dollari = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const nomeMese = (m: string) => {
  const [a, mm] = m.split('-').map(Number)
  return `${MESI[mm - 1]} ${a}`
}

type Totale = { chiamate: number; token_ingresso: number; token_uscita: number; costo: number; errori: number }
const somma = (righe: RigaConsumi[]): Totale =>
  righe.reduce(
    (t, r) => ({
      chiamate: t.chiamate + r.chiamate,
      token_ingresso: t.token_ingresso + r.token_ingresso,
      token_uscita: t.token_uscita + r.token_uscita,
      costo: t.costo + r.costo,
      errori: t.errori + r.errori,
    }),
    { chiamate: 0, token_ingresso: 0, token_uscita: 0, costo: 0, errori: 0 },
  )

function Riquadro({ titolo, valore, icona: Icona }: { titolo: string; valore: string; icona: typeof Coins }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icona className="size-5" aria-hidden /></span>
      <span className="grid min-w-0">
        <span className="text-sm text-muted-foreground">{titolo}</span>
        <span className="text-xl leading-tight font-semibold tabular-nums">{valore}</span>
      </span>
    </div>
  )
}

export default async function PaginaConsumi() {
  const { persona } = await richiediAdmin()
  const righe = await conUtente(persona, (tx) => consumiAI(tx, 12))
  const meseCorrente = oggiISO().slice(0, 7)
  const correnti = righe.filter((r) => r.mese === meseCorrente)
  const totale = somma(correnti)
  const mesi = [...new Set(righe.map((r) => r.mese))].sort().reverse()

  return (
    <>
      <Intestazione
        titolo="Consumi AI"
        descrizione="Quante volte lo studio ha usato le funzioni AI, con token e costo stimato. Nessun contenuto: solo conteggi."
      />
      <div className="grid grid-cols-1 gap-6">
        <Alert variant="info">
          <Info aria-hidden />
          <p>
            Il consumo AI è pagato dalla piattaforma ed è compreso nell&apos;abbonamento dello studio: qui lo vedi solo per
            trasparenza. Il costo è una stima in dollari calcolata sui prezzi del modello al momento della chiamata.
          </p>
        </Alert>

        <section aria-labelledby="titolo-mese" className="grid gap-3">
          <h2 id="titolo-mese" className="text-base font-semibold">Questo mese ({nomeMese(meseCorrente)})</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Riquadro titolo="Chiamate" valore={numero.format(totale.chiamate)} icona={Sparkles} />
            <Riquadro titolo="Token in ingresso" valore={numero.format(totale.token_ingresso)} icona={ArrowDownToLine} />
            <Riquadro titolo="Token in uscita" valore={numero.format(totale.token_uscita)} icona={ArrowUpFromLine} />
            <Riquadro titolo="Costo stimato" valore={dollari.format(totale.costo)} icona={Coins} />
            <Riquadro titolo="Errori" valore={numero.format(totale.errori)} icona={AlertTriangle} />
          </div>
        </section>

        <Card aria-labelledby="titolo-storico">
          <CardHeader>
            <div>
              <CardTitle id="titolo-storico">Per mese e per funzione</CardTitle>
              <CardDescription>Ultimi 12 mesi.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0 pb-2">
            {mesi.length === 0 ? (
              <p className="px-5 pb-3 text-sm text-muted-foreground">Nessuna chiamata AI negli ultimi 12 mesi.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Mese</TH>
                    <TH>Funzione</TH>
                    <TH className="text-right">Chiamate</TH>
                    <TH className="text-right">Token in ingresso</TH>
                    <TH className="text-right">Token in uscita</TH>
                    <TH className="text-right">Costo stimato</TH>
                    <TH className="text-right">Errori</TH>
                  </TR>
                </THead>
                <TBody>
                  {mesi.flatMap((m) => {
                    const delMese = righe.filter((r) => r.mese === m)
                    const t = somma(delMese)
                    return [
                      ...delMese.map((r) => (
                        <TR key={`${m}-${r.funzione}`}>
                          <TD className="text-sm capitalize">{nomeMese(m)}</TD>
                          <TD className="text-sm">{FUNZIONI[r.funzione] ?? r.funzione}</TD>
                          <TD className="text-right tabular-nums">{numero.format(r.chiamate)}</TD>
                          <TD className="text-right tabular-nums">{numero.format(r.token_ingresso)}</TD>
                          <TD className="text-right tabular-nums">{numero.format(r.token_uscita)}</TD>
                          <TD className="text-right tabular-nums">{dollari.format(r.costo)}</TD>
                          <TD className={`text-right tabular-nums ${r.errori ? 'font-semibold text-pericolo' : ''}`}>{numero.format(r.errori)}</TD>
                        </TR>
                      )),
                      <TR key={`${m}-totale`} className="bg-muted/40 font-medium">
                        <TD className="text-sm capitalize">{nomeMese(m)}</TD>
                        <TD className="text-sm">Totale del mese</TD>
                        <TD className="text-right tabular-nums">{numero.format(t.chiamate)}</TD>
                        <TD className="text-right tabular-nums">{numero.format(t.token_ingresso)}</TD>
                        <TD className="text-right tabular-nums">{numero.format(t.token_uscita)}</TD>
                        <TD className="text-right tabular-nums">{dollari.format(t.costo)}</TD>
                        <TD className="text-right tabular-nums">{numero.format(t.errori)}</TD>
                      </TR>,
                    ]
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
