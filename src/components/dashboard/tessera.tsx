import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Tessera({
  titolo, valore, dettaglio, href, icona: Icona, tono = 'neutro',
}: {
  titolo: string
  valore: number
  dettaglio?: string
  href?: string
  icona: LucideIcon
  tono?: 'neutro' | 'pericolo' | 'avviso' | 'successo'
}) {
  const colori = {
    neutro: 'text-primary bg-primary/10',
    pericolo: 'text-pericolo bg-pericolo-sfondo',
    avviso: 'text-avviso bg-avviso-sfondo',
    successo: 'text-successo bg-successo-sfondo',
  }[tono]
  const corpo = (
    <>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', valore > 0 ? colori : 'bg-muted text-muted-foreground')}>
        <Icona className="size-5" aria-hidden />
      </span>
      <span className="grid min-w-0">
        <span className="text-sm text-muted-foreground">{titolo}</span>
        <span className="text-2xl leading-tight font-semibold tabular-nums">{valore}</span>
        {dettaglio && <span className="truncate text-xs text-muted-foreground">{dettaglio}</span>}
      </span>
    </>
  )
  const classi = 'flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs'
  return href ? (
    <Link href={href} className={cn(classi, 'transition-colors hover:border-primary/40 hover:bg-accent/30')}>{corpo}</Link>
  ) : (
    <div className={classi}>{corpo}</div>
  )
}
