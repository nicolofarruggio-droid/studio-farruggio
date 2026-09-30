// Traduce gli errori del database in messaggi chiari in italiano.
export class ErroreUtente extends Error {}

export function messaggioErrore(e: unknown, predefinito = 'Si è verificato un errore. Riprova.'): string {
  if (e instanceof ErroreUtente) return e.message
  const err = e as { code?: string; message?: string }
  switch (err?.code) {
    case 'P0001': // raise exception con messaggio per l'utente
    case 'P0002':
    case '22023':
      return err.message ?? predefinito
    case '42501':
      return err.message && !err.message.startsWith('permission denied') && !err.message.includes('row-level security')
        ? err.message
        : 'Non hai i permessi per questa operazione.'
    case '23505':
      return 'Esiste già un elemento con questi dati.'
    case '23514':
      return 'Alcuni dati non sono validi.'
    case '23503':
      return 'Uno degli elementi collegati non esiste più.'
  }
  if (process.env.NODE_ENV !== 'production') console.error(e)
  return predefinito
}

export type EsitoAzione<T = undefined> =
  | { ok: true; messaggio?: string; dati?: T }
  | { ok: false; errore: string; campi?: Record<string, string> }
