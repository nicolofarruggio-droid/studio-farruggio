'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, ListChecks, Mail, Users, KeyRound, Settings, Bot, ScrollText, Upload, Trash2, Coins,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONE = {
  dashboard: LayoutDashboard, clienti: Building2, compiti: ListChecks, email: Mail, utenti: Users, accessi: KeyRound,
  impostazioni: Settings, agenti: Bot, registro: ScrollText, importa: Upload, cestino: Trash2, consumi: Coins,
}
export type VoceMenu = { href: string; etichetta: string; icona: keyof typeof ICONE }
export type GruppoMenu = { titolo?: string; voci: VoceMenu[] }

export function Navigazione({ gruppi, onNaviga }: { gruppi: GruppoMenu[]; onNaviga?: () => void }) {
  const percorso = usePathname()
  const attiva = (href: string) => percorso === href || (href !== '/dashboard' && percorso.startsWith(href + '/')) || percorso === href
  // la voce più specifica vince (es. /clienti/importa rispetto a /clienti)
  const tutte = gruppi.flatMap((g) => g.voci.map((v) => v.href))
  const migliore = tutte.filter(attiva).sort((a, b) => b.length - a.length)[0]
  return (
    <nav aria-label="Menu principale" className="grid gap-5">
      {gruppi.map((g, i) => (
        <div key={i} className="grid gap-0.5">
          {g.titolo && <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{g.titolo}</p>}
          {g.voci.map((v) => {
            const Icona = ICONE[v.icona]
            const corrente = v.href === migliore
            return (
              <Link
                key={v.href}
                href={v.href}
                onClick={onNaviga}
                aria-current={corrente ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  corrente && 'bg-sidebar-accent font-medium text-white',
                )}
              >
                <Icona className="size-4 shrink-0" aria-hidden />
                {v.etichetta}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
