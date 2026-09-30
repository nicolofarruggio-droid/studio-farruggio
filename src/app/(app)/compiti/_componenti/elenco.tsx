import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Bot, Paperclip, Undo2 } from 'lucide-react'
import type { RigaCompito } from '@/lib/dati/compiti'
import { statoScadenza, type StatoScadenza } from '@/lib/date'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { BadgePriorita, BadgeStato, Scadenza } from '@/components/stato-compito'
import { COLONNE, queryElenco, type Colonna, type ParametriElenco } from './filtri-url'

const aperto = (k: RigaCompito) => k.stato === 'assegnato' || k.stato === 'in_lavorazione' || k.stato === 'pronto_revisione'

function Rimandato() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-avviso">
      <Undo2 className="size-3.5" aria-hidden /> Rimandato indietro
    </span>
  )
}

function Intestazione({ colonna, parametri, className }: { colonna: Colonna; parametri: ParametriElenco; className?: string }) {
  const attiva = parametri.ordina === colonna
  const verso = attiva && parametri.verso === 'asc' ? 'desc' : 'asc'
  const Icona = !attiva ? ArrowUpDown : parametri.verso === 'asc' ? ArrowUp : ArrowDown
  return (
    <TH className={className} aria-sort={attiva ? (parametri.verso === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link
        href={`/compiti${queryElenco(parametri, { ordina: colonna === 'scadenza' ? '' : colonna, verso: verso === 'asc' ? '' : 'desc' })}`}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`Ordina per ${COLONNE[colonna].toLowerCase()}, ${verso === 'asc' ? 'crescente' : 'decrescente'}`}
        scroll={false}
      >
        {COLONNE[colonna]} <Icona className="size-3.5" aria-hidden />
      </Link>
    </TH>
  )
}

/** Vista a lista (sezione 9, schermata 4): tabella su schermi larghi, schede impilate sul telefono. */
export function TabellaCompiti({
  compiti, parametri, rimandati,
}: { compiti: RigaCompito[]; parametri: ParametriElenco; rimandati: Set<string> }) {
  return (
    <>
      <div className="hidden rounded-xl border bg-card shadow-xs md:block">
        <Table>
          <THead>
            <TR>
              <Intestazione colonna="titolo" parametri={parametri} />
              <Intestazione colonna="cliente" parametri={parametri} />
              <Intestazione colonna="assegnato" parametri={parametri} />
              <Intestazione colonna="scadenza" parametri={parametri} />
              <Intestazione colonna="priorita" parametri={parametri} />
              <Intestazione colonna="stato" parametri={parametri} />
              <Intestazione colonna="documenti" parametri={parametri} className="text-right" />
            </TR>
          </THead>
          <TBody>
            {compiti.map((k) => (
              <TR key={k.id}>
                <TD className="max-w-80">
                  <Link href={`/compiti/${k.id}`} className="font-medium hover:text-primary hover:underline">{k.titolo}</Link>
                  {(rimandati.has(k.id) || k.creato_da_agente) && (
                    <span className="mt-0.5 flex flex-wrap gap-2">
                      {rimandati.has(k.id) && <Rimandato />}
                      {k.creato_da_agente && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Bot className="size-3.5" aria-hidden /> creato da agente</span>}
                    </span>
                  )}
                </TD>
                <TD className={k.cliente ? '' : 'text-muted-foreground'}>{k.cliente ?? 'Senza cliente'}</TD>
                <TD>{k.assegnatari.map((a) => a.nome).join(', ') || '—'}</TD>
                <TD className="whitespace-nowrap"><Scadenza scadenza={k.scadenza} conOrario={k.scadenza_con_orario} chiuso={!aperto(k)} /></TD>
                <TD>{k.priorita === 'normale' ? <span className="text-sm text-muted-foreground">Normale</span> : <BadgePriorita priorita={k.priorita} />}</TD>
                <TD><BadgeStato stato={k.stato} /></TD>
                <TD className="text-right tabular-nums">
                  {k.documenti > 0 ? (
                    <span className="inline-flex items-center gap-1" aria-label={`${k.documenti} documenti`}><Paperclip className="size-3.5 text-muted-foreground" aria-hidden /> {k.documenti}</span>
                  ) : <span className="text-muted-foreground" aria-label="Nessun documento">0</span>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <ul className="grid gap-2 md:hidden" aria-label="Compiti">
        {compiti.map((k) => <SchedaBreve key={k.id} k={k} rimandato={rimandati.has(k.id)} />)}
      </ul>
    </>
  )
}

function SchedaBreve({ k, rimandato }: { k: RigaCompito; rimandato: boolean }) {
  return (
    <li className="rounded-xl border bg-card p-3 shadow-xs">
      <Link href={`/compiti/${k.id}`} className="grid gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium hover:text-primary hover:underline">{k.titolo}</span>
          <BadgePriorita priorita={k.priorita} />
          {rimandato && <Rimandato />}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{k.cliente ?? 'Senza cliente'}</span>
          <span>→ {k.assegnatari.map((a) => a.nome).join(', ')}</span>
          <Scadenza scadenza={k.scadenza} conOrario={k.scadenza_con_orario} chiuso={!aperto(k)} />
          <BadgeStato stato={k.stato} />
          {k.documenti > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" aria-hidden /> {k.documenti} {k.documenti === 1 ? 'documento' : 'documenti'}</span>}
          {k.creato_da_agente && <span className="inline-flex items-center gap-1"><Bot className="size-3.5" aria-hidden /> da agente</span>}
        </span>
      </Link>
    </li>
  )
}

type Gruppo = StatoScadenza | 'chiusi'

const GRUPPI: { chiave: Gruppo; titolo: string; vuoto: string | null }[] = [
  { chiave: 'scaduto', titolo: 'In ritardo', vuoto: 'Nessun compito in ritardo.' },
  { chiave: 'oggi', titolo: 'Oggi', vuoto: 'Nessun compito scade oggi.' },
  { chiave: 'settimana', titolo: 'Questa settimana', vuoto: 'Nessun compito nei prossimi 7 giorni.' },
  { chiave: 'dopo', titolo: 'Più avanti', vuoto: 'Nessun compito più avanti.' },
  { chiave: 'nessuna', titolo: 'Senza scadenza', vuoto: 'Nessun compito senza scadenza.' },
  // compiti già chiusi con la scadenza passata: non sono "in ritardo" (compaiono solo filtrando anche i chiusi)
  { chiave: 'chiusi', titolo: 'Chiusi, con la scadenza passata', vuoto: null },
]

/** Vista per scadenza (sezione 9): in ritardo, oggi, questa settimana, più avanti, senza scadenza (in fondo). */
export function VistaScadenze({ compiti, rimandati }: { compiti: RigaCompito[]; rimandati: Set<string> }) {
  const adesso = new Date()
  const perGruppo = new Map<Gruppo, RigaCompito[]>()
  for (const k of compiti) {
    let g: Gruppo = statoScadenza(k.scadenza, adesso)
    if (g === 'scaduto' && !aperto(k)) g = 'chiusi'
    perGruppo.set(g, [...(perGruppo.get(g) ?? []), k])
  }
  return (
    <div className="grid gap-6">
      {GRUPPI.map(({ chiave, titolo, vuoto }) => {
        const elenco = perGruppo.get(chiave) ?? []
        if (vuoto === null && elenco.length === 0) return null
        return (
          <section key={chiave} aria-labelledby={`gruppo-${chiave}`} className="grid gap-2">
            <h2 id={`gruppo-${chiave}`} className={`flex items-center gap-2 text-base font-semibold ${chiave === 'scaduto' && elenco.length ? 'text-pericolo' : ''}`}>
              {titolo} <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{elenco.length}</span>
            </h2>
            {elenco.length === 0 ? (
              <p className="text-sm text-muted-foreground">{vuoto}</p>
            ) : (
              <ul className="grid gap-2" aria-label={titolo}>
                {elenco.map((k) => <SchedaBreve key={k.id} k={k} rimandato={rimandati.has(k.id)} />)}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
