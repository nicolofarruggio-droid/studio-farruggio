import Link from 'next/link'
import { ArrowLeft, Info } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { puoCreareCompiti } from '@/lib/dati/scheda-compito'
import { limiteDocumenti } from '@/lib/documenti'
import { Intestazione } from '@/components/intestazione'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ModuloCompito } from '../_componenti/modulo-compito'
import { datiModulo } from '../_componenti/dati-modulo'

export const metadata = { title: 'Nuovo compito' }

/** Nuovo compito (sezione 8). Con ?cliente=<id> il cliente è già scelto (per esempio dalla scheda cliente). */
export default async function PaginaNuovoCompito({ searchParams }: PageProps<'/compiti/nuovo'>) {
  const contesto = await richiediUtente()
  const { persona, utente, studio } = contesto
  const q = await searchParams
  const richiesto = typeof q.cliente === 'string' ? q.cliente : ''
  const indietro = (
    <Button asChild variant="outline"><Link href="/compiti"><ArrowLeft /> Torna ai compiti</Link></Button>
  )

  if (!puoCreareCompiti(utente.ruolo, studio.creazione_compiti)) {
    return (
      <>
        <Intestazione titolo="Nuovo compito" azioni={indietro} />
        <Alert>
          <Info aria-hidden />
          <p>In questo studio solo gli admin creano i compiti. Se ti serve un compito, chiedi a un admin.</p>
        </Alert>
      </>
    )
  }

  const { clienti, persone, soloPerSe } = await conUtente(persona, (tx) => datiModulo(tx, contesto, null))
  if (persone.length === 0) {
    return (
      <>
        <Intestazione titolo="Nuovo compito" azioni={indietro} />
        <Alert variant="avviso">
          <Info aria-hidden />
          <p>Non ci sono persone a cui puoi assegnare un compito.</p>
        </Alert>
      </>
    )
  }

  const cliente = clienti.find((c) => c.id === richiesto)
  const io = persone.find((p) => p.io)
  // assegnatario proposto: il referente del cliente scelto, altrimenti chi crea se è l'unico possibile
  const assegnatario = soloPerSe && io ? io.id
    : cliente?.referente_id && persone.some((p) => p.id === cliente.referente_id) ? cliente.referente_id
      : persone.length === 1 ? persone[0].id : ''

  return (
    <>
      <Intestazione
        titolo="Nuovo compito"
        descrizione="Un lavoro singolo da assegnare, con o senza cliente, scadenza e documenti."
        azioni={indietro}
      />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <ModuloCompito
            modo="nuovo"
            iniziale={{
              id: '', titolo: '', descrizione: '', cliente: cliente?.id ?? '', assegnatario, altriAssegnatari: [],
              data: '', ora: '', nessuna: false, priorita: 'normale',
            }}
            clienti={clienti}
            persone={persone}
            fisso={soloPerSe && !!io}
            limiteByte={limiteDocumenti()}
            annulla={cliente ? `/clienti/${cliente.id}` : '/compiti'}
          />
        </CardContent>
      </Card>
    </>
  )
}
