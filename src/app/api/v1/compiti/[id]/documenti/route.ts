import { rotta, risposta } from '@/lib/api/rotta'
import { caricaDocumenti, elencaDocumenti } from '@/lib/api/documenti'
import { ErroreApi } from '@/lib/api/errori'
import { idDaPercorso, queryVuota, validaQuery } from '@/lib/api/schemi'

/** Documenti del compito (solo i dati: il file si apre con il link temporaneo). */
export const GET = rotta(async ({ richiesta, chiamante, parametri }) => {
  validaQuery(queryVuota, richiesta.nextUrl.searchParams)
  return risposta(await elencaDocumenti(chiamante, idDaPercorso(parametri.id)))
})

/** Carica uno o più file (multipart/form-data, campo "file"). Agenti: permesso "carica documenti" = sì. */
export const POST = rotta(async ({ richiesta, chiamante, parametri }) => {
  const id = idDaPercorso(parametri.id)
  if (!(richiesta.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    throw new ErroreApi(400, 'richiesta_non_valida', 'Manda i file come multipart/form-data nel campo "file".')
  }
  let modulo: FormData
  try {
    modulo = await richiesta.formData()
  } catch {
    throw new ErroreApi(400, 'richiesta_non_valida', 'Corpo multipart non leggibile.')
  }
  const file = modulo.getAll('file').filter((f): f is File => f instanceof File)
  return risposta(await caricaDocumenti(chiamante, id, file), 201)
})
