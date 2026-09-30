import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { EsitoAzione } from '@/lib/errori'
import { Alert } from './alert'

/** Messaggio di esito di un'azione, in testo esplicito (sezione 13.1). */
export function MessaggioEsito({ esito }: { esito: EsitoAzione<unknown> | null | undefined }) {
  if (!esito) return null
  if (esito.ok) {
    if (!esito.messaggio) return null
    return (
      <Alert variant="successo">
        <CheckCircle2 aria-hidden />
        <p>{esito.messaggio}</p>
      </Alert>
    )
  }
  return (
    <Alert variant="pericolo">
      <AlertCircle aria-hidden />
      <p>{esito.errore}</p>
    </Alert>
  )
}
