import { notFound } from 'next/navigation'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { leggiSchedaCliente } from '@/lib/dati/scheda-cliente'
import { Intestazione } from '@/components/intestazione'
import { ModuloAnagrafica } from '../../_componenti/modulo-anagrafica'
import { modificaCliente } from '../../azioni'

export const metadata = { title: 'Modifica anagrafica' }

export default async function PaginaModificaCliente({ params }: PageProps<'/clienti/[id]/modifica'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { persona } = await richiediAdmin()
  const s = await conUtente(persona, (tx) => leggiSchedaCliente(tx, id))
  if (!s) notFound()
  const c = s.cliente
  return (
    <div className="max-w-3xl">
      <Intestazione titolo="Modifica anagrafica" descrizione={c.nome_visualizzazione} />
      <ModuloAnagrafica
        azione={modificaCliente.bind(null, id)}
        nuovo={false}
        annulla={`/clienti/${id}`}
        valori={{
          ragione_sociale: c.ragione_sociale, nome_visualizzazione: c.nome_visualizzazione, telefono: c.telefono ?? '',
          codice_fiscale: c.codice_fiscale ?? '', partita_iva: c.partita_iva ?? '',
          numero_dipendenti: c.numero_dipendenti?.toString() ?? '', fatturato: c.fatturato ? String(Number(c.fatturato)).replace('.', ',') : '',
          note: c.note ?? '', alias: c.alias.join('\n'), stato: c.stato,
          titolari: s.titolari.map((t) => ({ nome: t.nome, cognome: t.cognome })),
          email: s.email.map((e) => ({ indirizzo: e.indirizzo, tipo: e.tipo })),
        }}
      />
    </div>
  )
}
