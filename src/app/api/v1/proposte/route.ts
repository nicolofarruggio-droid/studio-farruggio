import { rotta, risposta } from '@/lib/api/rotta'
import { elencaProposte } from '@/lib/api/operazioni'
import { queryProposte, validaQuery } from '@/lib/api/schemi'

/** Proposte degli agenti: l'agente vede le sue, l'admin quelle di tutto lo studio. */
export const GET = rotta(async ({ richiesta, chiamante }) =>
  risposta(await elencaProposte(chiamante, validaQuery(queryProposte, richiesta.nextUrl.searchParams))))
