import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { descriviAggiornamento, statoIndicatore, type StatoIndicatore } from '@/lib/date'

export const NOMI_INDICATORE = { iva: 'IVA', prima_nota: 'Prima nota' } as const

/** Stato di un indicatore con colore, icona e testo (mai solo colore, sezione 7). */
export function BadgeIndicatore({
  valore, soglia, stato: statoDato,
}: {
  valore: { aggiornato_fino_al: string | null; non_applicabile: boolean } | null
  soglia: number
  stato?: StatoIndicatore
}) {
  const stato = statoDato ?? statoIndicatore(valore, soglia)
  switch (stato) {
    case 'non_applicabile':
      return <Badge variant="neutro"><MinusCircle aria-hidden /> Non applicabile</Badge>
    case 'da_impostare':
      return <Badge variant="neutro"><CircleDashed aria-hidden /> Da impostare</Badge>
    case 'in_ritardo':
      return (
        <Badge variant="pericolo" title="In ritardo rispetto alla soglia dello studio">
          <AlertTriangle aria-hidden /> In ritardo · {descriviAggiornamento(valore!.aggiornato_fino_al!)}
        </Badge>
      )
    default:
      return <Badge variant="successo"><CheckCircle2 aria-hidden /> {descriviAggiornamento(valore!.aggiornato_fino_al!)}</Badge>
  }
}
