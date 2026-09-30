'use client'
import { useId, useState } from 'react'
import { AlertCircle, FileSpreadsheet, Loader2 } from 'lucide-react'
import { ErroreFile, leggiCartella, leggiFoglio, type Cartella, type FoglioLetto } from '@/lib/importazione/file'
import { trovaIntestazione } from '@/lib/importazione/intestazioni'
import { nomiColonne } from '@/lib/importazione/risultato-ai'
import type { RigaFile } from '@/lib/importazione/righe'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label, Select } from '@/components/ui/campi'

export type FileCaricato = {
  nomeFile: string
  foglio: string
  /** Numero (come in Excel) della riga di intestazione. */
  rigaIntestazione: number
  intestazione: string[]
  dati: RigaFile[]
}

function componi(nomeFile: string, letto: FoglioLetto, indice: number): FileCaricato {
  const intestazione = nomiColonne(Array.from({ length: letto.colonne }, (_, i) => letto.righe[indice]?.celle[i] ?? ''))
  return {
    nomeFile,
    foglio: letto.nome,
    rigaIntestazione: letto.righe[indice]?.numero ?? 1,
    intestazione,
    dati: letto.righe.slice(indice + 1),
  }
}

/** Scelta del file, del foglio e della riga di intestazione, con il riepilogo di cosa è stato letto. */
export function SceltaFile({
  onCaricato, disabilitato, etichetta = 'File dei clienti',
}: { onCaricato: (f: FileCaricato | null) => void; disabilitato?: boolean; etichetta?: string }) {
  const id = useId()
  const [cartella, setCartella] = useState<Cartella | null>(null)
  const [letto, setLetto] = useState<FoglioLetto | null>(null)
  const [indice, setIndice] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  const [lettura, setLettura] = useState(false)

  async function scegliFile(file: File | undefined) {
    setErrore(null)
    setCartella(null)
    setLetto(null)
    onCaricato(null)
    if (!file) return
    setLettura(true)
    try {
      const c = await leggiCartella(await file.arrayBuffer(), file.name)
      setCartella(c)
      await scegliFoglio(c, c.fogli[0])
    } catch (e) {
      setErrore(e instanceof ErroreFile ? e.message : 'Non riesco a leggere il file. Prova a salvarlo di nuovo in formato .xlsx o .csv.')
    } finally {
      setLettura(false)
    }
  }

  async function scegliFoglio(c: Cartella, nome: string) {
    try {
      const f = await leggiFoglio(c, nome)
      const i = trovaIntestazione(f.righe.map((r) => r.celle))
      setLetto(f)
      setIndice(i)
      setErrore(f.righe.length < 2 ? 'Il foglio scelto non contiene righe di dati.' : null)
      onCaricato(f.righe.length >= 2 ? componi(c.nomeFile, f, i) : null)
    } catch (e) {
      setLetto(null)
      setErrore(e instanceof ErroreFile ? e.message : 'Non riesco a leggere questo foglio.')
      onCaricato(null)
    }
  }

  function scegliIntestazione(i: number) {
    if (!cartella || !letto) return
    setIndice(i)
    onCaricato(componi(cartella.nomeFile, letto, i))
  }

  const caricato = cartella && letto && letto.righe.length >= 2 ? componi(cartella.nomeFile, letto, indice) : null

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-file`}>{etichetta}</Label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.oasis.opendocument.spreadsheet"
          disabled={disabilitato || lettura}
          aria-describedby={`${id}-aiuto`}
          onChange={(e) => scegliFile(e.target.files?.[0])}
          className="block w-full max-w-xl cursor-pointer rounded-md border border-input bg-card text-sm file:mr-3 file:cursor-pointer file:border-0 file:border-r file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
          Formati: .xlsx, .xls, .csv, .ods. Il file viene letto nel tuo browser; la prima riga con i nomi delle colonne è l’intestazione.
        </p>
      </div>
      {lettura && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Lettura del file…
        </p>
      )}
      {errore && (
        <Alert variant="pericolo">
          <AlertCircle aria-hidden />
          <p>{errore}</p>
        </Alert>
      )}
      {cartella && letto && (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <FileSpreadsheet className="size-4 text-primary" aria-hidden />
            <span className="font-medium">{cartella.nomeFile}</span>
            {caricato && (
              <span className="text-muted-foreground">
                · {caricato.dati.length} {caricato.dati.length === 1 ? 'riga' : 'righe'} di dati · {caricato.intestazione.length} colonne
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-4">
            {cartella.fogli.length > 1 && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-foglio`}>Foglio</Label>
                <Select id={`${id}-foglio`} value={letto.nome} disabled={disabilitato} onChange={(e) => scegliFoglio(cartella, e.target.value)} className="w-56">
                  {cartella.fogli.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {cartella.fogli.length === 1 && (
              <p>
                Foglio: <span className="font-medium">{letto.nome}</span>
              </p>
            )}
            {letto.righe.length >= 2 && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-intestazione`}>Riga di intestazione</Label>
                <Select
                  id={`${id}-intestazione`}
                  value={indice}
                  disabled={disabilitato}
                  onChange={(e) => scegliIntestazione(Number(e.target.value))}
                  className="w-96 max-w-full"
                >
                  {letto.righe.slice(0, 15).map((r, i) => (
                    <option key={r.numero} value={i}>
                      Riga {r.numero}: {r.celle.filter(Boolean).slice(0, 3).join(', ').slice(0, 60)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          {caricato && (
            <div className="grid gap-1.5">
              <p className="text-muted-foreground">Colonne dell’intestazione (riga {caricato.rigaIntestazione}):</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Colonne dell'intestazione">
                {caricato.intestazione.map((h, i) => (
                  <li key={i}>
                    <Badge variant="outline">{h}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
