import { rotta, risposta } from '@/lib/api/rotta'
import { leggiMe } from '@/lib/api/operazioni'
import { queryVuota, validaQuery } from '@/lib/api/schemi'

/** Chi sta chiamando: persona o agente, studio, permessi dell'agente e limiti. */
export const GET = rotta(async ({ richiesta, chiamante }) => {
  validaQuery(queryVuota, richiesta.nextUrl.searchParams)
  return risposta(leggiMe(chiamante))
})
