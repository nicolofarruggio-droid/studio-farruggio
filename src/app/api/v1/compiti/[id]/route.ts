import { rotta, risposta } from '@/lib/api/rotta'
import { leggiCompito } from '@/lib/api/operazioni'
import { eseguiScrittura } from '@/lib/api/scritture'
import { corpoModificaCompito, eSoloCambioStato, idDaPercorso, queryVuota, validaCorpo, validaQuery } from '@/lib/api/schemi'

/** Scheda del compito con commenti, documenti (solo i dati, non i file) e cronologia. */
export const GET = rotta(async ({ richiesta, chiamante, parametri }) => {
  validaQuery(queryVuota, richiesta.nextUrl.searchParams)
  return risposta(await leggiCompito(chiamante, idDaPercorso(parametri.id)))
})

/** Cambio di stato (con motivo) o modifica dei campi, secondo i permessi di chi chiama. */
export const PATCH = rotta(async ({ richiesta, chiamante, parametri }) => {
  const id = idDaPercorso(parametri.id)
  const corpo = await validaCorpo(corpoModificaCompito, richiesta)
  return eseguiScrittura(chiamante, eSoloCambioStato(corpo) ? 'cambia_stato_compito' : 'modifica_compito', { ...corpo, compito_id: id })
})
