'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle, AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, Loader2, MailCheck, MinusCircle, RotateCcw,
} from 'lucide-react'
import { invitaRiga, type EsitoInvito } from '../azioni'
import {
  controllaRighe, leggiRighe, MASSIMO_RIGHE, TESTI_PROBLEMI, type Colonne, type RigaImport, type Ruolo,
} from '@/lib/studio/importa'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Checkbox, Input, Select } from '@/components/ui/campi'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { DialogoConferma } from '@/components/studio/dialogo-conferma'

type Riga = RigaImport & { includi: boolean }
type Esito =
  | { stato: 'in_corso' }
  | { stato: 'fatto'; dati: EsitoInvito }
  | { stato: 'errore'; messaggio: string }

async function leggiFile(file: File): Promise<unknown[][][]> {
  const XLSX = await import('@e965/xlsx')
  const csv = /\.(csv|txt)$/i.test(file.name)
  const libro = csv
    ? XLSX.read(await file.text(), { type: 'string', raw: false })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  return libro.SheetNames.map((n) =>
    XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false }),
  )
}

async function scaricaModello() {
  const XLSX = await import('@e965/xlsx')
  const foglio = XLSX.utils.aoa_to_sheet([
    ['Nome', 'Cognome', 'Email', 'Ruolo'],
    ['Mario', 'Rossi', 'mario.rossi@esempio.it', 'collaboratore'],
    ['Anna', 'De Luca', 'anna.deluca@esempio.it', 'admin'],
  ])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, foglio, 'Collaboratori')
  XLSX.writeFile(libro, 'modello-collaboratori.xlsx')
}

function descriviColonne(c: Colonne): string {
  const parti = [
    c.nome !== undefined ? 'nome' : '',
    c.cognome !== undefined ? 'cognome' : '',
    c.nomeCompleto !== undefined ? (c.cognomePrima ? 'cognome e nome insieme' : 'nome e cognome insieme') : '',
    c.email !== undefined ? 'email' : '',
    c.ruolo !== undefined ? 'ruolo' : '',
  ].filter(Boolean)
  return parti.join(', ')
}

function CopiaBreve({ link, nome }: { link: string; nome: string }) {
  const [copiato, setCopiato] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={`Copia il link di invito di ${nome}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link)
          setCopiato(true)
          setTimeout(() => setCopiato(false), 3000)
        } catch {
          window.prompt('Copia il link di invito:', link)
        }
      }}
    >
      {copiato ? <CheckCircle2 aria-hidden /> : <Copy aria-hidden />}
      {copiato ? 'Copiato' : 'Copia link'}
    </Button>
  )
}

export function ImportaCollaboratori({
  emailStudio, emailInvitate, emailConfigurata,
}: { emailStudio: string[]; emailInvitate: string[]; emailConfigurata: boolean }) {
  const [nomeFile, setNomeFile] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [colonne, setColonne] = useState<Colonne | null>(null)
  const [righe, setRighe] = useState<Riga[]>([])
  const [esiti, setEsiti] = useState<Record<string, Esito>>({})
  const [inCorso, setInCorso] = useState(false)
  const [lettura, setLettura] = useState(false)
  const [chiaveFile, setChiaveFile] = useState(0)

  const problemi = useMemo(() => controllaRighe(righe, { emailStudio, emailInvitate }), [righe, emailStudio, emailInvitate])
  const iniziato = Object.keys(esiti).length > 0
  const pronte = righe.filter((r) => r.includi && (problemi.get(r.chiave)?.length ?? 0) === 0 && !esiti[r.chiave])
  const daCorreggere = righe.filter((r) => (problemi.get(r.chiave)?.length ?? 0) > 0 && !esiti[r.chiave]).length
  const fatte = Object.values(esiti).filter((e) => e.stato !== 'in_corso').length
  const totaleInvio = Object.keys(esiti).length

  async function scegliFile(file: File | undefined) {
    setErrore(null)
    setRighe([])
    setEsiti({})
    setColonne(null)
    if (!file) return
    setNomeFile(file.name)
    setLettura(true)
    try {
      const fogli = await leggiFile(file)
      const trovato = fogli.map((f) => leggiRighe(f)).find((x) => x.righe.length > 0)
      if (!trovato) {
        setErrore(
          'Non troviamo le persone nel file. Controlla che la prima riga abbia i titoli delle colonne (per esempio Nome, Cognome, Email, Ruolo) e che ci sia almeno un indirizzo email.',
        )
        return
      }
      if (trovato.righe.length > MASSIMO_RIGHE) {
        setErrore(`Il file ha ${trovato.righe.length} righe: se ne importano al massimo ${MASSIMO_RIGHE} per volta. Dividi il file e riprova.`)
        return
      }
      setColonne(trovato.colonne)
      const iniziali = trovato.righe
      const p = controllaRighe(iniziali, { emailStudio, emailInvitate })
      setRighe(iniziali.map((r) => ({ ...r, includi: (p.get(r.chiave)?.length ?? 0) === 0 })))
    } catch {
      setErrore('Non riusciamo a leggere questo file. Usa un file Excel (.xlsx o .xls), CSV o ODS.')
    } finally {
      setLettura(false)
    }
  }

  function modifica(chiave: string, campo: 'nome' | 'cognome' | 'email' | 'ruolo' | 'includi', valore: string | boolean) {
    setRighe((rr) =>
      rr.map((r) => {
        if (r.chiave !== chiave) return r
        const nuova = { ...r, [campo]: valore } as Riga
        if (campo === 'ruolo') delete nuova.ruoloDubbio
        // correggere una riga la include di nuovo
        if (campo !== 'includi' && campo !== 'ruolo') nuova.includi = true
        return nuova
      }),
    )
  }

  async function invitaTutte() {
    const daFare = pronte
    setInCorso(true)
    setEsiti((e) => ({ ...e, ...Object.fromEntries(daFare.map((r) => [r.chiave, { stato: 'in_corso' } as Esito])) }))
    for (const r of daFare) {
      let esito: Esito
      try {
        const x = await invitaRiga({ nome: r.nome, cognome: r.cognome, email: r.email, ruolo: r.ruolo })
        esito = x.ok && x.dati ? { stato: 'fatto', dati: x.dati } : { stato: 'errore', messaggio: x.ok ? 'Esito sconosciuto' : x.errore }
      } catch {
        esito = { stato: 'errore', messaggio: 'Connessione interrotta: riprova.' }
      }
      setEsiti((e) => ({ ...e, [r.chiave]: esito }))
    }
    setInCorso(false)
  }

  function statoRiga(r: Riga) {
    const e = esiti[r.chiave]
    if (e?.stato === 'in_corso') return <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> In attesa…</span>
    if (e?.stato === 'errore') return <span className="flex items-start gap-1.5 text-sm text-pericolo"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> Non riuscito: {e.messaggio}</span>
    if (e?.stato === 'fatto') {
      return e.dati.emailInviata ? (
        <Badge variant="successo"><MailCheck aria-hidden /> Invito mandato</Badge>
      ) : (
        <span className="grid justify-items-start gap-1.5">
          <Badge variant="avviso"><AlertTriangle aria-hidden /> Invito creato, email non partita</Badge>
          {e.dati.link && <CopiaBreve link={e.dati.link} nome={`${r.nome} ${r.cognome}`.trim()} />}
        </span>
      )
    }
    const p = problemi.get(r.chiave) ?? []
    if (p.length) {
      return (
        <ul className="grid gap-0.5 text-sm text-pericolo">
          {p.map((x) => (
            <li key={x} className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {TESTI_PROBLEMI[x]}</li>
          ))}
        </ul>
      )
    }
    if (!r.includi) return <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><MinusCircle className="size-4" aria-hidden /> Esclusa</span>
    return (
      <span className="grid gap-0.5">
        <Badge variant="successo"><CheckCircle2 aria-hidden /> Pronta</Badge>
        {r.ruoloDubbio && <span className="text-xs text-avviso">Ruolo non riconosciuto: controlla</span>}
      </span>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>1. Scegli il file</CardTitle>
            <CardDescription>
              Riconosciamo le colonne dai titoli: <strong>Nome</strong>, <strong>Cognome</strong> (oppure una colonna
              &quot;Nome e cognome&quot;), <strong>Email</strong> e, se c&apos;è, <strong>Ruolo</strong> (admin o collaboratore;
              se manca, collaboratore). Il file resta sul tuo computer: leggiamo solo le righe che confermi.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={scaricaModello}><Download aria-hidden /> Scarica un modello</Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="file-collaboratori" className="text-sm font-medium">File Excel, CSV o ODS</label>
            <input
              key={chiaveFile}
              id="file-collaboratori"
              type="file"
              accept=".xlsx,.xls,.csv,.ods,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.oasis.opendocument.spreadsheet"
              disabled={inCorso}
              onChange={(e) => scegliFile(e.target.files?.[0])}
              className="block w-full max-w-md cursor-pointer rounded-md border border-input bg-card text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </div>
          {lettura && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Lettura del file…</p>}
          {errore && (
            <Alert variant="pericolo">
              <AlertCircle aria-hidden />
              <p>{errore}</p>
            </Alert>
          )}
          {colonne && nomeFile && (
            <Alert variant="info">
              <FileSpreadsheet aria-hidden />
              <p>
                <strong>{nomeFile}</strong>: {righe.length} {righe.length === 1 ? 'persona trovata' : 'persone trovate'}. Colonne
                riconosciute: {descriviColonne(colonne)}.
              </p>
            </Alert>
          )}
        </CardContent>
      </Card>

      {righe.length > 0 && (
        <Card aria-labelledby="titolo-anteprima">
          <CardHeader>
            <div>
              <CardTitle id="titolo-anteprima">2. Controlla l&apos;anteprima</CardTitle>
              <CardDescription>
                Puoi correggere nomi, email e ruoli qui sotto. Le righe con un problema non vengono importate finché non le
                correggi; togli la spunta per escludere una riga.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 px-0 pt-0">
            <p className="px-5 text-sm" aria-live="polite">
              <strong>{pronte.length}</strong> {pronte.length === 1 ? 'pronta' : 'pronte'} da invitare
              {daCorreggere > 0 && <> · <strong className="text-pericolo">{daCorreggere}</strong> da correggere</>}
              {iniziato && <> · inviti elaborati: {fatte} di {totaleInvio}</>}
            </p>
            <Table>
              <THead>
                <TR>
                  <TH className="w-10"><span className="sr-only">Includi</span></TH>
                  <TH>Riga</TH>
                  <TH>Nome</TH>
                  <TH>Cognome</TH>
                  <TH>Email</TH>
                  <TH>Ruolo</TH>
                  <TH>Stato</TH>
                </TR>
              </THead>
              <TBody>
                {righe.map((r) => {
                  const bloccata = Boolean(esiti[r.chiave]) || inCorso
                  const nonValida = !esiti[r.chiave] && (problemi.get(r.chiave)?.length ?? 0) > 0
                  return (
                    <TR key={r.chiave}>
                      <TD>
                        <Checkbox
                          checked={r.includi && !nonValida}
                          disabled={bloccata || nonValida}
                          onChange={(e) => modifica(r.chiave, 'includi', e.target.checked)}
                          aria-label={`Includi la riga ${r.riga}`}
                        />
                      </TD>
                      <TD className="text-muted-foreground tabular-nums">{r.riga}</TD>
                      <TD><Input value={r.nome} disabled={bloccata} onChange={(e) => modifica(r.chiave, 'nome', e.target.value)} aria-label={`Nome, riga ${r.riga}`} className="min-w-28" /></TD>
                      <TD><Input value={r.cognome} disabled={bloccata} onChange={(e) => modifica(r.chiave, 'cognome', e.target.value)} aria-label={`Cognome, riga ${r.riga}`} className="min-w-28" /></TD>
                      <TD><Input type="email" value={r.email} disabled={bloccata} onChange={(e) => modifica(r.chiave, 'email', e.target.value)} aria-label={`Email, riga ${r.riga}`} aria-invalid={nonValida || undefined} className="min-w-52" /></TD>
                      <TD>
                        <Select value={r.ruolo} disabled={bloccata} onChange={(e) => modifica(r.chiave, 'ruolo', e.target.value as Ruolo)} aria-label={`Ruolo, riga ${r.riga}`} className="min-w-40">
                          <option value="collaboratore">Collaboratore</option>
                          <option value="admin">Admin</option>
                        </Select>
                      </TD>
                      <TD className="min-w-48">{statoRiga(r)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
            <div className="flex flex-wrap items-center gap-3 px-5">
              <DialogoConferma
                etichetta={`Invita ${pronte.length} ${pronte.length === 1 ? 'persona' : 'persone'}`}
                variante="default"
                dimensione="default"
                icona={<MailCheck aria-hidden />}
                disabilitato={pronte.length === 0 || inCorso}
                titolo={`Mandare ${pronte.length} ${pronte.length === 1 ? 'invito' : 'inviti'}?`}
                descrizione={
                  <>
                    <p>Creiamo gli inviti uno per uno e, per ognuno, mandiamo l&apos;email con il link per scegliere la password (vale 7 giorni).</p>
                    {!emailConfigurata && <p>Il servizio email non è configurato: alla fine trovi il link di ogni persona da copiare e mandare tu.</p>}
                    <p>L&apos;esito compare nella colonna &quot;Stato&quot; di ogni riga.</p>
                  </>
                }
                testoConferma="Manda gli inviti"
                azione={async () => {
                  // gli inviti partono uno per uno: l'esito si segue nella tabella, riga per riga
                  void invitaTutte()
                  return { ok: true, messaggio: 'Invio degli inviti avviato: segui l\'esito nella colonna "Stato".' }
                }}
              />
              {inCorso && <span className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite"><Loader2 className="size-4 animate-spin" aria-hidden /> Invio in corso: {fatte} di {totaleInvio}</span>}
              {iniziato && !inCorso && (
                <>
                  <Button asChild variant="outline"><Link href="/studio/utenti">Vai a Utenti e inviti</Link></Button>
                  <Button variant="ghost" onClick={() => { setChiaveFile((k) => k + 1); setNomeFile(null); scegliFile(undefined) }}><RotateCcw aria-hidden /> Importa un altro file</Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
