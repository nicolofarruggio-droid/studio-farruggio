'use client'
import { useActionState, useState } from 'react'
import { Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { scollegaCasella } from './azioni'

/** "Scollega" con conferma: revoca il token presso Google e ferma i controlli. */
export function PulsanteScollega({ indirizzo }: { indirizzo: string | null }) {
  const [aperto, setAperto] = useState(false)
  const [esito, azione] = useActionState(scollegaCasella, null)
  return (
    <div className="grid gap-3">
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-fit"><Unplug aria-hidden /> Scollega</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scollegare la casella{indirizzo ? ` ${indirizzo}` : ''}?</DialogTitle>
            <DialogDescription>
              L&apos;accesso concesso a Google viene revocato e i controlli si fermano: le nuove email dei clienti non
              finiranno più nelle loro Comunicazioni. I riassunti già scritti restano. Potrai ricollegarla quando vuoi:
              si ripartirà dalle email arrivate dopo il nuovo collegamento.
            </DialogDescription>
          </DialogHeader>
          <form action={azione} className="grid gap-4">
            <MessaggioEsito esito={esito} />
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annulla</Button></DialogClose>
              <PulsanteInvio variant="destructive" testoAttesa="Scollegamento…">Scollega la casella</PulsanteInvio>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
