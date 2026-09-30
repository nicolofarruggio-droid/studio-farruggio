import { NextResponse, type NextRequest } from 'next/server'
import { richiediUtente } from '@/lib/auth/sessione'
import { preparaConsenso } from '@/lib/email-lettura/collega'
import { COOKIE_STATO, googleConfigurato, opzioniCookieStato } from '@/lib/email-lettura/oauth'

// Avvia il collegamento della PROPRIA casella: porta alla schermata di consenso di Google,
// che chiede solo il permesso gmail.readonly (sezione 16.2).
export async function GET(request: NextRequest) {
  const { utente, studio } = await richiediUtente()
  if (!googleConfigurato()) return NextResponse.redirect(new URL('/email/collega?errore=configurazione', request.url))
  if (!studio.lettura_email_attiva) return NextResponse.redirect(new URL('/email/collega', request.url))
  const { url, nonce } = await preparaConsenso(utente)
  const risposta = NextResponse.redirect(url)
  risposta.cookies.set(COOKIE_STATO, nonce, opzioniCookieStato())
  risposta.headers.set('Cache-Control', 'no-store')
  return risposta
}
