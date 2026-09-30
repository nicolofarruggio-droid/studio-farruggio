import { rotta, risposta } from '@/lib/api/rotta'
import { elencaCollaboratori } from '@/lib/api/operazioni'
import { queryCollaboratori, validaQuery } from '@/lib/api/schemi'

/** Persone dello studio (admin e collaboratori) a cui si possono assegnare compiti. */
export const GET = rotta(async ({ richiesta, chiamante }) =>
  risposta(await elencaCollaboratori(chiamante, validaQuery(queryCollaboratori, richiesta.nextUrl.searchParams))))
