'use client'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Plus, RefreshCw, X } from 'lucide-react'
import type { EsitoAzione } from '@/lib/errori'
import { nomeVisualizzazione } from '@/lib/clienti/nome'
import { Campo, Input, Select, Textarea, Label } from '@/components/ui/campi'
import { Button } from '@/components/ui/button'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type ValoriAnagrafica = {
  ragione_sociale: string
  nome_visualizzazione: string
  telefono: string
  codice_fiscale: string
  partita_iva: string
  numero_dipendenti: string
  fatturato: string
  note: string
  alias: string
  stato: 'attivo' | 'archiviato'
  titolari: { nome: string; cognome: string }[]
  email: { indirizzo: string; tipo: 'ordinaria' | 'pec' }[]
}

export function ModuloAnagrafica({
  azione, valori, nuovo, colleghi, annulla,
}: {
  azione: (s: EsitoAzione | null, fd: FormData) => Promise<EsitoAzione>
  valori: ValoriAnagrafica
  nuovo: boolean
  colleghi?: { id: string; nome: string; cognome: string }[]
  annulla: string
}) {
  const [esito, invia] = useActionState(azione, null)
  const [titolari, setTitolari] = useState(valori.titolari.length ? valori.titolari : [{ nome: '', cognome: '' }])
  const [email, setEmail] = useState(valori.email)
  const [ragione, setRagione] = useState(valori.ragione_sociale)
  const [nomeVis, setNomeVis] = useState(valori.nome_visualizzazione)
  const campi = esito && !esito.ok ? esito.campi : undefined
  const proposto = nomeVisualizzazione(ragione || '…', titolari[0])

  return (
    <form action={invia} className="grid gap-6" noValidate>
      <MessaggioEsito esito={esito} />
      <Card>
        <CardHeader><CardTitle>Azienda</CardTitle></CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <Campo id="ragione_sociale" etichetta="Ragione sociale" errore={campi?.ragione_sociale} className="sm:col-span-2">
            <Input name="ragione_sociale" value={ragione} onChange={(e) => setRagione(e.target.value)} required />
          </Campo>
          {nuovo ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Nome di visualizzazione: <strong className="text-foreground">{proposto}</strong> (generato da ragione sociale e titolare; resta stabile).
            </p>
          ) : (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nome_visualizzazione">Nome di visualizzazione</Label>
              <div className="flex gap-2">
                <Input id="nome_visualizzazione" name="nome_visualizzazione" value={nomeVis} onChange={(e) => setNomeVis(e.target.value)} aria-describedby="nv-aiuto" aria-invalid={campi?.nome_visualizzazione ? true : undefined} />
                <Button type="button" variant="outline" onClick={() => setNomeVis(proposto)}><RefreshCw /> Rigenera</Button>
              </div>
              <p id="nv-aiuto" className="text-xs text-muted-foreground">Nome unico e stabile del cliente: servirà per nominare i file. Cambialo solo se serve davvero.</p>
              {campi?.nome_visualizzazione && <p className="text-xs font-medium text-destructive">{campi.nome_visualizzazione}</p>}
            </div>
          )}
          <Campo id="partita_iva" etichetta="Partita IVA" facoltativo errore={campi?.partita_iva}>
            <Input name="partita_iva" defaultValue={valori.partita_iva} inputMode="numeric" />
          </Campo>
          <Campo id="codice_fiscale" etichetta="Codice fiscale" facoltativo errore={campi?.codice_fiscale}>
            <Input name="codice_fiscale" defaultValue={valori.codice_fiscale} />
          </Campo>
          <Campo id="telefono" etichetta="Telefono" facoltativo>
            <Input name="telefono" type="tel" defaultValue={valori.telefono} />
          </Campo>
          <Campo id="numero_dipendenti" etichetta="N. dipendenti" facoltativo errore={campi?.numero_dipendenti}>
            <Input name="numero_dipendenti" type="number" min={0} step={1} defaultValue={valori.numero_dipendenti} />
          </Campo>
          <Campo id="fatturato" etichetta="Fatturato (€)" facoltativo errore={campi?.fatturato} aiuto="Un solo valore, senza anno di riferimento.">
            <Input name="fatturato" inputMode="decimal" defaultValue={valori.fatturato} placeholder="Per esempio 1.250.000" />
          </Campo>
          {!nuovo && (
            <Campo id="stato" etichetta="Stato">
              <Select name="stato" defaultValue={valori.stato}>
                <option value="attivo">Attivo</option>
                <option value="archiviato">Archiviato</option>
              </Select>
            </Campo>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Titolari</CardTitle>
            <CardDescription>Una o più persone, per esempio i soci. Il primo è il titolare principale.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0">
          {titolari.map((t, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Campo id={`titolare-nome-${i}`} etichetta={i === 0 ? 'Nome (titolare principale)' : `Nome (titolare ${i + 1})`}>
                <Input name="titolare_nome" value={t.nome} onChange={(e) => setTitolari(titolari.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
              </Campo>
              <Campo id={`titolare-cognome-${i}`} etichetta="Cognome">
                <Input name="titolare_cognome" value={t.cognome} onChange={(e) => setTitolari(titolari.map((x, j) => (j === i ? { ...x, cognome: e.target.value } : x)))} />
              </Campo>
              <Button type="button" variant="ghost" disabled={titolari.length === 1} onClick={() => setTitolari(titolari.filter((_, j) => j !== i))} aria-label={`Togli il titolare ${i + 1}`}>
                <X /> Togli
              </Button>
            </div>
          ))}
          <div><Button type="button" variant="outline" size="sm" onClick={() => setTitolari([...titolari, { nome: '', cognome: '' }])}><Plus /> Aggiungi titolare</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Indirizzi email collegati</CardTitle>
            <CardDescription>Tutti gli indirizzi del cliente, PEC comprese: servono a riconoscere le sue email.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0">
          {campi?.email && <p className="text-sm font-medium text-destructive">{campi.email}</p>}
          {email.length === 0 && <p className="text-sm text-muted-foreground">Nessun indirizzo.</p>}
          {email.map((e, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <Campo id={`email-${i}`} etichetta={`Indirizzo ${i + 1}`}>
                <Input name="email_indirizzo" type="email" value={e.indirizzo} onChange={(ev) => setEmail(email.map((x, j) => (j === i ? { ...x, indirizzo: ev.target.value } : x)))} />
              </Campo>
              <Campo id={`email-tipo-${i}`} etichetta="Tipo">
                <Select name="email_tipo" value={e.tipo} onChange={(ev) => setEmail(email.map((x, j) => (j === i ? { ...x, tipo: ev.target.value as 'pec' | 'ordinaria' } : x)))}>
                  <option value="ordinaria">Email ordinaria</option>
                  <option value="pec">PEC</option>
                </Select>
              </Campo>
              <Button type="button" variant="ghost" onClick={() => setEmail(email.filter((_, j) => j !== i))} aria-label={`Togli l'indirizzo ${i + 1}`}><X /> Togli</Button>
            </div>
          ))}
          <div><Button type="button" variant="outline" size="sm" onClick={() => setEmail([...email, { indirizzo: '', tipo: 'ordinaria' }])}><Plus /> Aggiungi indirizzo</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Altro</CardTitle></CardHeader>
        <CardContent className="grid gap-4 pt-0">
          {nuovo && colleghi && (
            <Campo id="referente" etichetta="Collaboratore referente" facoltativo>
              <Select name="referente" defaultValue="">
                <option value="">Nessuno per ora</option>
                {colleghi.map((c) => <option key={c.id} value={c.id}>{c.nome} {c.cognome}</option>)}
              </Select>
            </Campo>
          )}
          <Campo id="alias" etichetta="Alias" facoltativo aiuto="Nomi alternativi con cui il cliente viene chiamato, uno per riga.">
            <Textarea name="alias" rows={2} defaultValue={valori.alias} />
          </Campo>
          <Campo id="note" etichetta="Note interne" facoltativo>
            <Textarea name="note" rows={3} defaultValue={valori.note} />
          </Campo>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <PulsanteInvio testoAttesa="Salvataggio…">{nuovo ? 'Crea il cliente' : 'Salva le modifiche'}</PulsanteInvio>
        <Button asChild variant="ghost"><Link href={annulla}>Annulla</Link></Button>
      </div>
    </form>
  )
}
