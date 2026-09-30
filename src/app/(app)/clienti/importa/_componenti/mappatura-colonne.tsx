'use client'
import { Columns3 } from 'lucide-react'
import { CAMPI_COLONNA, type CampoColonna, type Mappatura } from '@/lib/importazione/intestazioni'
import type { RigaFile } from '@/lib/importazione/righe'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/campi'

/** Correzione a mano della mappatura colonne → campi (alternativa senza AI). */
export function MappaturaColonne({
  intestazione, dati, mappatura, onCambia, onApplica, onAnnulla, sostituisce,
}: {
  intestazione: string[]
  dati: RigaFile[]
  mappatura: Mappatura
  onCambia: (m: Mappatura) => void
  onApplica: () => void
  onAnnulla: () => void
  sostituisce: boolean
}) {
  const esempio = (i: number) => dati.find((r) => r.celle[i]?.trim())?.celle[i]?.trim() ?? ''
  const riconosciute = mappatura.filter(Boolean).length
  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <h3 className="flex items-center gap-2 font-semibold">
          <Columns3 className="size-4 text-primary" aria-hidden /> Colonne riconosciute dai nomi
        </h3>
        <p className="text-sm text-muted-foreground">
          {riconosciute
            ? `Ho riconosciuto ${riconosciute} ${riconosciute === 1 ? 'colonna' : 'colonne'} su ${intestazione.length}. Controlla e correggi dove serve: le colonne «ignorata» non si importano.`
            : 'Non ho riconosciuto nessuna colonna dai nomi: scegli tu dove va ogni colonna.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Colonne del file e campo del cliente in cui vanno</caption>
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="h-9 px-3 text-left font-semibold">Colonna del file</th>
              <th scope="col" className="h-9 px-3 text-left font-semibold">Primo valore</th>
              <th scope="col" className="h-9 px-3 text-left font-semibold">Va nel campo</th>
            </tr>
          </thead>
          <tbody>
            {intestazione.map((h, i) => (
              <tr key={i} className="border-b last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-medium">{h}</th>
                <td className="max-w-72 truncate px-3 py-2 text-muted-foreground" title={esempio(i)}>{esempio(i) || '—'}</td>
                <td className="px-3 py-2">
                  <Select
                    aria-label={`Campo per la colonna ${h}`}
                    value={mappatura[i] ?? ''}
                    onChange={(e) => onCambia(mappatura.map((c, j) => (j === i ? ((e.target.value || null) as CampoColonna | null) : c)))}
                    className="h-8 w-72"
                  >
                    <option value="">— ignorata —</option>
                    {(Object.keys(CAMPI_COLONNA) as CampoColonna[]).map((k) => (
                      <option key={k} value={k}>{CAMPI_COLONNA[k]}</option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onApplica} disabled={!riconosciute}>
          {sostituisce ? 'Sostituisci l’anteprima con queste colonne' : 'Crea l’anteprima con queste colonne'}
        </Button>
        <Button variant="outline" onClick={onAnnulla}>Chiudi</Button>
      </div>
    </div>
  )
}
