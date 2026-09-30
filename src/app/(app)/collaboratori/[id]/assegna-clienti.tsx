'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, UserPlus } from 'lucide-react'
import { assegnaClienti } from '@/app/(app)/clienti/azioni'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Label } from '@/components/ui/campi'

type Opzione = { id: string; nome: string; referente: string | null }

/** Assegnazione dei clienti dalla scheda del collaboratore (sezione 6), anche più clienti insieme. */
export function AssegnaClienti({ collaboratore, nome, clienti }: { collaboratore: string; nome: string; clienti: Opzione[] }) {
  const [filtro, setFiltro] = useState('')
  const [scelti, setScelti] = useState<Set<string>>(new Set())
  const [inCorso, avvia] = useTransition()
  const router = useRouter()
  const visibili = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return clienti.filter((c) => !f || c.nome.toLowerCase().includes(f) || (c.referente ?? 'senza collaboratore').toLowerCase().includes(f))
  }, [clienti, filtro])

  const assegna = () =>
    avvia(async () => {
      const r = await assegnaClienti([...scelti], collaboratore)
      if (r.ok) {
        toast.success(r.messaggio)
        setScelti(new Set())
        router.refresh()
      } else toast.error(r.errore)
    })

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="cerca-clienti-da-assegnare">Cerca un cliente o un collaboratore attuale</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input id="cerca-clienti-da-assegnare" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="pl-8"
            placeholder="Per esempio: senza collaboratore" />
        </div>
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border" aria-label="Clienti da assegnare">
        {visibili.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nessun cliente.</li>}
        {visibili.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
              <Checkbox checked={scelti.has(c.id)} onChange={(e) => {
                const n = new Set(scelti)
                if (e.target.checked) n.add(c.id)
                else n.delete(c.id)
                setScelti(n)
              }} />
              <span className="flex-1">{c.nome}</span>
              <span className="text-xs text-muted-foreground">{c.referente ?? 'Senza collaboratore'}</span>
            </label>
          </li>
        ))}
      </ul>
      <div>
        <Button onClick={assegna} disabled={inCorso || scelti.size === 0}>
          <UserPlus /> {scelti.size === 0 ? `Assegna a ${nome}` : `Assegna ${scelti.size === 1 ? '1 cliente' : `${scelti.size} clienti`} a ${nome}`}
        </Button>
      </div>
    </div>
  )
}
