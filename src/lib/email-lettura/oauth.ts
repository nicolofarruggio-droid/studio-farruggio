import 'server-only'
import { codiceCasuale, firma, sha256, verificaFirma } from '@/lib/cripto'
import { ErroreTokenRevocato } from './tipi'

// OAuth 2.0 di Google per il collegamento della casella (sezione 16.2).
// UN SOLO permesso: gmail.readonly. Niente openid, email o profile, niente altri permessi Gmail,
// nemmeno in futuro senza una nuova decisione esplicita. Con questo permesso è Google stesso a
// rifiutare invii, modifiche ed eliminazioni (sezione 16.4, primo livello di garanzia).
// Le uniche richieste non-GET del modulo sono qui, e solo verso oauth2.googleapis.com.

export const PERMESSO_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly'
export const URL_CONSENSO = 'https://accounts.google.com/o/oauth2/v2/auth'
export const URL_TOKEN = 'https://oauth2.googleapis.com/token'
export const URL_REVOCA = 'https://oauth2.googleapis.com/revoke'

export const COOKIE_STATO = 'bbs_gmail_stato'
export const PERCORSO_RITORNO = '/api/gmail/callback'
const DURATA_STATO_MS = 10 * 60_000

/** Collegamento configurato: credenziali OAuth di Google e chiave per cifrare i token. */
export function googleConfigurato(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.EMAIL_TOKEN_CHIAVE)
}

/** URL della schermata di consenso di Google: chiede solo gmail.readonly. */
export function urlConsenso(p: { clientId: string; redirectUri: string; state: string; loginHint?: string | null }): string {
  const u = new URL(URL_CONSENSO)
  u.searchParams.set('client_id', p.clientId)
  u.searchParams.set('redirect_uri', p.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', PERMESSO_GMAIL)
  u.searchParams.set('access_type', 'offline') // serve il token di aggiornamento per i controlli sul server
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'false') // mai permessi concessi in passato ad altro
  u.searchParams.set('state', p.state)
  if (p.loginHint) u.searchParams.set('login_hint', p.loginHint)
  return u.toString()
}

/** Vero solo se Google ha concesso esattamente il permesso di sola lettura, e nient'altro. */
export function permessoSoloLettura(scope: string | null | undefined): boolean {
  const permessi = (scope ?? '').split(/\s+/).filter(Boolean)
  return permessi.length === 1 && permessi[0] === PERMESSO_GMAIL
}

function segretoStato(): string {
  const chiave = process.env.EMAIL_TOKEN_CHIAVE
  if (!chiave) throw new Error('EMAIL_TOKEN_CHIAVE non configurata')
  return sha256(`stato-oauth-gmail:${chiave}`)
}

/**
 * Stato OAuth firmato e con scadenza, legato all'utente e a un codice casuale che resta in un
 * cookie httpOnly (protezione contro le richieste contraffatte, CSRF).
 */
export function creaStato(utenteId: string, adesso = Date.now()): { state: string; nonce: string } {
  const nonce = codiceCasuale(24)
  const corpo = Buffer.from(JSON.stringify({ u: utenteId, n: sha256(nonce), s: adesso + DURATA_STATO_MS })).toString('base64url')
  return { state: `${corpo}.${firma(corpo, segretoStato())}`, nonce }
}

export function verificaStato(state: string | null | undefined, utenteId: string, nonce: string | null | undefined, adesso = Date.now()): boolean {
  if (!state || !nonce) return false
  const [corpo, f, ...resto] = state.split('.')
  if (!corpo || !f || resto.length || !verificaFirma(corpo, f, segretoStato())) return false
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as { u?: string; n?: string; s?: number }
    return d.u === utenteId && d.n === sha256(nonce) && typeof d.s === 'number' && d.s > adesso
  } catch {
    return false
  }
}

export const opzioniCookieStato = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const, // il ritorno da Google è una navigazione GET: il cookie deve arrivare
  path: '/api/gmail',
  maxAge: DURATA_STATO_MS / 1000,
})

type RispostaToken = {
  access_token?: string
  refresh_token?: string
  scope?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function richiestaToken(parametri: Record<string, string>): Promise<{ stato: number; dati: RispostaToken }> {
  let r: Response
  try {
    r = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(parametri),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('Google non è raggiungibile')
  }
  const dati = (await r.json().catch(() => ({}))) as RispostaToken
  return { stato: r.status, dati }
}

function credenziali() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Collegamento con Google non configurato')
  return { client_id: clientId, client_secret: clientSecret }
}

/** Scambia il codice del consenso con i token. */
export async function scambiaCodice(codice: string, redirectUri: string) {
  const { stato, dati } = await richiestaToken({
    ...credenziali(), code: codice, redirect_uri: redirectUri, grant_type: 'authorization_code',
  })
  if (stato !== 200 || !dati.access_token) throw new Error(`Google non ha concesso l'accesso (${dati.error ?? stato})`)
  return { accessToken: dati.access_token, refreshToken: dati.refresh_token ?? null, scope: dati.scope ?? '' }
}

/** Token di accesso (valido circa un'ora) dal token di aggiornamento. */
export async function tokenDiAccesso(refreshToken: string) {
  const { stato, dati } = await richiestaToken({
    ...credenziali(), refresh_token: refreshToken, grant_type: 'refresh_token',
  })
  if (dati.error === 'invalid_grant') throw new ErroreTokenRevocato('Google ha rifiutato il token della casella')
  if (stato !== 200 || !dati.access_token) throw new Error(`Google non ha rinnovato l'accesso (${dati.error ?? stato})`)
  return { accessToken: dati.access_token, scope: dati.scope ?? null }
}

/** Revoca il token presso Google (scollegamento). Un token già revocato conta come revocato. */
export async function revocaToken(token: string): Promise<boolean> {
  try {
    const r = await fetch(URL_REVOCA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (r.ok) return true
    const dati = (await r.json().catch(() => ({}))) as RispostaToken
    return dati.error === 'invalid_token'
  } catch {
    return false
  }
}
