'use client'
import { useState, useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { EsitoAzione } from '@/lib/errori'
import { Button, type ButtonProps } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { MessaggioEsito } from '@/components/ui/messaggio'

/**
 * Pulsante che apre una richiesta di conferma prima di un'azione importante (sezione 13.1:
 * testo esplicito, niente azioni al solo passaggio del mouse). L'errore resta nel riquadro;
 * il successo chiude il riquadro e compare in un avviso, a meno che `risultato` non restituisca
 * qualcosa da mostrare (per esempio un link da copiare).
 */
export function DialogoConferma<T>({
  etichetta, etichettaAccessibile, icona, titolo, descrizione, children, testoConferma, varianteConferma = 'default',
  variante = 'outline', dimensione = 'sm', disabilitato, azione, risultato, pronto = true,
}: {
  etichetta: ReactNode
  etichettaAccessibile?: string
  icona?: ReactNode
  titolo: string
  descrizione?: ReactNode
  children?: ReactNode
  testoConferma: string
  varianteConferma?: ButtonProps['variant']
  variante?: ButtonProps['variant']
  dimensione?: ButtonProps['size']
  disabilitato?: boolean
  azione: () => Promise<EsitoAzione<T>>
  risultato?: (esito: EsitoAzione<T> & { ok: true }) => ReactNode | null
  /** falso finché mancano scelte obbligatorie nel riquadro */
  pronto?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [esito, setEsito] = useState<EsitoAzione<T> | null>(null)
  const [fatto, setFatto] = useState<ReactNode | null>(null)
  const [inCorso, avvia] = useTransition()

  function conferma() {
    avvia(async () => {
      const r = await azione()
      if (!r) return // l'azione ha portato a un'altra pagina (redirect)
      if (!r.ok) {
        setEsito(r)
        return
      }
      const mostra = risultato?.(r)
      if (mostra) {
        setFatto(mostra)
        setEsito(null)
      } else {
        setAperto(false)
        toast.success(r.messaggio ?? 'Fatto.')
      }
    })
  }

  return (
    <Dialog
      open={aperto}
      onOpenChange={(o) => {
        setAperto(o)
        if (!o) {
          setEsito(null)
          setFatto(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variante} size={dimensione} disabled={disabilitato} aria-label={etichettaAccessibile}>
          {icona}
          {etichetta}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          {descrizione && !fatto && <DialogDescription asChild><div className="grid gap-2">{descrizione}</div></DialogDescription>}
        </DialogHeader>
        {fatto ? (
          <>
            {fatto}
            <DialogFooter>
              <DialogClose asChild><Button>Chiudi</Button></DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            {children}
            <MessaggioEsito esito={esito} />
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Indietro</Button></DialogClose>
              <Button variant={varianteConferma} onClick={conferma} disabled={inCorso || !pronto} aria-busy={inCorso}>
                {inCorso && <Loader2 className="animate-spin" aria-hidden />}
                {inCorso ? 'Un momento…' : testoConferma}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
