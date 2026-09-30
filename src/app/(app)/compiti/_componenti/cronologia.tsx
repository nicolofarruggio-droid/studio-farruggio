import type { LucideIcon } from 'lucide-react'
import { CheckCheck, CircleDot, CircleSlash, Eye, FilePlus2, MessageSquare, Pencil, Plus, RotateCcw, Undo2, UserRoundCog } from 'lucide-react'
import type { Evento } from '@/lib/dati/scheda-compito'
import { ETICHETTE_PRIORITA, ETICHETTE_STATO, type Priorita, type StatoCompito } from '@/lib/dati/compiti'
import { formattaData, formattaDataOra, partiRoma } from '@/lib/date'
import { formattaDimensione } from '@/lib/utils'

type Nomi = { persone: Record<string, string>; clienti: Record<string, string> }
type Descrizione = { icona: LucideIcon; testo: React.ReactNode; dettagli?: React.ReactNode[]; citazione?: string | null }

const stato = (s: unknown) => ETICHETTE_STATO[s as StatoCompito] ?? String(s ?? '')
const priorita = (p: unknown) => ETICHETTE_PRIORITA[p as Priorita] ?? String(p ?? 'normale')
const persone = (ids: unknown, nomi: Nomi) =>
  (Array.isArray(ids) ? ids : []).map((id) => nomi.persone[String(id)] ?? 'utente non più presente').join(', ') || 'nessuno'
const cliente = (id: unknown, nomi: Nomi) => (id ? nomi.clienti[String(id)] ?? 'un cliente che non puoi vedere' : 'Senza cliente')

/** Scadenza leggibile: la data, e l'ora se non è "fine giornata". */
function scadenza(valore: unknown, conOrario?: boolean): string {
  if (!valore) return 'nessuna scadenza'
  const d = new Date(String(valore))
  if (Number.isNaN(d.getTime())) return 'nessuna scadenza'
  const p = partiRoma(d)
  const fineGiornata = p.ora === 23 && p.minuto === 59
  return (conOrario ?? !fineGiornata) ? formattaDataOra(d) : formattaData(d)
}

function descrivi(e: Evento, nomi: Nomi): Descrizione {
  const d = e.dati as Record<string, unknown>
  switch (e.tipo) {
    case 'creato': {
      const dettagli = [
        `Assegnato a: ${persone(d.assegnatari, nomi)}`,
        `Scadenza: ${scadenza(d.scadenza)}`,
      ]
      if (d.priorita && d.priorita !== 'normale') dettagli.push(`Priorità: ${priorita(d.priorita)}`)
      return { icona: Plus, testo: 'ha creato il compito', dettagli }
    }
    case 'stato': {
      const dopo = d.dopo as StatoCompito
      if (dopo === 'in_lavorazione') {
        return d.prima === 'assegnato'
          ? { icona: CircleDot, testo: 'ha iniziato a lavorare (In lavorazione)' }
          : { icona: CircleDot, testo: `ha rimesso il compito in lavorazione (era ${stato(d.prima)})` }
      }
      if (dopo === 'pronto_revisione') return { icona: Eye, testo: 'ha segnato il compito pronto per revisione' }
      if (dopo === 'completato') return { icona: CheckCheck, testo: 'ha chiuso il compito (Completato)' }
      return { icona: CircleDot, testo: `ha cambiato lo stato: ${stato(d.prima)} → ${stato(dopo)}` }
    }
    case 'rimandato':
      return {
        icona: Undo2,
        testo: 'ha rimandato indietro il compito (torna In lavorazione)',
        citazione: (d.motivo as string | null) || null,
        dettagli: d.motivo ? undefined : ['Senza spiegazione scritta.'],
      }
    case 'riaperto':
      return { icona: RotateCcw, testo: `ha riaperto il compito (era ${stato(d.prima)})`, citazione: (d.motivo as string | null) || null }
    case 'annullato':
      return { icona: CircleSlash, testo: 'ha annullato il compito', citazione: (d.motivo as string | null) || null }
    case 'modificato': {
      const dettagli: string[] = []
      const t = d.titolo as { prima?: string; dopo?: string } | undefined
      if (t) dettagli.push(`Titolo: «${t.prima}» → «${t.dopo}»`)
      if (d.descrizione) dettagli.push('Descrizione modificata')
      const c = d.cliente as { prima?: string; dopo?: string } | undefined
      if (c) dettagli.push(`Cliente: ${cliente(c.prima, nomi)} → ${cliente(c.dopo, nomi)}`)
      const s = d.scadenza as { prima?: string; dopo?: string; con_orario?: boolean } | undefined
      if (s) dettagli.push(`Scadenza: ${scadenza(s.prima)} → ${scadenza(s.dopo, s.dopo ? !!s.con_orario : undefined)}`)
      const p = d.priorita as { prima?: string; dopo?: string } | undefined
      if (p) dettagli.push(`Priorità: ${priorita(p.prima)} → ${priorita(p.dopo)}`)
      return { icona: Pencil, testo: 'ha modificato il compito', dettagli }
    }
    case 'assegnatari':
      return {
        icona: UserRoundCog,
        testo: `ha assegnato il compito a ${persone(d.dopo, nomi)}`,
        dettagli: [`Prima: ${persone(d.prima, nomi)}`],
      }
    case 'documento':
      return {
        icona: FilePlus2,
        testo: <>ha caricato <span className="font-medium wrap-anywhere">«{String(d.nome_file ?? 'documento')}»</span>{d.dimensione ? ` (${formattaDimensione(Number(d.dimensione))})` : ''}</>,
      }
    case 'commento':
      return { icona: MessageSquare, testo: 'ha scritto un commento' }
    default:
      return { icona: CircleDot, testo: `ha fatto una modifica (${e.tipo})` }
  }
}

/** Cronologia del compito (sezione 8): stati, rimandi con la spiegazione, modifiche, documenti, commenti. */
export function Cronologia({ eventi, nomi }: { eventi: Evento[]; nomi: Nomi }) {
  if (eventi.length === 0) return <p className="text-sm text-muted-foreground">Nessun evento.</p>
  return (
    <ol className="relative grid gap-4 border-l pl-5" aria-label="Cronologia del compito">
      {eventi.map((e) => {
        const x = descrivi(e, nomi)
        const Icona = x.icona
        return (
          <li key={e.id} className="relative grid gap-1">
            <span className="absolute top-0.5 -left-[1.95rem] flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground">
              <Icona className="size-3" aria-hidden />
            </span>
            <p className="text-sm">
              <span className="font-medium">
                {e.autore_agente && 'agente · '}
                {e.autore ?? 'Utente non più presente'}
              </span>{' '}
              {x.testo}
            </p>
            <p className="text-xs text-muted-foreground"><time dateTime={new Date(e.creato_il).toISOString()}>{formattaDataOra(e.creato_il)}</time></p>
            {x.citazione && (
              <blockquote className="rounded-md border-l-2 border-avviso bg-avviso-sfondo/60 px-3 py-1.5 text-sm whitespace-pre-wrap break-words">
                {x.citazione}
              </blockquote>
            )}
            {x.dettagli?.length ? (
              <ul className="grid gap-0.5 text-xs text-muted-foreground">
                {x.dettagli.map((t, i) => <li key={i} className="break-words">{t}</li>)}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
