import { rotta, risposta } from '@/lib/api/rotta'
import { elencaClienti } from '@/lib/api/operazioni'
import { queryClienti, validaQuery } from '@/lib/api/schemi'

/** Clienti visibili, con gli stessi filtri e ordinamenti dell'elenco dell'interfaccia. */
export const GET = rotta(async ({ richiesta, chiamante }) =>
  risposta(await elencaClienti(chiamante, validaQuery(queryClienti, richiesta.nextUrl.searchParams))))
