import { rotta, risposta } from '@/lib/api/rotta'
import { elencaCompiti } from '@/lib/api/operazioni'
import { eseguiScrittura } from '@/lib/api/scritture'
import { corpoCreaCompito, queryCompiti, validaCorpo, validaQuery } from '@/lib/api/schemi'

/** Compiti visibili, con gli stessi filtri dell'interfaccia (di base solo quelli aperti). */
export const GET = rotta(async ({ richiesta, chiamante }) =>
  risposta(await elencaCompiti(chiamante, validaQuery(queryCompiti, richiesta.nextUrl.searchParams))))

/** Crea un compito (agenti: permesso "crea_compiti"). */
export const POST = rotta(async ({ richiesta, chiamante }) =>
  eseguiScrittura(chiamante, 'crea_compito', await validaCorpo(corpoCreaCompito, richiesta)))
