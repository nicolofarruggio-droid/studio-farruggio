import { rotta, risposta } from '@/lib/api/rotta'
import { linkDocumento } from '@/lib/api/documenti'
import { ErroreApi } from '@/lib/api/errori'
import { idDaPercorso } from '@/lib/api/schemi'

/** Link temporaneo (pochi minuti) per aprire o scaricare un documento: ?modo=apri|scarica (predefinito scarica). */
export const GET = rotta(async ({ richiesta, chiamante, parametri }) => {
  const q = richiesta.nextUrl.searchParams
  for (const k of q.keys()) if (k !== 'modo') throw new ErroreApi(400, 'richiesta_non_valida', `Parametro sconosciuto: ${k}`)
  const modo = q.get('modo') ?? 'scarica'
  if (modo !== 'apri' && modo !== 'scarica') throw new ErroreApi(400, 'richiesta_non_valida', 'modo deve essere "apri" oppure "scarica".')
  return risposta(await linkDocumento(chiamante, idDaPercorso(parametri.id), idDaPercorso(parametri.documento), modo))
})
