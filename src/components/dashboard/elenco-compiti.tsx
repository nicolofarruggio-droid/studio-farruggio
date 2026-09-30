import Link from 'next/link'
import { Bot, Undo2 } from 'lucide-react'
import type { RigaCompito } from '@/lib/dati/compiti'
import { BadgePriorita, BadgeStato, Scadenza } from '@/components/stato-compito'

export function ElencoCompitiCompatto({
  compiti, vuoto, mostraAssegnatari = true, rimandati = new Set<string>(),
}: { compiti: RigaCompito[]; vuoto: string; mostraAssegnatari?: boolean; rimandati?: Set<string> }) {
  if (compiti.length === 0) return <p className="py-4 text-sm text-muted-foreground">{vuoto}</p>
  return (
    <ul className="divide-y" role="list">
      {compiti.map((k) => (
        <li key={k.id} className="py-3">
          <Link href={`/compiti/${k.id}`} className="grid gap-1 rounded-md hover:text-primary">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{k.titolo}</span>
              <BadgePriorita priorita={k.priorita} />
              {rimandati.has(k.id) && <span className="inline-flex items-center gap-1 text-xs font-medium text-avviso"><Undo2 className="size-3.5" aria-hidden /> Rimandato indietro</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{k.cliente ?? 'Senza cliente'}</span>
              {mostraAssegnatari && <span>→ {k.assegnatari.map((a) => a.nome).join(', ')}</span>}
              {k.creato_da_agente && <span className="inline-flex items-center gap-1"><Bot className="size-3.5" aria-hidden /> da agente</span>}
              <Scadenza scadenza={k.scadenza} conOrario={k.scadenza_con_orario} />
              <BadgeStato stato={k.stato} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
