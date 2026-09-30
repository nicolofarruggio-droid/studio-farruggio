import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { colleghi } from '@/lib/dati/clienti'
import { Intestazione } from '@/components/intestazione'
import { ModuloAnagrafica } from '../_componenti/modulo-anagrafica'
import { creaCliente } from '../azioni'

export const metadata = { title: 'Nuovo cliente' }

export default async function PaginaNuovoCliente() {
  const { persona } = await richiediAdmin()
  const persone = await conUtente(persona, (tx) => colleghi(tx))
  return (
    <div className="max-w-3xl">
      <Intestazione titolo="Nuovo cliente" descrizione="Solo la ragione sociale è obbligatoria: gli altri dati si possono completare dopo." />
      <ModuloAnagrafica
        azione={creaCliente}
        nuovo
        colleghi={persone}
        annulla="/clienti"
        valori={{
          ragione_sociale: '', nome_visualizzazione: '', telefono: '', codice_fiscale: '', partita_iva: '', numero_dipendenti: '',
          fatturato: '', note: '', alias: '', stato: 'attivo', titolari: [], email: [],
        }}
      />
    </div>
  )
}
