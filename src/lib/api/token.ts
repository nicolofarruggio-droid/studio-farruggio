// Token dell'API (modulo puro, senza accesso al database).
// Due tipi di credenziali nell'intestazione "Authorization: Bearer …":
// * token di un account agente: "bbs_" + 43 caratteri base64url (32 byte casuali). Nel database
//   c'è solo l'impronta SHA-256 e il prefisso per riconoscerlo nell'elenco;
// * access token di Supabase (JWT) di una persona, lo stesso che il sito usa dopo l'accesso.

export const PREFISSO_TOKEN = 'bbs_'
/** Lunghezza del prefisso mostrato nell'elenco dei token ("bbs_" + 8 caratteri). */
export const LUNGHEZZA_PREFISSO = 12

const FORMATO_TOKEN_AGENTE = /^bbs_[A-Za-z0-9_-]{43}$/
const FORMATO_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export type Credenziale =
  | { tipo: 'agente'; token: string }
  | { tipo: 'persona'; token: string }
  | { tipo: 'errore'; messaggio: string }

/** Legge l'intestazione Authorization. Non registra mai il token da nessuna parte. */
export function leggiAutorizzazione(intestazione: string | null | undefined): Credenziale {
  if (!intestazione?.trim()) {
    return {
      tipo: 'errore',
      messaggio: 'Manca l\'intestazione "Authorization: Bearer <token>". Usa il token di un account agente (bbs_…) oppure l\'access token di una persona.',
    }
  }
  const m = /^Bearer\s+(\S+)\s*$/i.exec(intestazione.trim())
  if (!m) {
    return { tipo: 'errore', messaggio: 'Intestazione Authorization non valida: il formato è "Bearer <token>".' }
  }
  const token = m[1]
  if (token.startsWith(PREFISSO_TOKEN)) {
    return FORMATO_TOKEN_AGENTE.test(token)
      ? { tipo: 'agente', token }
      : { tipo: 'errore', messaggio: 'Token agente non valido: controlla di averlo copiato per intero.' }
  }
  if (FORMATO_JWT.test(token)) return { tipo: 'persona', token }
  return { tipo: 'errore', messaggio: 'Token non riconosciuto: usa un token agente (bbs_…) o un access token di Supabase.' }
}

/** Compone un nuovo token agente a partire da un codice casuale base64url di 32 byte. */
export function componiTokenAgente(codiceCasuale: string): { token: string; prefisso: string } {
  const token = PREFISSO_TOKEN + codiceCasuale
  if (!FORMATO_TOKEN_AGENTE.test(token)) throw new Error('Codice casuale non valido per un token agente')
  return { token, prefisso: token.slice(0, LUNGHEZZA_PREFISSO) }
}

export const eTokenAgente = (s: string) => FORMATO_TOKEN_AGENTE.test(s)
