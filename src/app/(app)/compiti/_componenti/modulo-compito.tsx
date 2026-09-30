'use client'
import Link from 'next/link'
import { useActionState, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowUp, Flame, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Campo, Checkbox, Input, Label, Select, Textarea } from '@/components/ui/campi'
import { MessaggioEsito } from '@/components/ui/messaggio'
import type { EsitoAzione } from '@/lib/errori'
import { MAX_FILE_PER_VOLTA } from '@/lib/documenti/regole'
import { cn } from '@/lib/utils'
import { creaCompito, modificaCompito } from '../azioni'
import { caricaFile } from './carica-file'
import { ComboboxCliente, type OpzioneCliente } from './combobox-cliente'
import { SceltaFile, fileValidi } from './scelta-file'

export type PersonaAssegnabile = { id: string; nome: string; ruolo: string; io: boolean; nonAssegnabile?: boolean }

export type ValoriCompito = {
  id: string
  titolo: string
  descrizione: string
  cliente: string
  assegnatario: string
  altriAssegnatari: string[]
  data: string
  ora: string
  nessuna: boolean
  priorita: 'normale' | 'alta' | 'urgente'
}

const PRIORITA = [
  { valore: 'normale', etichetta: 'Normale', icona: null },
  { valore: 'alta', etichetta: 'Alta', icona: ArrowUp },
  { valore: 'urgente', etichetta: 'Urgente', icona: Flame },
] as const

/** Modulo "Nuovo compito" e "Modifica compito" (sezione 8). */
export function ModuloCompito({
  modo, iniziale, clienti, persone, fisso, limiteByte, annulla,
}: {
  modo: 'nuovo' | 'modifica'
  iniziale: ValoriCompito
  clienti: OpzioneCliente[]
  persone: PersonaAssegnabile[]
  /** "Chi può creare compiti: solo per sé" → il collaboratore è sempre chi crea */
  fisso: boolean
  limiteByte: number
  annulla: string
}) {
  const router = useRouter()
  const [cliente, setCliente] = useState(iniziale.cliente)
  const [assegnatario, setAssegnatario] = useState(iniziale.assegnatario)
  const [notaReferente, setNotaReferente] = useState<string | null>(null)
  const [nessuna, setNessuna] = useState(iniziale.nessuna)
  const [priorita, setPriorita] = useState(iniziale.priorita)
  const [file, setFile] = useState<File[]>([])
  const [avanzamento, setAvanzamento] = useState<string | null>(null)

  const [esito, invia, inAttesa] = useActionState(
    async (prima: EsitoAzione<{ id: string }> | EsitoAzione | null, fd: FormData): Promise<EsitoAzione<{ id: string }> | EsitoAzione | null> => {
      if (modo === 'modifica') return modificaCompito(prima, fd)
      const r = await creaCompito(prima, fd)
      if (!r.ok || !r.dati) return r
      const id = r.dati.id
      const daCaricare = fileValidi(file, limiteByte)
      if (daCaricare.length) {
        setAvanzamento('Compito creato. Caricamento dei documenti…')
        const c = await caricaFile(id, daCaricare, (fatti, totale) => setAvanzamento(`Compito creato. Caricamento dei documenti: ${fatti} di ${totale}…`))
        if (c.ok) toast.success(`Compito creato. ${c.messaggio}`)
        else toast.error(`Il compito è stato creato, ma alcuni documenti non sono stati caricati: ${c.errore} Puoi riprovare dalla sezione Documenti.`, { duration: 15000 })
      } else {
        toast.success('Compito creato.')
      }
      router.push(`/compiti/${id}`)
      return { ok: true, messaggio: 'Compito creato: apertura della scheda…' }
    },
    null,
  )
  const campi = esito && !esito.ok ? esito.campi : undefined
  const creato = modo === 'nuovo' && esito?.ok

  function scegliCliente(c: OpzioneCliente) {
    setCliente(c.id)
    if (!c.id || fisso) return setNotaReferente(null)
    if (c.referente_id && persone.some((p) => p.id === c.referente_id && !p.nonAssegnabile)) {
      setAssegnatario(c.referente_id)
      const nome = persone.find((p) => p.id === c.referente_id)?.nome
      setNotaReferente(`Compilato con il referente di ${c.nome} (${nome}): puoi cambiarlo.`)
    } else {
      setNotaReferente(c.referente_id ? `Il referente di ${c.nome} non è tra le persone a cui puoi assegnare compiti.` : null)
    }
  }

  const io = persone.find((p) => p.io)
  const troppiFile = file.length > MAX_FILE_PER_VOLTA

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(e) => {
        // invio gestito qui: i campi restano compilati se c'è un errore
        e.preventDefault()
        if (inAttesa || creato) return
        if (troppiFile) return toast.error(`Puoi caricare al massimo ${MAX_FILE_PER_VOLTA} file per volta.`)
        const fd = new FormData(e.currentTarget)
        startTransition(() => invia(fd))
      }}
    >
      <MessaggioEsito esito={esito} />
      {modo === 'modifica' && (
        <>
          <input type="hidden" name="compito" value={iniziale.id} />
          <input type="hidden" name="assegnatario_iniziale" value={iniziale.assegnatario} />
        </>
      )}
      {fisso && io && <input type="hidden" name="assegnatario" value={io.id} />}

      <Campo id="titolo" etichetta="Titolo" errore={campi?.titolo}>
        <Input name="titolo" defaultValue={iniziale.titolo} required maxLength={300} placeholder="Esempio: preparare il contratto di affitto" />
      </Campo>

      <Campo id="descrizione" etichetta="Descrizione" facoltativo errore={campi?.descrizione} aiuto="Cosa c'è da fare, documenti da usare, a chi rispondere.">
        <Textarea name="descrizione" defaultValue={iniziale.descrizione} rows={4} maxLength={20000} />
      </Campo>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <Campo
          id="cliente"
         
          etichetta="Cliente"
          facoltativo
          errore={campi?.cliente}
          aiuto="Cerca per nome dell'azienda o del titolare. Per un lavoro generale dello studio lascia «Nessun cliente»."
        >
          <ComboboxCliente name="cliente" clienti={clienti} valore={cliente} onCambia={scegliCliente} />
        </Campo>

        {fisso && io ? (
          <Campo id="assegnatario-fisso" etichetta="Collaboratore" aiuto="In questo studio i collaboratori creano compiti solo per sé.">
            <Input readOnly value={`${io.nome} (tu)`} className="bg-muted/40" />
          </Campo>
        ) : (
          <Campo
            id="assegnatario"
           
            etichetta="Collaboratore"
            errore={campi?.assegnatario}
            aiuto={notaReferente ?? (iniziale.altriAssegnatari.length ? 'Il compito ora è assegnato a più persone: scegliendo qui, sarà assegnato solo a quella indicata.' : 'A chi è assegnato il compito.')}
          >
            <Select
              name="assegnatario"
              required
              value={assegnatario}
              onChange={(e) => {
                setAssegnatario(e.target.value)
                setNotaReferente(null)
              }}
            >
              <option value="">Scegli il collaboratore…</option>
              {persone.map((p) => (
                <option key={p.id} value={p.id} disabled={p.nonAssegnabile && p.id !== iniziale.assegnatario}>
                  {p.nome}
                  {p.io ? ' (tu)' : p.ruolo === 'admin' ? ' (admin)' : ''}
                  {p.nonAssegnabile ? ' – non più assegnabile' : ''}
                </option>
              ))}
            </Select>
          </Campo>
        )}
      </div>

      <fieldset className="grid gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Scadenza</legend>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Campo id="scadenza_data" etichetta="Data" errore={campi?.scadenza_data}>
            <Input name="scadenza_data" type="date" defaultValue={iniziale.data} disabled={nessuna} />
          </Campo>
          <Campo id="scadenza_ora" etichetta="Ora" facoltativo errore={campi?.scadenza_ora} aiuto="Senza ora, il compito scade a fine giornata.">
            <Input name="scadenza_ora" type="time" defaultValue={iniziale.ora} disabled={nessuna} />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="nessuna_scadenza" checked={nessuna} onChange={(e) => setNessuna(e.target.checked)} />
          Nessuna scadenza
          <span className="text-muted-foreground">(il compito va in fondo agli elenchi ordinati per scadenza)</span>
        </label>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Priorità</legend>
        <div className="flex flex-wrap gap-2">
          {PRIORITA.map(({ valore, etichetta, icona: Icona }) => (
            <label
              key={valore}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                priorita === valore ? 'border-primary bg-primary/5 font-medium' : 'bg-card hover:bg-accent',
              )}
            >
              <input
                type="radio"
                name="priorita"
                value={valore}
                checked={priorita === valore}
                onChange={() => setPriorita(valore)}
                className="accent-primary"
              />
              {Icona && <Icona className={cn('size-4', valore === 'urgente' ? 'text-pericolo' : 'text-avviso')} aria-hidden />}
              {etichetta}
            </label>
          ))}
        </div>
      </fieldset>

      {modo === 'nuovo' && (
        <div className="grid gap-1.5">
          <Label htmlFor="documenti">
            Documenti <span className="font-normal text-muted-foreground">(facoltativo)</span>
          </Label>
          <SceltaFile id="documenti" file={file} onCambia={setFile} limiteByte={limiteByte} disabled={inAttesa || !!creato} />
        </div>
      )}

      {avanzamento && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {avanzamento}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button asChild variant="outline"><Link href={annulla}>Annulla</Link></Button>
        <Button type="submit" disabled={inAttesa || !!creato} aria-busy={inAttesa}>
          {inAttesa && <Loader2 className="animate-spin" aria-hidden />}
          {modo === 'nuovo' ? (inAttesa ? 'Creazione in corso…' : 'Crea compito') : inAttesa ? 'Salvataggio…' : 'Salva le modifiche'}
        </Button>
      </div>
    </form>
  )
}
