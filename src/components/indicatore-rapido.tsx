'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Label, Select } from '@/components/ui/campi'
import { BadgeIndicatore, NOMI_INDICATORE } from '@/components/indicatore'
import { aggiornaIndicatore } from '@/app/(app)/clienti/azioni-indicatori'
import { fineMeseISO, meseAnno, oggiISO } from '@/lib/date'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

type Valore = { aggiornato_fino_al: string | null; non_applicabile: boolean } | null

/**
 * Aggiornamento rapido di un indicatore dalla lista: clic sul valore, scelta del mese
 * (salva l'ultimo giorno del mese) oppure di una data precisa, oppure "non applicabile".
 */
export function IndicatoreRapido({
  cliente, nomeCliente, tipo, valore, soglia, modificabile,
}: {
  cliente: string
  nomeCliente: string
  tipo: 'iva' | 'prima_nota'
  valore: Valore
  soglia: number
  modificabile: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [inCorso, avvia] = useTransition()
  const oggi = oggiISO()
  const [ao, mo] = oggi.split('-').map(Number)
  const base = valore?.aggiornato_fino_al ?? null
  // proposta: il mese dopo l'ultimo aggiornato, senza superare il mese scorso
  const proposta = (() => {
    const scorso = mo === 1 ? { a: ao - 1, m: 12 } : { a: ao, m: mo - 1 }
    if (!base) return scorso
    const [ba, bm] = base.split('-').map(Number)
    const dopo = bm === 12 ? { a: ba + 1, m: 1 } : { a: ba, m: bm + 1 }
    return dopo.a * 12 + dopo.m > scorso.a * 12 + scorso.m ? scorso : dopo
  })()
  const [mese, setMese] = useState(proposta.m)
  const [anno, setAnno] = useState(proposta.a)
  const [precisa, setPrecisa] = useState(false)
  const [data, setData] = useState(base ?? '')
  const [na, setNa] = useState(valore?.non_applicabile ?? false)

  const nome = NOMI_INDICATORE[tipo]
  const badge = <BadgeIndicatore valore={valore} soglia={soglia} />
  if (!modificabile) return badge

  const salva = (dataScelta: string | null, nonApplicabile: boolean) =>
    avvia(async () => {
      const r = await aggiornaIndicatore({ cliente, tipo, data: dataScelta, nonApplicabile })
      if (r.ok) {
        toast.success(`${nome} di ${nomeCliente}: ${nonApplicabile ? 'non applicabile' : dataScelta ? `aggiornata a ${meseAnno(dataScelta)}` : 'da impostare'}`)
        setAperto(false)
      } else toast.error(r.errore)
    })

  const scorciatoie = [0, 1].map((indietro) => {
    const t = mo - 1 - indietro
    const a = t <= 0 ? ao - 1 : ao
    const m = t <= 0 ? 12 + t : t
    return fineMeseISO(a, m)
  })

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1 rounded-md text-left"
          aria-label={`Aggiorna ${nome} di ${nomeCliente}`}
        >
          {badge}
          <Pencil className="size-3.5 text-muted-foreground opacity-60 group-hover:opacity-100" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3 p-4" aria-label={`Aggiorna ${nome}`}>
        <p className="text-sm font-semibold">{nome} · {nomeCliente}</p>
        <div className="flex flex-wrap gap-2">
          {scorciatoie.map((s) => (
            <Button key={s} size="sm" variant="secondary" disabled={inCorso} onClick={() => salva(s, false)}>
              Aggiornata a {meseAnno(s)}
            </Button>
          ))}
        </div>
        {!precisa ? (
          <div className="grid gap-2">
            <Label>Aggiornata fino a (fine mese)</Label>
            <div className="flex gap-2">
              <Select aria-label="Mese" value={mese} onChange={(e) => setMese(Number(e.target.value))}>
                {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Select>
              <Select aria-label="Anno" value={anno} onChange={(e) => setAnno(Number(e.target.value))} className="w-28">
                {Array.from({ length: 8 }, (_, i) => ao + 1 - i).map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor={`data-${cliente}-${tipo}`}>Data precisa</Label>
            <Input id={`data-${cliente}-${tipo}`} type="date" value={data} onChange={(e) => setData(e.target.value)} max={oggi} />
          </div>
        )}
        <Button variant="link" size="sm" className="h-auto justify-start p-0" onClick={() => setPrecisa(!precisa)}>
          {precisa ? 'Scegli un mese' : 'Inserisci una data precisa'}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={na} onChange={(e) => setNa(e.target.checked)} /> Non applicabile a questo cliente
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAperto(false)}>Annulla</Button>
          <Button
            size="sm"
            disabled={inCorso || (!na && precisa && !data)}
            onClick={() => salva(na ? null : precisa ? data : fineMeseISO(anno, mese), na)}
          >
            Salva
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
