'use client'
import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Equal, Loader2, Upload, XCircle } from 'lucide-react'
import { candidatiCliente, indiceClienti, riconosciColonneAssegnazioni, type ColonneAssegnazioni } from '@/lib/importazione/assegnazioni'
import { abbinaCollaboratore, type ClienteEsistente, type Persona } from '@/lib/importazione/righe'
import type { EsitoAzione } from '@/lib/errori'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Input, Label, Select } from '@/components/ui/campi'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { importaAssegnazioni } from '../azioni'
import { SceltaFile, type FileCaricato } from './scelta-file'

type ClienteStudio = ClienteEsistente & { referente_id: string | null }

type RigaAssegnazione = {
  riga: number
  testoCliente: string
  testoPartitaIva: string
  testoCollaboratore: string
  candidati: ClienteStudio[]
  cliente_id: string | null
  utente_id: string | null
  esclusa: boolean
}

const PER_PAGINA = 50

function costruisci(file: FileCaricato, colonne: ColonneAssegnazioni, clienti: ClienteStudio[], persone: Persona[]): RigaAssegnazione[] {
  const indice = indiceClienti(clienti)
  const cella = (r: { celle: string[] }, i: number | null) => (i == null ? '' : (r.celle[i] ?? '').trim())
  return file.dati
    .map((r) => {
      const testoCliente = cella(r, colonne.cliente)
      const testoPartitaIva = cella(r, colonne.partitaIva)
      const testoCollaboratore = cella(r, colonne.collaboratore)
      const candidati = candidatiCliente(testoCliente, testoPartitaIva, indice) as ClienteStudio[]
      return {
        riga: r.numero,
        testoCliente,
        testoPartitaIva,
        testoCollaboratore,
        candidati,
        cliente_id: candidati.length === 1 ? candidati[0].id : null,
        utente_id: abbinaCollaboratore(testoCollaboratore, persone),
        esclusa: false,
      }
    })
    .filter((r) => r.testoCliente || r.testoPartitaIva || r.testoCollaboratore)
}

type Stato = 'esclusa' | 'cliente' | 'ambiguo' | 'collaboratore' | 'invariata' | 'pronta'

function statoDi(r: RigaAssegnazione, perId: Map<string, ClienteStudio>): Stato {
  if (r.esclusa) return 'esclusa'
  if (!r.cliente_id) return r.candidati.length > 1 ? 'ambiguo' : 'cliente'
  if (!r.utente_id) return 'collaboratore'
  if (perId.get(r.cliente_id)?.referente_id === r.utente_id) return 'invariata'
  return 'pronta'
}

const ETICHETTE: Record<Stato, { testo: string; variante: 'neutro' | 'pericolo' | 'avviso' | 'successo'; Icona: typeof Ban }> = {
  esclusa: { testo: 'Esclusa', variante: 'neutro', Icona: Ban },
  cliente: { testo: 'Cliente non trovato', variante: 'pericolo', Icona: XCircle },
  ambiguo: { testo: 'Più clienti: scegli', variante: 'avviso', Icona: CircleAlert },
  collaboratore: { testo: 'Collaboratore non trovato', variante: 'pericolo', Icona: XCircle },
  invariata: { testo: 'Già assegnato', variante: 'neutro', Icona: Equal },
  pronta: { testo: 'Pronta', variante: 'successo', Icona: CheckCircle2 },
}

/** Importazione delle assegnazioni cliente-collaboratore (sezione 6). */
export function ImportaAssegnazioni({ clienti, persone }: { clienti: ClienteStudio[]; persone: Persona[] }) {
  const id = useId()
  const [file, setFile] = useState<FileCaricato | null>(null)
  const [colonne, setColonne] = useState<ColonneAssegnazioni | null>(null)
  const [righe, setRighe] = useState<RigaAssegnazione[]>([])
  const [pagina, setPagina] = useState(0)
  const [invio, setInvio] = useState(false)
  const [esito, setEsito] = useState<EsitoAzione<{ assegnate: number; invariate: number }> | null>(null)

  const perId = useMemo(() => new Map(clienti.map((c) => [c.id, c])), [clienti])
  const perNome = useMemo(() => new Map(clienti.map((c) => [c.nome_visualizzazione.toLowerCase(), c])), [clienti])
  const nomePersona = useMemo(() => new Map(persone.map((p) => [p.id, `${p.nome} ${p.cognome}`])), [persone])

  function caricato(f: FileCaricato | null) {
    setFile(f)
    setEsito(null)
    setPagina(0)
    if (!f) {
      setColonne(null)
      setRighe([])
      return
    }
    const c = riconosciColonneAssegnazioni(f.intestazione)
    setColonne(c)
    setRighe(c.cliente != null || c.partitaIva != null ? costruisci(f, c, clienti, persone) : [])
  }

  function cambiaColonne(c: ColonneAssegnazioni) {
    setColonne(c)
    setPagina(0)
    if (file) setRighe(c.cliente != null || c.partitaIva != null ? costruisci(file, c, clienti, persone) : [])
  }

  const modifica = (riga: number, m: Partial<RigaAssegnazione>) => setRighe((p) => p.map((r) => (r.riga === riga ? { ...r, ...m } : r)))

  const stati = righe.map((r) => statoDi(r, perId))
  const conteggio = (s: Stato) => stati.filter((x) => x === s).length
  const pronte = righe.filter((_, i) => stati[i] === 'pronta')
  const pagine = Math.max(1, Math.ceil(righe.length / PER_PAGINA))
  const p = Math.min(pagina, pagine - 1)

  async function conferma() {
    if (!file || !pronte.length) return
    setInvio(true)
    try {
      const r = await importaAssegnazioni({ nomeFile: file.nomeFile, coppie: pronte.map((x) => ({ cliente_id: x.cliente_id!, utente_id: x.utente_id! })) })
      // dopo il salvataggio la pagina si aggiorna: le righe assegnate risultano "Già assegnato"
      setEsito(r)
    } catch {
      setEsito({ ok: false, errore: 'Connessione non riuscita. Riprova.' })
    } finally {
      setInvio(false)
    }
  }

  const sceltaColonna = (chiave: keyof ColonneAssegnazioni, etichetta: string, facoltativa?: boolean) =>
    file && colonne ? (
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-${chiave}`}>
          {etichetta}
          {facoltativa && <span className="ml-1 font-normal text-muted-foreground">(facoltativa)</span>}
        </Label>
        <Select
          id={`${id}-${chiave}`}
          value={colonne[chiave] ?? ''}
          onChange={(e) => cambiaColonne({ ...colonne, [chiave]: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-64"
        >
          <option value="">— nessuna —</option>
          {file.intestazione.map((h, i) => (
            <option key={i} value={i}>{h}</option>
          ))}
        </Select>
      </div>
    ) : null

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>1. Carica il file delle assegnazioni</CardTitle>
            <CardDescription>
              Serve una colonna con il cliente (ragione sociale, nome di visualizzazione o partita IVA) e una con il collaboratore.
              Il collaboratore diventa il referente principale del cliente; lo storico delle assegnazioni resta.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SceltaFile onCaricato={caricato} disabilitato={invio} etichetta="File delle assegnazioni" />
          {file && colonne && (
            <div className="flex flex-wrap gap-4">
              {sceltaColonna('cliente', 'Colonna del cliente')}
              {sceltaColonna('partitaIva', 'Colonna della partita IVA', true)}
              {sceltaColonna('collaboratore', 'Colonna del collaboratore')}
            </div>
          )}
          {file && colonne && colonne.cliente == null && colonne.partitaIva == null && (
            <Alert variant="avviso">
              <CircleAlert aria-hidden />
              <p>Non trovo la colonna del cliente: sceglila qui sopra.</p>
            </Alert>
          )}
        </CardContent>
      </Card>

      {righe.length > 0 && (
        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>2. Controlla le assegnazioni</CardTitle>
              <CardDescription>
                {righe.length} righe: {conteggio('pronta')} pronte, {conteggio('cliente')} con cliente non trovato, {conteggio('ambiguo')} da scegliere,{' '}
                {conteggio('collaboratore')} con collaboratore non trovato, {conteggio('invariata')} già assegnate, {conteggio('esclusa')} escluse.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <datalist id={`${id}-clienti`}>
              {clienti.map((c) => (
                <option key={c.id} value={c.nome_visualizzazione} />
              ))}
            </datalist>
            <div className="max-h-[70vh] overflow-auto rounded-lg border">
              <table className="w-max min-w-full text-sm">
                <caption className="sr-only">Assegnazioni lette dal file</caption>
                <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                  <tr>
                    {['Riga', 'Escludi', 'Stato', 'Nel file', 'Cliente dello studio', 'Collaboratore', 'Referente attuale'].map((h) => (
                      <th key={h} scope="col" className="h-9 px-2 text-left font-semibold whitespace-nowrap first:pl-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {righe.slice(p * PER_PAGINA, (p + 1) * PER_PAGINA).map((r) => {
                    const stato = statoDi(r, perId)
                    const { testo, variante, Icona } = ETICHETTE[stato]
                    const cliente = r.cliente_id ? perId.get(r.cliente_id) : null
                    return (
                      <tr key={r.riga} className="border-b align-top">
                        <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-normal text-muted-foreground">{r.riga}</th>
                        <td className="px-2 py-2">
                          <Checkbox aria-label={`Escludi la riga ${r.riga}`} checked={r.esclusa} onChange={(e) => modifica(r.riga, { esclusa: e.target.checked })} />
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={variante}><Icona aria-hidden /> {testo}</Badge>
                        </td>
                        <td className="max-w-72 px-2 py-2">
                          <p>{r.testoCliente || '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.testoPartitaIva && `P. IVA ${r.testoPartitaIva} · `}Collaboratore: {r.testoCollaboratore || '—'}
                          </p>
                        </td>
                        <td className="px-2 py-2">
                          {r.candidati.length > 1 ? (
                            <Select
                              aria-label={`Cliente dello studio, riga ${r.riga}`}
                              value={r.cliente_id ?? ''}
                              onChange={(e) => modifica(r.riga, { cliente_id: e.target.value || null })}
                              className="h-8 w-72"
                            >
                              <option value="">Scegli tra {r.candidati.length} clienti…</option>
                              {r.candidati.map((c) => (
                                <option key={c.id} value={c.id}>{c.nome_visualizzazione}</option>
                              ))}
                            </Select>
                          ) : (
                            <Input
                              key={cliente?.id ?? 'nessuno'}
                              aria-label={`Cliente dello studio, riga ${r.riga}`}
                              list={`${id}-clienti`}
                              defaultValue={cliente?.nome_visualizzazione ?? ''}
                              placeholder="Cerca il cliente…"
                              onBlur={(e) => {
                                const c = perNome.get(e.target.value.trim().toLowerCase())
                                if ((c?.id ?? null) !== r.cliente_id) modifica(r.riga, { cliente_id: c?.id ?? null })
                              }}
                              className="h-8 w-72"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Select
                            aria-label={`Collaboratore, riga ${r.riga}`}
                            value={r.utente_id ?? ''}
                            onChange={(e) => modifica(r.riga, { utente_id: e.target.value || null })}
                            className="h-8 w-48"
                          >
                            <option value="">— scegli —</option>
                            {persone.map((x) => (
                              <option key={x.id} value={x.id}>{x.nome} {x.cognome}</option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {cliente ? (cliente.referente_id ? nomePersona.get(cliente.referente_id) ?? '—' : 'nessuno') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pagine > 1 && (
              <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Pagine delle assegnazioni">
                <Button size="sm" variant="outline" onClick={() => setPagina(p - 1)} disabled={p === 0}>
                  <ChevronLeft aria-hidden /> Precedente
                </Button>
                <p className="text-sm text-muted-foreground">Pagina {p + 1} di {pagine}</p>
                <Button size="sm" variant="outline" onClick={() => setPagina(p + 1)} disabled={p >= pagine - 1}>
                  Successiva <ChevronRight aria-hidden />
                </Button>
              </nav>
            )}
            <MessaggioEsito esito={esito} />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={conferma} disabled={invio || !pronte.length}>
                {invio ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
                Assegna {pronte.length} {pronte.length === 1 ? 'cliente' : 'clienti'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Le righe con cliente o collaboratore non trovato, già assegnate o escluse non cambiano nulla.{' '}
                <Link href="/clienti" className="text-primary underline">Elenco clienti</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
