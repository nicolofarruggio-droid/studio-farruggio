import type { NextRequest } from 'next/server'
import { driver } from '@/lib/documenti'
import { verificaLinkLocale } from '@/lib/documenti/link-locali'
import { cartellaFileLocali, ErroreFileLocale, leggiFileLocale, scriviFileLocale } from '@/lib/documenti/locale'
import { contentDisposition, tipoAnteprima, tipoPerAnteprima } from '@/lib/documenti/regole'

// Spazio file "locale" (solo con STORAGE_DRIVER=locale, per sviluppo e test): imita gli URL firmati di
// Supabase Storage. Nessuna sessione qui: vale solo il link firmato, creato dal server dopo aver
// controllato i permessi nel database, che scade dopo pochi minuti.

const testo = (messaggio: string, stato: number) =>
  new Response(messaggio, { status: stato, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

/** Caricamento di un file (PUT del browser verso il link firmato). */
export async function PUT(request: NextRequest) {
  if (driver() !== 'locale') return testo('Non disponibile.', 404)
  const v = verificaLinkLocale(request.nextUrl.searchParams, 'carica')
  if (!v.ok) return testo(v.errore, v.stato)
  if (v.azione !== 'carica') return testo('Link non valido.', 400)
  const dichiarata = Number(request.headers.get('content-length') ?? 0)
  if (dichiarata > v.maxByte) return testo('Il file supera la dimensione massima consentita.', 413)
  try {
    const { dimensione } = await scriviFileLocale(cartellaFileLocali(), v.percorso, request.body, v.maxByte)
    return Response.json({ ok: true, dimensione }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    if (e instanceof ErroreFileLocale) return testo(e.message, e.stato)
    throw e
  }
}

/** Apertura (anteprima) o download con il link temporaneo. */
export async function GET(request: NextRequest) {
  if (driver() !== 'locale') return testo('Non disponibile.', 404)
  const v = verificaLinkLocale(request.nextUrl.searchParams, 'scarica')
  if (!v.ok) return testo(v.errore, v.stato)
  if (v.azione !== 'scarica') return testo('Link non valido.', 400)
  const file = await leggiFileLocale(cartellaFileLocali(), v.percorso)
  if (!file) return testo('Il file non è stato trovato nello spazio file.', 404)

  // Anteprima solo per PDF, immagini, testo e CSV (questi ultimi come testo semplice).
  const anteprima = v.modo === 'apri' && tipoAnteprima(v.tipo) !== null
  const intestazioni: Record<string, string> = {
    'content-type': anteprima ? tipoPerAnteprima(v.tipo) : v.tipo,
    'content-length': String(file.dimensione),
    'content-disposition': contentDisposition(anteprima ? 'inline' : 'attachment', v.nome),
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
  }
  // Nessuno script nelle anteprime di immagini e testo (il visore PDF del browser ha regole sue).
  if (anteprima && tipoAnteprima(v.tipo) !== 'pdf') {
    intestazioni['content-security-policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
  }
  return new Response(file.corpo, { status: 200, headers: intestazioni })
}
