'use client'
import { useActionState, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { EsitoAzione } from '@/lib/errori'
import { AZIONI_AGENTE, DESCRIZIONI_AZIONI, ETICHETTE_LIVELLO, type AzioneAgente, type LivelloPermesso } from '@/lib/api/permessi-agente'
import { Alert } from '@/components/ui/alert'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Campo, Input, Select, Textarea } from '@/components/ui/campi'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { creaAgente, creaToken, impostaPermessi, rifiuta, type EsitoToken } from './azioni'

type Azione = (prima: EsitoAzione | null, fd: FormData) => Promise<EsitoAzione>

/** Pulsante che esegue un'azione del server, con conferma facoltativa in una finestra di dialogo. */
export function PulsanteAzione({
  azione, campi, etichetta, variante = 'outline', conferma, etichettaAccessibile,
}: {
  azione: Azione
  campi: Record<string, string>
  etichetta: string
  variante?: ButtonProps['variant']
  conferma?: { titolo: string; testo: string; pulsante: string; indietro?: string }
  etichettaAccessibile?: string
}) {
  const [aperto, setAperto] = useState(false)
  const [esito, azioneModulo, inCorso] = useActionState(async (prima: EsitoAzione | null, fd: FormData) => {
    const r = await azione(prima, fd)
    setAperto(false)
    // la riga può sparire o cambiare dopo l'aggiornamento della pagina: l'esito resta anche in un avviso
    if (r.ok && r.messaggio) toast.success(r.messaggio)
    else if (!r.ok) toast.error(r.errore)
    return r
  }, null)
  const nascosti = Object.entries(campi).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
  return (
    <div className="grid justify-items-start gap-2">
      {conferma ? (
        <Dialog open={aperto} onOpenChange={setAperto}>
          <DialogTrigger asChild>
            <Button variant={variante} size="sm" aria-label={etichettaAccessibile}>{etichetta}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{conferma.titolo}</DialogTitle>
              <DialogDescription>{conferma.testo}</DialogDescription>
            </DialogHeader>
            <form action={azioneModulo}>
              {nascosti}
              <DialogFooter>
                <DialogClose asChild><Button variant="outline" autoFocus>{conferma.indietro ?? 'Annulla'}</Button></DialogClose>
                <Button type="submit" variant={variante === 'destructive' ? 'destructive' : 'default'} disabled={inCorso} aria-busy={inCorso}>
                  {inCorso && <Loader2 className="animate-spin" aria-hidden />}
                  {conferma.pulsante}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <form action={azioneModulo}>
          {nascosti}
          <Button type="submit" variant={variante} size="sm" disabled={inCorso} aria-busy={inCorso} aria-label={etichettaAccessibile}>
            {inCorso && <Loader2 className="animate-spin" aria-hidden />}
            {etichetta}
          </Button>
        </form>
      )}
      <MessaggioEsito esito={esito} />
    </div>
  )
}

export function ModuloNuovoAgente() {
  const [esito, azione] = useActionState(creaAgente, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Campo id="agente-nome" etichetta="Nome dell'account" errore={campi?.nome} aiuto="Come compare nello storico, al posto del nome di una persona.">
          <Input name="nome" required maxLength={100} placeholder="Claude Cowork" />
        </Campo>
        <Campo id="agente-descrizione" etichetta="A cosa serve" facoltativo errore={campi?.descrizione}>
          <Input name="descrizione" maxLength={500} placeholder="Riepilogo mattutino dei ritardi e dei compiti in scadenza" />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PulsanteInvio testoAttesa="Creazione…"><Plus aria-hidden /> Crea account agente</PulsanteInvio>
        <p className="text-xs text-muted-foreground">Il nuovo account parte in sola lettura.</p>
      </div>
      <MessaggioEsito esito={esito} />
    </form>
  )
}

export function ModuloPermessi({ agente, nome, permessi }: { agente: string; nome: string; permessi: Record<AzioneAgente, LivelloPermesso> }) {
  const [esito, azione] = useActionState(impostaPermessi, null)
  return (
    <form action={azione} className="grid gap-3">
      <input type="hidden" name="agente" value={agente} />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Permessi di scrittura di {nome}</legend>
        {AZIONI_AGENTE.map((a) => (
          <div key={a} className="grid items-center gap-1.5 sm:grid-cols-[1fr_16rem]">
            <div>
              <label htmlFor={`permesso-${agente}-${a}`} className="text-sm font-medium">{DESCRIZIONI_AZIONI[a].etichetta}</label>
              <p id={`permesso-${agente}-${a}-aiuto`} className="text-xs text-muted-foreground">{DESCRIZIONI_AZIONI[a].aiuto}</p>
            </div>
            <Select id={`permesso-${agente}-${a}`} name={a} defaultValue={permessi[a]} aria-describedby={`permesso-${agente}-${a}-aiuto`}>
              {(['no', 'si', 'proposta'] as const).map((l) => <option key={l} value={l}>{ETICHETTE_LIVELLO[l]}</option>)}
            </Select>
          </div>
        ))}
      </fieldset>
      <div>
        <PulsanteInvio variant="outline" size="sm" testoAttesa="Salvataggio…">Salva permessi</PulsanteInvio>
      </div>
      <MessaggioEsito esito={esito} />
    </form>
  )
}

function PulsanteCopia({ testo }: { testo: string }) {
  const [copiato, setCopiato] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(testo)
            setCopiato(true)
          } catch {
            setCopiato(false)
          }
        }}
      >
        {copiato ? <Check aria-hidden /> : <Copy aria-hidden />} {copiato ? 'Copiato' : 'Copia'}
      </Button>
      <span className="sr-only" aria-live="polite">{copiato ? 'Token copiato negli appunti' : ''}</span>
    </>
  )
}

export function ModuloNuovoToken({ agente, nome }: { agente: string; nome: string }) {
  const [esito, azione] = useActionState<EsitoToken | null, FormData>(creaToken, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <div className="grid gap-3">
      <form action={azione} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" noValidate>
        <input type="hidden" name="agente" value={agente} />
        <Campo id={`token-nome-${agente}`} etichetta="Nome del token" facoltativo errore={campi?.nome}>
          <Input name="nome" maxLength={100} placeholder="Computer dell'ufficio" />
        </Campo>
        <Campo id={`token-giorni-${agente}`} etichetta="Durata (giorni)" errore={campi?.giorni}>
          <Input name="giorni" type="number" inputMode="numeric" min={1} max={365} defaultValue={90} required />
        </Campo>
        <PulsanteInvio variant="outline" testoAttesa="Creazione…" aria-label={`Crea un token per ${nome}`}>
          <KeyRound aria-hidden /> Crea token
        </PulsanteInvio>
      </form>
      {esito?.ok && esito.dati ? (
        <Alert variant="avviso">
          <KeyRound aria-hidden />
          <div className="grid min-w-0 gap-2">
            <p className="font-medium">Copia il token adesso: non sarà più visibile.</p>
            <p>
              Valido {esito.dati.giorni} giorni. Nel gestionale resta solo il prefisso <code>{esito.dati.prefisso}…</code>;
              se lo perdi, revocalo e creane uno nuovo. Usalo nell&apos;intestazione <code>Authorization: Bearer …</code>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded border bg-card px-2 py-1 font-mono text-xs" aria-label="Token appena creato">
                {esito.dati.token}
              </code>
              <PulsanteCopia testo={esito.dati.token} />
            </div>
          </div>
        </Alert>
      ) : (
        <MessaggioEsito esito={esito} />
      )}
    </div>
  )
}

export function ModuloRifiuta({ proposta, titolo }: { proposta: string; titolo: string }) {
  const [aperto, setAperto] = useState(false)
  const [esito, azione, inCorso] = useActionState(async (prima: EsitoAzione | null, fd: FormData) => {
    const r = await rifiuta(prima, fd)
    if (r.ok) {
      setAperto(false)
      toast.success(r.messaggio ?? 'Proposta rifiutata.')
    }
    return r
  }, null)
  return (
    <div className="grid justify-items-start gap-2">
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`Rifiuta: ${titolo}`}>Rifiuta</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rifiutare la proposta?</DialogTitle>
            <DialogDescription>{titolo}. Non verrà modificato nulla; l&apos;agente vedrà che è stata rifiutata.</DialogDescription>
          </DialogHeader>
          <form action={azione} className="grid gap-4">
            <input type="hidden" name="proposta" value={proposta} />
            <Campo id={`motivo-${proposta}`} etichetta="Motivo" facoltativo aiuto="Lo vede l'agente nell'esito della proposta.">
              <Textarea name="motivo" maxLength={1000} rows={3} />
            </Campo>
            {esito && !esito.ok && <MessaggioEsito esito={esito} />}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annulla</Button></DialogClose>
              <Button type="submit" variant="destructive" disabled={inCorso} aria-busy={inCorso}>
                {inCorso && <Loader2 className="animate-spin" aria-hidden />}
                Rifiuta la proposta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {esito?.ok && <MessaggioEsito esito={esito} />}
    </div>
  )
}
