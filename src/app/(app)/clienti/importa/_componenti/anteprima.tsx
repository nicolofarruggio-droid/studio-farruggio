'use client'
import { useId, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, UserPlus, Wand2 } from 'lucide-react'
import type { EsameRiga, Persona } from '@/lib/importazione/righe'
import { chiaveTesto, titolariInTesto } from '@/lib/importazione/normalizza'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/campi'
import { RigaAnteprimaVista, type Modifica, type RigaAnteprima } from './riga-anteprima'

const PER_PAGINA = 50

export type Filtro = 'tutte' | 'pronte' | 'errori' | 'avvisi' | 'da_completare' | 'escluse'

const FILTRI: { valore: Filtro; etichetta: string }[] = [
  { valore: 'tutte', etichetta: 'Tutte' },
  { valore: 'pronte', etichetta: 'Pronte' },
  { valore: 'errori', etichetta: 'Con errori' },
  { valore: 'avvisi', etichetta: 'Con avvisi' },
  { valore: 'da_completare', etichetta: 'Da completare' },
  { valore: 'escluse', etichetta: 'Escluse' },
]

function passaFiltro(f: Filtro, r: RigaAnteprima, e: EsameRiga): boolean {
  switch (f) {
    case 'pronte':
      return !r.esclusa && !e.errori
    case 'errori':
      return !r.esclusa && e.errori > 0
    case 'avvisi':
      return !r.esclusa && e.avvisi > 0
    case 'da_completare':
      return !r.esclusa && e.daCompletare.length > 0
    case 'escluse':
      return r.esclusa
    default:
      return true
  }
}

/** Tabella dell'anteprima con filtri rapidi, ricerca, assegnazione in blocco e pagine da 50 righe. */
export function Anteprima({
  righe, esami, persone, onModifica, onModificaMolte,
}: {
  righe: RigaAnteprima[]
  esami: Map<number, EsameRiga>
  persone: Persona[]
  onModifica: Modifica
  onModificaMolte: (modifiche: Map<number, Partial<RigaAnteprima>>) => void
}) {
  const id = useId()
  const [filtro, setFiltro] = useState<Filtro>('tutte')
  const [cerca, setCerca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [perBlocco, setPerBlocco] = useState('')

  const conteggi = useMemo(() => {
    const c = Object.fromEntries(FILTRI.map((f) => [f.valore, 0])) as Record<Filtro, number>
    for (const r of righe) {
      const e = esami.get(r.riga)
      if (!e) continue
      for (const f of FILTRI) if (passaFiltro(f.valore, r, e)) c[f.valore]++
    }
    return c
  }, [righe, esami])

  const visibili = useMemo(() => {
    const q = chiaveTesto(cerca)
    return righe.filter((r) => {
      const e = esami.get(r.riga)
      if (!e || !passaFiltro(filtro, r, e)) return false
      if (!q) return true
      return chiaveTesto(`${r.riga} ${r.nome_azienda} ${titolariInTesto(r.titolari)} ${r.email.map((x) => x.indirizzo).join(' ')} ${r.partita_iva ?? ''}`).includes(q)
    })
  }, [righe, esami, filtro, cerca])

  const pagine = Math.max(1, Math.ceil(visibili.length / PER_PAGINA))
  const p = Math.min(pagina, pagine - 1)
  const inPagina = visibili.slice(p * PER_PAGINA, (p + 1) * PER_PAGINA)

  const senzaCollaboratore = righe.filter((r) => !r.esclusa && !r.collaboratore_id)
  const senzaRagione = righe.filter((r) => !r.esclusa && !r.nome_azienda.trim() && r.titolari.length > 0)

  function assegnaInBlocco() {
    if (!perBlocco) return
    onModificaMolte(new Map(senzaCollaboratore.map((r) => [r.riga, { collaboratore_id: perBlocco }])))
  }

  function titolareComeRagione() {
    onModificaMolte(new Map(senzaRagione.map((r) => [r.riga, { nome_azienda: titolariInTesto(r.titolari.slice(0, 1)) }])))
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtra le righe dell'anteprima">
        {FILTRI.map((f) => (
          <Button
            key={f.valore}
            size="sm"
            variant={filtro === f.valore ? 'default' : 'outline'}
            aria-pressed={filtro === f.valore}
            onClick={() => {
              setFiltro(f.valore)
              setPagina(0)
            }}
          >
            {f.etichetta} ({conteggi[f.valore]})
          </Button>
        ))}
        <div className="ml-auto grid gap-1">
          <Label htmlFor={`${id}-cerca`} className="sr-only">
            Cerca nell’anteprima
          </Label>
          <Input
            id={`${id}-cerca`}
            type="search"
            placeholder="Cerca nell’anteprima…"
            value={cerca}
            onChange={(e) => {
              setCerca(e.target.value)
              setPagina(0)
            }}
            className="h-8 w-60"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-blocco`}>Assegna i clienti senza collaboratore a</Label>
            <Select id={`${id}-blocco`} value={perBlocco} onChange={(e) => setPerBlocco(e.target.value)} className="h-8 w-56">
              <option value="">Scegli un collaboratore…</option>
              {persone.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome} {x.cognome}
                </option>
              ))}
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={assegnaInBlocco} disabled={!perBlocco || !senzaCollaboratore.length}>
            <UserPlus aria-hidden /> Assegna a {senzaCollaboratore.length} {senzaCollaboratore.length === 1 ? 'cliente' : 'clienti'}
          </Button>
        </div>
        {senzaRagione.length > 0 && (
          <Button size="sm" variant="outline" onClick={titolareComeRagione}>
            <Wand2 aria-hidden /> Usa il titolare come ragione sociale ({senzaRagione.length} {senzaRagione.length === 1 ? 'riga' : 'righe'})
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {visibili.length === righe.length
          ? `${righe.length} ${righe.length === 1 ? 'riga' : 'righe'} nell’anteprima.`
          : `${visibili.length} di ${righe.length} righe mostrate.`}{' '}
        I campi si possono correggere: le modifiche valgono all’uscita dal campo.
      </p>

      <div className="max-h-[75vh] overflow-auto rounded-lg border">
        <table className="w-max min-w-full text-sm">
          <caption className="sr-only">Anteprima dei clienti da importare, modificabile riga per riga</caption>
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground shadow-[0_1px_0] shadow-border">
            <tr>
              {['Riga', 'Escludi', 'Stato', 'Ragione sociale', 'Titolari', 'Email', 'Prima nota', 'IVA', 'Dipendenti', 'Fatturato (€)', 'Collaboratore', 'Partita IVA', 'Codice fiscale', 'Telefono'].map(
                (h) => (
                  <th key={h} scope="col" className="h-9 px-2 text-left font-semibold whitespace-nowrap first:pl-3">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {inPagina.map((r) => (
              <RigaAnteprimaVista key={r.riga} r={r} esame={esami.get(r.riga)!} persone={persone} onModifica={onModifica} />
            ))}
            {!inPagina.length && (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-muted-foreground">
                  Nessuna riga con questo filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagine > 1 && (
        <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Pagine dell'anteprima">
          <Button size="sm" variant="outline" onClick={() => setPagina(p - 1)} disabled={p === 0}>
            <ChevronLeft aria-hidden /> Precedente
          </Button>
          <p className="text-sm text-muted-foreground">
            Pagina {p + 1} di {pagine} · righe {p * PER_PAGINA + 1}–{Math.min((p + 1) * PER_PAGINA, visibili.length)}
          </p>
          <Button size="sm" variant="outline" onClick={() => setPagina(p + 1)} disabled={p >= pagine - 1}>
            Successiva <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  )
}
