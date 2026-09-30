'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/campi'
import { PRIORITA_FILTRO, SCADENZE_FILTRO, STATI_FILTRO, type ParametriElenco } from './filtri-url'

type Voce = { id: string; nome: string }

/**
 * Filtri dell'elenco compiti. È un normale modulo GET (funziona anche senza JavaScript): con JavaScript
 * i menu applicano subito il filtro e l'URL resta leggibile e condivisibile.
 */
export function FiltriCompiti({
  parametri, attivi, collaboratori, clienti, senzaCliente,
}: {
  parametri: ParametriElenco
  attivi: boolean
  collaboratori: Voce[]
  clienti: Voce[]
  senzaCliente: boolean
}) {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  const f = parametri.filtri

  function applica(form: HTMLFormElement) {
    const q = new URLSearchParams()
    for (const [k, v] of new FormData(form)) {
      const s = String(v).trim()
      if (!s || (k === 'stato' && s === 'aperti') || (k === 'vista' && s === 'lista') || (k === 'ordina' && s === 'scadenza') || (k === 'verso' && s === 'asc')) continue
      q.set(k, s)
    }
    const testo = q.toString()
    avvia(() => router.push(`/compiti${testo ? `?${testo}` : ''}`))
  }

  const cambia = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form && applica(e.currentTarget.form)

  return (
    <form
      method="get"
      action="/compiti"
      role="search"
      aria-label="Filtri dei compiti"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault()
        applica(e.currentTarget)
      }}
    >
      <input type="hidden" name="vista" value={parametri.vista} />
      <input type="hidden" name="ordina" value={parametri.ordina} />
      <input type="hidden" name="verso" value={parametri.verso} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <div className="col-span-2 grid gap-1.5">
          <Label htmlFor="filtro-q">Cerca</Label>
          <div className="flex gap-2">
            <Input id="filtro-q" name="q" type="search" defaultValue={f.q} placeholder="Titolo, descrizione o cliente" />
            <Button type="submit" variant="secondary" aria-label="Cerca" disabled={inCorso}>
              {inCorso ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
            </Button>
          </div>
        </div>
        {collaboratori.length > 1 && (
          <div className="grid gap-1.5">
            <Label htmlFor="filtro-collaboratore">Collaboratore</Label>
            <Select id="filtro-collaboratore" name="collaboratore" defaultValue={f.collaboratore} onChange={cambia}>
              <option value="">Tutti</option>
              {collaboratori.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="filtro-cliente">Cliente</Label>
          <Select id="filtro-cliente" name="cliente" defaultValue={f.cliente} onChange={cambia}>
            <option value="">Tutti</option>
            {(senzaCliente || f.cliente === 'nessuno') && <option value="nessuno">Senza cliente</option>}
            {clienti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filtro-stato">Stato</Label>
          <Select id="filtro-stato" name="stato" defaultValue={f.stato} onChange={cambia}>
            {Object.entries(STATI_FILTRO).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filtro-scadenza">Scadenza</Label>
          <Select id="filtro-scadenza" name="scadenza" defaultValue={f.scadenza} onChange={cambia}>
            <option value="">Tutte</option>
            {Object.entries(SCADENZE_FILTRO).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filtro-priorita">Priorità</Label>
          <Select id="filtro-priorita" name="priorita" defaultValue={f.priorita} onChange={cambia}>
            <option value="">Tutte</option>
            {Object.entries(PRIORITA_FILTRO).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
          </Select>
        </div>
      </div>
      <noscript>
        <Button type="submit" size="sm">Applica i filtri</Button>
      </noscript>
      {attivi && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={parametri.vista === 'scadenze' ? '/compiti?vista=scadenze' : '/compiti'}><X aria-hidden /> Azzera i filtri</Link>
          </Button>
        </div>
      )}
    </form>
  )
}
