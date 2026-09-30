import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Info } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { leggiCompito } from '@/lib/dati/scheda-compito'
import { limiteDocumenti } from '@/lib/documenti'
import { UUID_VALIDO } from '@/lib/documenti/regole'
import { inputDaScadenza } from '@/lib/date'
import { Intestazione } from '@/components/intestazione'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ModuloCompito } from '../../_componenti/modulo-compito'
import { datiModulo } from '../../_componenti/dati-modulo'

export const metadata = { title: 'Modifica compito' }

/** Modifica di titolo, descrizione, cliente, scadenza, priorità e assegnatario: admin o chi ha creato il compito. */
export default async function PaginaModificaCompito({ params }: PageProps<'/compiti/[id]/modifica'>) {
  const { id } = await params
  const contesto = await richiediUtente()
  if (!UUID_VALIDO.test(id)) notFound()
  const dati = await conUtente(contesto.persona, async (tx) => {
    const compito = await leggiCompito(tx, id)
    if (!compito) return null
    const modulo = compito.puo_controllare
      ? await datiModulo(tx, contesto, { cliente: compito.cliente_id, assegnatari: compito.assegnatari })
      : null
    return { compito, modulo }
  })
  if (!dati) notFound()
  const { compito: k, modulo } = dati
  const indietro = <Button asChild variant="outline"><Link href={`/compiti/${k.id}`}><ArrowLeft /> Torna al compito</Link></Button>

  if (!modulo) {
    return (
      <>
        <Intestazione titolo="Modifica compito" descrizione={k.titolo} azioni={indietro} />
        <Alert>
          <Info aria-hidden />
          <p>Solo un admin o chi ha creato il compito può modificarlo.</p>
        </Alert>
      </>
    )
  }

  const { data, ora } = inputDaScadenza(k.scadenza)
  const [primo, ...altri] = k.assegnatari
  const io = modulo.persone.find((p) => p.io)
  return (
    <>
      <Intestazione titolo="Modifica compito" descrizione={k.titolo} azioni={indietro} />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <ModuloCompito
            modo="modifica"
            iniziale={{
              id: k.id,
              titolo: k.titolo,
              descrizione: k.descrizione,
              cliente: k.cliente_id ?? '',
              assegnatario: primo?.id ?? '',
              altriAssegnatari: altri.map((a) => a.id),
              data,
              ora: k.scadenza_con_orario ? ora : '',
              nessuna: !k.scadenza,
              priorita: k.priorita,
            }}
            clienti={modulo.clienti}
            persone={modulo.persone}
            // "solo per sé": resta fisso su chi modifica, se il compito è già suo
            fisso={modulo.soloPerSe && !!io && primo?.id === io.id && altri.length === 0}
            limiteByte={limiteDocumenti()}
            annulla={`/compiti/${k.id}`}
          />
        </CardContent>
      </Card>
    </>
  )
}
