import { NextResponse, type NextRequest } from 'next/server'
import { conUtente } from '@/lib/db'
import { leggiSessione } from '@/lib/auth/sessione'
import { linkTemporaneo } from '@/lib/documenti'
import { tipoAnteprima, UUID_VALIDO } from '@/lib/documenti/regole'

// Apertura e download di un documento di un compito: /api/documenti/<id>?modo=apri|scarica
// 1. l'utente deve essere autenticato e attivo;
// 2. il documento si legge sotto RLS: se l'utente non vede il compito, per lui non esiste;
// 3. solo allora il server crea un link temporaneo (pochi minuti) e ci rimanda il browser.
// I documenti restano consultabili anche a compito completato o annullato (sezione 8).

const testo = (messaggio: string, stato: number) =>
  new Response(messaggio, { status: stato, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

export async function GET(request: NextRequest, ctx: RouteContext<'/api/documenti/[id]'>) {
  const { id } = await ctx.params
  const sessione = await leggiSessione()
  if (!sessione) {
    const accedi = new URL('/accedi', request.url)
    accedi.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(accedi, 303)
  }
  if (sessione.serveSecondoPassaggio) return NextResponse.redirect(new URL('/accedi/verifica', request.url), 303)
  if (!sessione.utente?.attivo) return testo('Accesso non consentito.', 403)
  if (!UUID_VALIDO.test(id)) return testo('Documento non trovato.', 404)

  const [doc] = await conUtente(sessione.persona, (tx) => tx<{ nome_file: string; tipo: string; percorso: string }[]>`
    select nome_file, tipo, percorso from public.compiti_documenti where id = ${id}`)
  if (!doc) return testo('Documento non trovato, oppure non hai i permessi per vederlo.', 404)

  const modo = request.nextUrl.searchParams.get('modo') === 'apri' && tipoAnteprima(doc.tipo) ? 'apri' : 'scarica'
  let link: string
  try {
    link = await linkTemporaneo(doc.percorso, { modo, nome: doc.nome_file, tipo: doc.tipo })
  } catch (e) {
    console.error(e)
    return testo('Lo spazio file non risponde. Riprova tra qualche minuto.', 503)
  }
  const risposta = NextResponse.redirect(new URL(link, request.url), 303)
  risposta.headers.set('cache-control', 'no-store')
  risposta.headers.set('referrer-policy', 'no-referrer')
  return risposta
}
