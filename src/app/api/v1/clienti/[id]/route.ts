import { rotta, risposta } from '@/lib/api/rotta'
import { leggiCliente } from '@/lib/api/operazioni'
import { idDaPercorso, queryVuota, validaQuery } from '@/lib/api/schemi'

/** Scheda del cliente: anagrafica, titolari, email, indicatori con storico, collaboratori, compiti. */
export const GET = rotta(async ({ richiesta, chiamante, parametri }) => {
  validaQuery(queryVuota, richiesta.nextUrl.searchParams)
  return risposta(await leggiCliente(chiamante, idDaPercorso(parametri.id)))
})
