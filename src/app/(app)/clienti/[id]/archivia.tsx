'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { impostaStatoCliente } from '../azioni'

export function PulsanteArchivia({ cliente, stato }: { cliente: string; stato: 'attivo' | 'archiviato' }) {
  const [inCorso, avvia] = useTransition()
  const nuovo = stato === 'attivo' ? 'archiviato' : 'attivo'
  return (
    <Button
      variant="outline"
      disabled={inCorso}
      onClick={() =>
        avvia(async () => {
          const r = await impostaStatoCliente(cliente, nuovo)
          if (r.ok) toast.success(r.messaggio)
          else toast.error(r.errore)
        })
      }
    >
      {stato === 'attivo' ? <><Archive /> Archivia</> : <><ArchiveRestore /> Riattiva</>}
    </Button>
  )
}
