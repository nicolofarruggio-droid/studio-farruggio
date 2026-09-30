import { rotta, risposta } from '@/lib/api/rotta'
import { leggiProposta } from '@/lib/api/operazioni'
import { idDaPercorso, queryVuota, validaQuery } from '@/lib/api/schemi'

/** Stato di una proposta (in attesa, approvata, rifiutata, fallita) con l'esito. */
export const GET = rotta(async ({ richiesta, chiamante, parametri }) => {
  validaQuery(queryVuota, richiesta.nextUrl.searchParams)
  return risposta(await leggiProposta(chiamante, idDaPercorso(parametri.id)))
})
