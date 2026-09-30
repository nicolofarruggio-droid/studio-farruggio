'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Columns3, Info, Loader2, RotateCcw, Sparkles, Square, Upload } from 'lucide-react'
import { riconosciColonne, type Mappatura } from '@/lib/importazione/intestazioni'
import {
  abbinaCollaboratore, esaminaRiga, giaPresente, indiceEsistenti, rigaDaMappatura, trovaDoppioni,
  type ClienteEsistente, type EsameRiga, type IndiceEsistenti, type Persona, type RigaImport,
} from '@/lib/importazione/righe'
import { RIGHE_PER_CONFERMA } from '@/lib/importazione/costanti'
import type { Importata, Saltata } from '@/lib/importazione/scrittura'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { importaClienti } from '../azioni'
import { analizzaConAI, dividiInBlocchi, type StatoBlocco } from './analisi-ai'
import { Anteprima } from './anteprima'
import { MappaturaColonne } from './mappatura-colonne'
import { SceltaFile, type FileCaricato } from './scelta-file'
import type { RigaAnteprima } from './riga-anteprima'
import { Riepilogo, type EsitoFinale } from './riepilogo'

type Props = { esistenti: ClienteEsistente[]; persone: Persona[]; ai: { disponibile: boolean; simulata: boolean } }

/** Nuove righe (dall'AI o dalle colonne) pronte per l'anteprima, con il collaboratore abbinato. */
function prepara(r: RigaImport, persone: Persona[]): RigaAnteprima {
  return { ...r, collaboratore_id: r.collaboratore_id ?? abbinaCollaboratore(r.collaboratore_testo, persone), esclusa: false, esclusioneManuale: false }
}

/**
 * Esclusioni automatiche (l'admin le può togliere): clienti già presenti nello studio e doppioni
 * di una riga precedente del file. DECISIONE APERTA (proposta): escludere invece di bloccare.
 */
function applicaEsclusioni(righe: RigaAnteprima[], indice: IndiceEsistenti): RigaAnteprima[] {
  const doppi = trovaDoppioni(righe)
  return righe.map((r) => {
    if (r.esclusioneManuale) return r
    const esclusa = Boolean(giaPresente(r, indice)) || (doppi.get(r.riga)?.some((n) => n < r.riga) ?? false)
    return esclusa === r.esclusa ? r : { ...r, esclusa }
  })
}

/** Perché una riga non si importa: esclusa (a mano o perché doppione o già presente) o con errori. */
function motivoSaltata(r: RigaAnteprima, e: EsameRiga): string {
  if (r.esclusa) {
    const perche = r.esclusioneManuale ? null : e.segnalazioni.find((s) => /^(Già presente|Doppione)/.test(s.testo))?.testo
    return perche ? `Esclusa: ${perche.charAt(0).toLowerCase()}${perche.slice(1)}` : 'Esclusa dall’importazione'
  }
  return e.segnalazioni.find((s) => s.livello === 'errore')?.testo ?? 'Dati non validi'
}

function perConferma(r: RigaAnteprima) {
  return {
    riga: r.riga, nome_azienda: r.nome_azienda, titolari: r.titolari, email: r.email, prima_nota: r.prima_nota, iva: r.iva,
    numero_dipendenti: r.numero_dipendenti, fatturato: r.fatturato, collaboratore_id: r.collaboratore_id,
    partita_iva: r.partita_iva, codice_fiscale: r.codice_fiscale, telefono: r.telefono,
  }
}

export function ImportaClienti({ esistenti, persone, ai }: Props) {
  const [file, setFile] = useState<FileCaricato | null>(null)
  const [righe, setRighe] = useState<RigaAnteprima[]>([])
  const [vuote, setVuote] = useState<number[]>([])
  const [blocchi, setBlocchi] = useState<StatoBlocco[]>([])
  const [base, setBase] = useState(0) // righe già analizzate prima dell'analisi in corso
  const [analisi, setAnalisi] = useState<'ferma' | 'in_corso'>('ferma')
  const [mappatura, setMappatura] = useState<Mappatura | null>(null)
  const [importazione, setImportazione] = useState<{ fatte: number; totale: number } | null>(null)
  const [esito, setEsito] = useState<EsitoFinale | null>(null)
  const [chiaveFile, setChiaveFile] = useState(0)

  const indice = useMemo(() => indiceEsistenti(esistenti), [esistenti])
  const controllo = useRef<AbortController | null>(null)
  const coda = useRef<{ righe: RigaImport[]; vuote: number[]; blocchi: Map<number, StatoBlocco> }>({ righe: [], vuote: [], blocchi: new Map() })
  const timer = useRef<number | null>(null)
  const prossimoBlocco = useRef(0)

  useEffect(() => () => controllo.current?.abort(), [])

  // Gli aggiornamenti dello stream si applicano a gruppi (ogni 120 ms): l'anteprima resta fluida.
  const svuota = useCallback(() => {
    timer.current = null
    const c = coda.current
    if (c.righe.length) {
      const nuove = c.righe
      c.righe = []
      setRighe((prima) => {
        const presenti = new Set(prima.map((r) => r.riga))
        const aggiunte = nuove.filter((r) => !presenti.has(r.riga) && (presenti.add(r.riga), true)).map((r) => prepara(r, persone))
        return aggiunte.length ? [...prima, ...aggiunte].sort((a, b) => a.riga - b.riga) : prima
      })
    }
    if (c.vuote.length) {
      const v = c.vuote
      c.vuote = []
      setVuote((prima) => [...new Set([...prima, ...v])].sort((a, b) => a - b))
    }
    if (c.blocchi.size) {
      const agg = new Map(c.blocchi)
      c.blocchi.clear()
      setBlocchi((prima) => prima.map((b) => agg.get(b.id) ?? b))
    }
  }, [persone])

  const pianifica = useCallback(() => {
    timer.current ??= window.setTimeout(svuota, 120)
  }, [svuota])

  const numeriAnalizzati = useMemo(() => new Set([...righe.map((r) => r.riga), ...vuote]), [righe, vuote])
  const daAnalizzare = file ? file.dati.filter((r) => !numeriAnalizzati.has(r.numero)) : []

  function nuovoFile(f: FileCaricato | null) {
    controllo.current?.abort()
    setFile(f)
    setRighe([])
    setVuote([])
    setBlocchi([])
    setMappatura(null)
    setEsito(null)
    setImportazione(null)
  }

  async function avviaAnalisi(soloNumeri?: number[]) {
    if (!file || analisi === 'in_corso') return
    const scelte = soloNumeri ? daAnalizzare.filter((r) => soloNumeri.includes(r.numero)) : daAnalizzare
    if (!scelte.length) return
    const ctrl = new AbortController()
    controllo.current = ctrl
    const nuovi = dividiInBlocchi(scelte, prossimoBlocco.current)
    prossimoBlocco.current += nuovi.length
    setMappatura(null)
    setBase(file.dati.length - daAnalizzare.length)
    setBlocchi(nuovi.map((b) => b.stato))
    setAnalisi('in_corso')
    await analizzaConAI({
      intestazione: file.intestazione,
      blocchi: nuovi,
      segnale: ctrl.signal,
      suBlocco: (b) => {
        coda.current.blocchi.set(b.id, b)
        pianifica()
      },
      suRighe: (r) => {
        coda.current.righe.push(...r)
        pianifica()
      },
      suVuote: (n) => {
        coda.current.vuote.push(...n)
        pianifica()
      },
    })
    if (timer.current != null) window.clearTimeout(timer.current)
    svuota()
    setRighe((prima) => applicaEsclusioni(prima, indice))
    setAnalisi('ferma')
  }

  function interrompi() {
    controllo.current?.abort()
  }

  function applicaMappatura() {
    if (!file || !mappatura) return
    const nuove: RigaAnteprima[] = []
    const senza: number[] = []
    for (const r of file.dati) {
      const x = rigaDaMappatura(r, mappatura)
      if (x) nuove.push(prepara(x, persone))
      else senza.push(r.numero)
    }
    setRighe(applicaEsclusioni(nuove, indice))
    setVuote(senza)
    setBlocchi([])
    setMappatura(null)
  }

  const modifica = useCallback((riga: number, m: Partial<RigaAnteprima>) => {
    setRighe((prima) => prima.map((r) => (r.riga === riga ? { ...r, ...m } : r)))
  }, [])
  const modificaMolte = useCallback((m: Map<number, Partial<RigaAnteprima>>) => {
    setRighe((prima) => prima.map((r) => (m.has(r.riga) ? { ...r, ...m.get(r.riga) } : r)))
  }, [])

  const esami = useMemo(() => {
    const doppioni = trovaDoppioni(righe)
    return new Map<number, EsameRiga>(righe.map((r) => [r.riga, esaminaRiga(r, { doppioni, esistenti: indice, collaboratoreNonTrovato: true })]))
  }, [righe, indice])

  const importabili = righe.filter((r) => !r.esclusa && !esami.get(r.riga)?.errori)

  async function conferma() {
    if (!file || !importabili.length) return
    const saltate: Saltata[] = righe
      .filter((r) => r.esclusa || esami.get(r.riga)?.errori)
      .map((r) => ({ riga: r.riga, motivo: motivoSaltata(r, esami.get(r.riga)!) }))
    const importate: Importata[] = []
    const senzaCollaboratore: number[] = []
    const errori: string[] = []
    const gruppi: RigaAnteprima[][] = []
    for (let i = 0; i < importabili.length; i += RIGHE_PER_CONFERMA) gruppi.push(importabili.slice(i, i + RIGHE_PER_CONFERMA))
    const id = crypto.randomUUID()
    const inizio = performance.now()
    setImportazione({ fatte: 0, totale: importabili.length })
    for (const [i, g] of gruppi.entries()) {
      let r: Awaited<ReturnType<typeof importaClienti>>
      try {
        r = await importaClienti({ importazione: id, nomeFile: file.nomeFile, blocco: i + 1, blocchi: gruppi.length, righe: g.map(perConferma) })
      } catch {
        r = { ok: false, errore: 'Connessione non riuscita.' }
      }
      if (r.ok && r.dati) {
        importate.push(...r.dati.importate)
        saltate.push(...r.dati.saltate)
        senzaCollaboratore.push(...r.dati.senzaCollaboratore)
      } else if (!r.ok) {
        errori.push(r.errore)
        saltate.push(...g.map((x) => ({ riga: x.riga, motivo: `Non importata: ${r.ok ? '' : r.errore}` })))
      }
      setImportazione({ fatte: Math.min((i + 1) * RIGHE_PER_CONFERMA, importabili.length), totale: importabili.length })
    }
    const fatte = new Set(importate.map((x) => x.riga))
    setRighe((prima) => prima.filter((r) => !fatte.has(r.riga)))
    setEsito({
      nomeFile: file.nomeFile,
      importate,
      saltate: saltate.sort((a, b) => a.riga - b.riga),
      senzaCollaboratore,
      errori: [...new Set(errori)],
      secondi: Math.round((performance.now() - inizio) / 100) / 10,
    })
    setImportazione(null)
  }

  // ---------------------------------------------------------------------------

  const totale = file?.dati.length ?? 0
  const inVolo = blocchi.reduce((s, b) => s + (b.stato === 'in_attesa' || b.stato === 'interrotto' ? 0 : b.completate), 0)
  const analizzate = analisi === 'in_corso' ? Math.min(totale, base + inVolo) : totale - daAnalizzare.length
  const percentuale = totale ? Math.round((analizzate / totale) * 100) : 0
  const bloccati = blocchi.filter((b) => b.stato === 'errore')
  const occupato = analisi === 'in_corso' || importazione != null

  return (
    <div className="grid gap-6">
      {esito && (
        <Riepilogo
          esito={esito}
          restanti={righe.length}
          onTornaAnteprima={() => setEsito(null)}
          onNuova={() => {
            nuovoFile(null)
            setChiaveFile((k) => k + 1)
          }}
        />
      )}
      <div hidden={esito != null} className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>1. Carica il file</CardTitle>
            <CardDescription>Il file non deve avere un formato preciso: bastano una riga di intestazione e un cliente per riga.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SceltaFile key={chiaveFile} onCaricato={nuovoFile} disabilitato={occupato} />
        </CardContent>
      </Card>

      {file && (
        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>2. Riconosci i dati</CardTitle>
              <CardDescription>
                L’AI legge le righe e riconosce ragione sociale, titolari, email (anche PEC), date di prima nota e IVA, dipendenti,
                fatturato, collaboratore, partita IVA, codice fiscale e telefono. I dati che non riconosce restano vuoti: non inventa nulla.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => avviaAnalisi()} disabled={occupato || !ai.disponibile || !daAnalizzare.length}>
                {analisi === 'in_corso' ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {daAnalizzare.length < totale && daAnalizzare.length > 0 && analisi !== 'in_corso'
                  ? `Analizza le righe rimaste (${daAnalizzare.length})`
                  : 'Analizza con l’AI'}
              </Button>
              {analisi === 'in_corso' && (
                <Button variant="outline" onClick={interrompi}>
                  <Square aria-hidden /> Interrompi
                </Button>
              )}
              <Button variant="outline" onClick={() => setMappatura(riconosciColonne(file.intestazione))} disabled={occupato}>
                <Columns3 aria-hidden /> Riconosci le colonne dai nomi
              </Button>
            </div>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Con l’AI le righe del file vengono inviate a Claude (Anthropic) a blocchi di 60, solo per l’analisi.
                {ai.simulata && ' In questo ambiente di sviluppo l’AI è simulata: i dati si ricavano dai nomi delle colonne.'}
                {!ai.disponibile && ' L’AI non è configurata: usa il riconoscimento delle colonne dai nomi.'}
              </span>
            </p>

            {(analisi === 'in_corso' || blocchi.length > 0) && (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <p className="font-medium" aria-live="polite">
                    {analizzate} di {totale} righe analizzate ({percentuale}%)
                  </p>
                  <p className="text-muted-foreground">
                    {analisi === 'in_corso'
                      ? 'Analisi in corso…'
                      : daAnalizzare.length
                        ? `Analisi ferma: ${daAnalizzare.length} ${daAnalizzare.length === 1 ? 'riga' : 'righe'} ancora da analizzare.`
                        : 'Analisi completata.'}
                  </p>
                </div>
                <div
                  role="progressbar"
                  aria-label="Avanzamento dell'analisi"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percentuale}
                  aria-valuetext={`${analizzate} di ${totale} righe analizzate`}
                  className="h-3 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${percentuale}%` }} />
                </div>
              </div>
            )}

            {bloccati.length > 0 && analisi !== 'in_corso' && (
              <Alert variant="pericolo">
                <AlertCircle aria-hidden />
                <div className="grid gap-2">
                  <p className="font-medium">Alcuni blocchi non sono stati analizzati:</p>
                  <ul className="grid gap-1.5">
                    {bloccati.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          Righe {b.numeri[0]}–{b.numeri[b.numeri.length - 1]}: {b.errore}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => avviaAnalisi(b.numeri)}>
                          <RotateCcw aria-hidden /> Riprova questo blocco
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {bloccati.length > 1 && (
                    <div>
                      <Button size="sm" onClick={() => avviaAnalisi(bloccati.flatMap((b) => b.numeri))}>
                        <RotateCcw aria-hidden /> Riprova tutti i blocchi non riusciti
                      </Button>
                    </div>
                  )}
                </div>
              </Alert>
            )}

            {mappatura && (
              <MappaturaColonne
                intestazione={file.intestazione}
                dati={file.dati}
                mappatura={mappatura}
                onCambia={setMappatura}
                onApplica={applicaMappatura}
                onAnnulla={() => setMappatura(null)}
                sostituisce={righe.length > 0}
              />
            )}
          </CardContent>
        </Card>
      )}

      {file && righe.length > 0 && (
        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>3. Controlla e correggi l’anteprima</CardTitle>
              <CardDescription>
                Le righe con errori non vengono importate. I campi vuoti si possono completare qui o dopo, dalla scheda del cliente.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {vuote.length > 0 && (
              <p className="flex gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {vuote.length === 1 ? 'Nella riga' : 'Nelle righe'} {vuote.slice(0, 20).join(', ')}
                  {vuote.length > 20 ? ` e altre ${vuote.length - 20}` : ''} non c’è un cliente (righe vuote, di titolo o di totale): non entrano nell’anteprima.
                </span>
              </p>
            )}
            <Anteprima righe={righe} esami={esami} persone={persone} onModifica={modifica} onModificaMolte={modificaMolte} />
          </CardContent>
        </Card>
      )}

      {file && righe.length > 0 && (
        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>4. Conferma</CardTitle>
              <CardDescription>
                Si importano {importabili.length} {importabili.length === 1 ? 'cliente' : 'clienti'}; {righe.length - importabili.length}{' '}
                {righe.length - importabili.length === 1 ? 'riga viene saltata' : 'righe vengono saltate'} (escluse o con errori). Le date di prima nota e IVA
                entrano nello storico degli indicatori come valore iniziale.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {importazione ? (
              <div className="grid gap-2" role="status">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Importazione in corso: {importazione.fatte} di {importazione.totale} clienti…
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((importazione.fatte / importazione.totale) * 100)}%` }} />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={conferma} disabled={occupato || !importabili.length}>
                  <Upload aria-hidden /> Importa {importabili.length} {importabili.length === 1 ? 'cliente' : 'clienti'}
                </Button>
                {analisi === 'in_corso' && <p className="text-sm text-muted-foreground">Aspetta la fine dell’analisi o interrompila.</p>}
                {!importabili.length && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4" aria-hidden /> Nessuna riga pronta da importare.
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Dopo l’importazione trovi i clienti nell’<Link href="/clienti" className="text-primary underline">elenco clienti</Link>.
            </p>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
