import { rotta, risposta } from '@/lib/api/rotta'
import { elencaCommenti } from '@/lib/api/operazioni'
import { eseguiScrittura } from '@/lib/api/scritture'
import { corpoCommento, idDaPercorso, queryVuota, validaCorpo, validaQuery } from '@/lib/api/schemi'

/** Commenti del compito, dal più vecchio. */
export const GET = rotta(async ({ richiesta, chiamante, parametri }) => {
  validaQuery(queryVuota, richiesta.nextUrl.searchParams)
  return risposta(await elencaCommenti(chiamante, idDaPercorso(parametri.id)))
})

/** Aggiunge un commento (agenti: permesso "commenta"). */
export const POST = rotta(async ({ richiesta, chiamante, parametri }) => {
  const id = idDaPercorso(parametri.id)
  const corpo = await validaCorpo(corpoCommento, richiesta)
  return eseguiScrittura(chiamante, 'commenta', { ...corpo, compito_id: id })
})
