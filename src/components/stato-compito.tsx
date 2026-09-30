import { AlarmClock, CalendarClock, CalendarX2, Circle, CircleCheck, CircleDot, CircleSlash, Eye, Flame, ArrowUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { descriviScadenza, statoScadenza } from '@/lib/date'
import { ETICHETTE_STATO, type Priorita, type StatoCompito } from '@/lib/dati/compiti'

export function BadgeStato({ stato }: { stato: StatoCompito }) {
  const m = {
    assegnato: { v: 'neutro', i: Circle },
    in_lavorazione: { v: 'default', i: CircleDot },
    pronto_revisione: { v: 'avviso', i: Eye },
    completato: { v: 'successo', i: CircleCheck },
    annullato: { v: 'neutro', i: CircleSlash },
  } as const
  const { v, i: Icona } = m[stato]
  return <Badge variant={v}><Icona aria-hidden /> {ETICHETTE_STATO[stato]}</Badge>
}

export function BadgePriorita({ priorita }: { priorita: Priorita }) {
  if (priorita === 'urgente') return <Badge variant="pericolo"><Flame aria-hidden /> Urgente</Badge>
  if (priorita === 'alta') return <Badge variant="avviso"><ArrowUp aria-hidden /> Alta</Badge>
  return null
}

export function Scadenza({
  scadenza, conOrario, chiuso = false,
}: { scadenza: Date | string | null; conOrario: boolean; chiuso?: boolean }) {
  const s = statoScadenza(scadenza)
  const testo = descriviScadenza(scadenza, conOrario)
  if (s === 'nessuna') return <span className="text-sm text-muted-foreground">Senza scadenza</span>
  if (!chiuso && s === 'scaduto')
    return <span className="inline-flex items-center gap-1 text-sm font-medium text-pericolo"><CalendarX2 className="size-4" aria-hidden /> Scaduto · {testo}</span>
  if (!chiuso && s === 'oggi')
    return <span className="inline-flex items-center gap-1 text-sm font-medium text-avviso"><AlarmClock className="size-4" aria-hidden /> Scade {testo}</span>
  return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><CalendarClock className="size-4" aria-hidden /> {testo}</span>
}
