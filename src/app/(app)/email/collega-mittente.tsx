'use client'
import { useActionState } from 'react'
import { Campo, Select } from '@/components/ui/campi'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { collegaMittente } from './azioni'

/** "Collega a un cliente" per un mittente non riconosciuto (sezione 16.3, punto 8). */
export function CollegaMittente({
  indirizzo, gmailIds, clienti, indice,
}: { indirizzo: string; gmailIds: string[]; clienti: { id: string; nome: string }[]; indice: number }) {
  const [esito, azione] = useActionState(collegaMittente, null)
  if (esito?.ok) return <MessaggioEsito esito={esito} />
  const id = `cliente-mittente-${indice}`
  return (
    <form action={azione} className="grid gap-2">
      <MessaggioEsito esito={esito} />
      <input type="hidden" name="indirizzo" value={indirizzo} />
      {gmailIds.map((g) => <input key={g} type="hidden" name="gmail" value={g} />)}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Campo id={id} etichetta={`Cliente a cui collegare ${indirizzo}`} className="min-w-0 flex-1" errore={esito && !esito.ok ? esito.campi?.cliente : undefined}>
          <Select name="cliente" defaultValue="" required>
            <option value="" disabled>Scegli un cliente…</option>
            {clienti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </Campo>
        <PulsanteInvio variant="outline" testoAttesa="Collegamento…" disabled={!clienti.length}>Collega a un cliente</PulsanteInvio>
      </div>
    </form>
  )
}
