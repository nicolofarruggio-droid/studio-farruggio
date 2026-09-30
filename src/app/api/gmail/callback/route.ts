import { NextResponse, type NextRequest } from 'next/server'
import { richiediUtente } from '@/lib/auth/sessione'
import { completaCollegamento, ErroreCasellaGiaCollegata } from '@/lib/email-lettura/collega'
import { COOKIE_STATO, opzioniCookieStato, verificaStato } from '@/lib/email-lettura/oauth'
import { ErrorePermesso } from '@/lib/email-lettura/tipi'

// Ritorno dalla schermata di consenso di Google. Controlla lo stato firmato e il cookie anti-CSRF,
// poi completa il collegamento solo se il permesso concesso è esattamente gmail.readonly.
export async function GET(request: NextRequest) {
  const { persona, utente, studio } = await richiediUtente()
  const q = request.nextUrl.searchParams
  const fine = (percorso: string) => {
    const r = NextResponse.redirect(new URL(percorso, request.url))
    r.cookies.set(COOKIE_STATO, '', { ...opzioniCookieStato(), maxAge: 0 })
    r.headers.set('Cache-Control', 'no-store')
    return r
  }

  if (!verificaStato(q.get('state'), utente.id, request.cookies.get(COOKIE_STATO)?.value)) return fine('/email?errore=stato')
  if (q.get('error')) return fine(`/email?errore=${q.get('error') === 'access_denied' ? 'annullato' : 'google'}`)
  const codice = q.get('code')
  if (!codice) return fine('/email?errore=google')
  if (!studio.lettura_email_attiva) return fine('/email?errore=non_attiva')

  try {
    await completaCollegamento({ persona, utente, codice })
  } catch (e) {
    if (e instanceof ErrorePermesso) return fine('/email?errore=permesso')
    if (e instanceof ErroreCasellaGiaCollegata) return fine('/email?errore=gia_collegata')
    console.error('Collegamento Gmail non riuscito', e instanceof Error ? e.message : e)
    return fine('/email?errore=google')
  }
  return fine('/email?collegata=1')
}
