'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCheck, CircleSlash, Eye, Loader2, Pencil, Play, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Campo, Textarea } from '@/components/ui/campi'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { EsitoAzione } from '@/lib/errori'
import type { StatoCompito } from '@/lib/dati/compiti'
import { cambiaStatoCompito, rimandaIndietroCompito } from '../azioni'

type Azione = 'inizia' | 'pronto' | 'torna' | 'chiudi' | 'annulla' | 'riapri'

/** Pulsanti espliciti per il flusso del compito, secondo i permessi calcolati nel database (sezione 8). */
export function AzioniCompito({
  compito, stato, puoLavorare, puoControllare, sonoAssegnatario,
}: {
  compito: string
  stato: StatoCompito
  puoLavorare: boolean
  puoControllare: boolean
  sonoAssegnatario: boolean
}) {
  const [inCorso, avvia] = useTransition()
  const [esito, setEsito] = useState<EsitoAzione | null>(null)
  const [finestra, setFinestra] = useState<'rimanda' | 'annulla' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erroreMotivo, setErroreMotivo] = useState<string | undefined>()

  const aperto = stato === 'assegnato' || stato === 'in_lavorazione' || stato === 'pronto_revisione'
  // chi controlla un compito assegnato ad altri non vede i pulsanti di chi ci lavora
  const lavoro = puoLavorare && (sonoAssegnatario || !puoControllare)
  const mostra = {
    inizia: lavoro && stato === 'assegnato',
    pronto: lavoro && (stato === 'assegnato' || stato === 'in_lavorazione'),
    torna: lavoro && !puoControllare && stato === 'pronto_revisione',
    chiudi: puoControllare && (stato === 'pronto_revisione' || (aperto && sonoAssegnatario)),
    rimanda: puoControllare && stato === 'pronto_revisione',
    annulla: puoControllare && aperto,
    riapri: puoControllare && !aperto,
    modifica: puoControllare,
  }

  const esegui = (azione: Azione, testo?: string) =>
    avvia(async () => {
      const r = await cambiaStatoCompito({ compito, azione, motivo: testo })
      setEsito(r)
      if (r.ok) {
        toast.success(r.messaggio)
        setFinestra(null)
        setMotivo('')
      } else if (azione === 'annulla' && r.campi?.motivo) {
        setErroreMotivo(r.campi.motivo)
      } else {
        toast.error(r.errore)
      }
    })

  const rimanda = () =>
    avvia(async () => {
      const r = await rimandaIndietroCompito({ compito, motivo })
      setEsito(r)
      if (r.ok) {
        toast.success(r.messaggio)
        setFinestra(null)
        setMotivo('')
      } else toast.error(r.errore)
    })

  const apriFinestra = (f: 'rimanda' | 'annulla') => {
    setMotivo('')
    setErroreMotivo(undefined)
    setEsito(null)
    setFinestra(f)
  }

  const nessuna = !Object.values(mostra).some(Boolean)
  if (nessuna) {
    return (
      <p className="text-sm text-muted-foreground">
        {aperto ? 'Puoi consultare questo compito, ma non cambiarne lo stato.' : 'Il compito è chiuso.'}
      </p>
    )
  }

  const attesa = inCorso ? <Loader2 className="animate-spin" aria-hidden /> : null
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {mostra.inizia && (
          <Button onClick={() => esegui('inizia')} disabled={inCorso} variant={mostra.pronto ? 'outline' : 'default'}>
            {attesa ?? <Play aria-hidden />} Inizia a lavorare
          </Button>
        )}
        {mostra.pronto && (
          <Button onClick={() => esegui('pronto')} disabled={inCorso}>
            {attesa ?? <Eye aria-hidden />} Segna pronto per revisione
          </Button>
        )}
        {mostra.torna && (
          <Button onClick={() => esegui('torna')} disabled={inCorso} variant="outline">
            {attesa ?? <Undo2 aria-hidden />} Torna in lavorazione
          </Button>
        )}
        {mostra.chiudi && (
          <Button onClick={() => esegui('chiudi')} disabled={inCorso}>
            {attesa ?? <CheckCheck aria-hidden />} Chiudi il compito
          </Button>
        )}
        {mostra.rimanda && (
          <Button onClick={() => apriFinestra('rimanda')} disabled={inCorso} variant="outline">
            <Undo2 aria-hidden /> Rimanda indietro
          </Button>
        )}
        {mostra.riapri && (
          <Button onClick={() => esegui('riapri')} disabled={inCorso} variant="outline">
            {attesa ?? <RotateCcw aria-hidden />} Riapri
          </Button>
        )}
        {mostra.modifica && (
          <Button asChild variant="outline">
            <Link href={`/compiti/${compito}/modifica`}><Pencil aria-hidden /> Modifica</Link>
          </Button>
        )}
        {mostra.annulla && (
          <Button onClick={() => apriFinestra('annulla')} disabled={inCorso} variant="ghost" className="text-pericolo hover:text-pericolo">
            <CircleSlash aria-hidden /> Annulla compito
          </Button>
        )}
      </div>
      <MessaggioEsito esito={finestra ? null : esito} />

      <Dialog open={finestra === 'rimanda'} onOpenChange={(o) => !o && setFinestra(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rimanda indietro il compito</DialogTitle>
            <DialogDescription>
              Il compito torna &quot;In lavorazione&quot;. Chi ci lavora riceve una notifica con la tua spiegazione e la trova
              in cima alla scheda finché non lo segna di nuovo pronto.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              rimanda()
            }}
          >
            <Campo id="motivo-rimando" etichetta="Perché lo rimandi indietro?" facoltativo aiuto="Consigliato: spiega cosa manca o cosa va corretto.">
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} maxLength={5000} autoFocus />
            </Campo>
            {esito && !esito.ok && <MessaggioEsito esito={esito} />}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" disabled={inCorso}>Torna al compito</Button></DialogClose>
              <Button type="submit" disabled={inCorso}>{attesa ?? <Undo2 aria-hidden />} Rimanda indietro</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={finestra === 'annulla'} onOpenChange={(o) => !o && setFinestra(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annulla il compito</DialogTitle>
            <DialogDescription>
              Il compito non va più fatto. Resta consultabile con i suoi documenti e si può riaprire in seguito.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!motivo.trim()) return setErroreMotivo('Scrivi il motivo: è obbligatorio.')
              esegui('annulla', motivo)
            }}
          >
            <Campo id="motivo-annullamento" etichetta="Motivo dell'annullamento" errore={erroreMotivo} aiuto="Obbligatorio: resta nella cronologia del compito.">
              <Textarea
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value)
                  setErroreMotivo(undefined)
                }}
                rows={3}
                maxLength={5000}
                required
                autoFocus
              />
            </Campo>
            {esito && !esito.ok && !erroreMotivo && <MessaggioEsito esito={esito} />}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" disabled={inCorso}>Torna al compito</Button></DialogClose>
              <Button type="submit" variant="destructive" disabled={inCorso}>{attesa ?? <CircleSlash aria-hidden />} Annulla il compito</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
