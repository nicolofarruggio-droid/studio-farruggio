'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { eliminaDefinitivamente, ripristinaCliente } from '@/app/(app)/clienti/azioni'

export function AzioniCestino({ id, nome }: { id: string; nome: string }) {
  const [inCorso, avvia] = useTransition()
  const [conferma, setConferma] = useState(false)
  const esegui = (f: () => Promise<{ ok: boolean; messaggio?: string; errore?: string }>) =>
    avvia(async () => {
      const r = await f()
      if (r.ok) toast.success(r.messaggio)
      else toast.error(r.errore)
      setConferma(false)
    })
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" disabled={inCorso} onClick={() => esegui(() => ripristinaCliente(id))}>
        <ArchiveRestore /> Ripristina
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive" disabled={inCorso} onClick={() => setConferma(true)}>
        <Trash2 /> Elimina definitivamente
      </Button>
      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare per sempre {nome}?</DialogTitle>
            <DialogDescription>Vengono cancellati per sempre anche compiti, documenti, comunicazioni e storico delle date. Non si può annullare.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Annulla</Button></DialogClose>
            <Button variant="destructive" disabled={inCorso} onClick={() => esegui(() => eliminaDefinitivamente(id))}>ELIMINA PER SEMPRE</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
