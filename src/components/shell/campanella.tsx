'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, ClipboardList, FileUp, Undo2, CheckCircle2, Mail, Bot, Inbox } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'
import { leggiNotifiche, segnaNotificheLette } from '@/app/(app)/azioni-notifiche'
import { formattaDataOra } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { Notifica } from '@/lib/notifiche'

const TIPI: Record<Notifica['tipo'], { etichetta: string; icona: typeof Bell }> = {
  assegnato: { etichetta: 'Nuovo compito', icona: ClipboardList },
  pronto: { etichetta: 'Completato', icona: CheckCircle2 },
  documenti: { etichetta: 'Documenti', icona: FileUp },
  rimandato: { etichetta: 'Rimandato indietro', icona: Undo2 },
  casella: { etichetta: 'Casella email', icona: Mail },
  agente: { etichetta: 'Agente AI', icona: Bot },
  proposta: { etichetta: 'Proposta dell\'agente', icona: Bot },
}

function destinazione(n: Notifica) {
  if (n.compito_id) return `/compiti/${n.compito_id}`
  if (n.tipo === 'casella') return '/email'
  if (n.tipo === 'proposta' || n.tipo === 'agente') return '/studio/agenti'
  return null
}

export function Campanella({ iniziali }: { iniziali: { elenco: Notifica[]; nonLette: number } }) {
  const [dati, setDati] = useState(iniziali)
  const [aperta, setAperta] = useState(false)
  const [, avvia] = useTransition()
  const router = useRouter()

  // aggiornamento periodico, e subito quando si riapre la scheda del browser
  useEffect(() => {
    const aggiorna = () => leggiNotifiche().then(setDati).catch(() => {})
    const t = setInterval(aggiorna, 60_000)
    const vis = () => document.visibilityState === 'visible' && aggiorna()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  const n = dati.nonLette
  const apri = (x: Notifica) => {
    setAperta(false)
    if (!x.letta) avvia(async () => setDati(await segnaNotificheLette([x.id])))
    const d = destinazione(x)
    if (d) router.push(d)
  }

  return (
    <Popover open={aperta} onOpenChange={setAperta}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={n > 0 ? `Notifiche: ${n} non lette` : 'Notifiche: nessuna non letta'}
        >
          <Bell className="size-5" />
          {n > 0 && (
            <span
              aria-hidden
              data-testid="pallino-notifiche"
              className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-bold text-white"
            >
              {n > 9 ? '9+' : n}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-1.5rem))] p-0" aria-label="Notifiche">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifiche</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={n === 0}
            onClick={() => avvia(async () => setDati(await segnaNotificheLette(null)))}
          >
            <CheckCheck /> Segna tutte come lette
          </Button>
        </div>
        {dati.elenco.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-6" aria-hidden />
            Nessuna notifica
          </div>
        ) : (
          <ul className="max-h-[60dvh] overflow-y-auto" role="list">
            {dati.elenco.map((x) => {
              const t = TIPI[x.tipo] ?? TIPI.assegnato
              const Icona = t.icona
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => apri(x)}
                    className={cn(
                      'flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60',
                      !x.letta && 'bg-info-sfondo',
                    )}
                  >
                    <Icona className={cn('mt-0.5 size-4 shrink-0', x.letta ? 'text-muted-foreground' : 'text-primary')} aria-hidden />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className={cn('font-semibold', !x.letta && 'text-primary')}>{t.etichetta}</span>
                        <span>{formattaDataOra(x.creata_il)}</span>
                        {!x.letta && <span className="sr-only">(non letta)</span>}
                      </span>
                      <span className={cn(!x.letta && 'font-medium')}>{x.testo}</span>
                      {x.motivo && <span className="text-muted-foreground">«{x.motivo}»</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
