// Errori dell'API: codice HTTP, codice leggibile da un programma e messaggio esplicito in italiano.
import type { z } from 'zod'
import { messaggioErrore } from '@/lib/errori'

export type CodiceErrore =
  | 'richiesta_non_valida'   // 400: JSON malformato, parametri di ricerca o identificativi non validi
  | 'non_autenticato'        // 401
  | 'permesso_negato'        // 403
  | 'non_trovato'            // 404
  | 'conflitto'              // 409: regola del gestionale (compito chiuso, già deciso…)
  | 'dati_non_validi'        // 422: il corpo non rispetta lo schema
  | 'troppe_richieste'       // 429
  | 'errore_interno'         // 500

export type CampoErrato = { campo: string; messaggio: string }

export class ErroreApi extends Error {
  constructor(
    readonly stato: number,
    readonly codice: CodiceErrore,
    messaggio: string,
    readonly campi?: CampoErrato[],
    readonly intestazioni?: Record<string, string>,
  ) {
    super(messaggio)
  }
}

/** 404 con il testo completo, per esempio nonTrovato('Cliente non trovato') o nonTrovato('Proposta non trovata', true). */
export const nonTrovato = (testo: string, femminile = false) =>
  new ErroreApi(404, 'non_trovato', `${testo}, oppure non hai i permessi per ${femminile ? 'vederla' : 'vederlo'}.`)
export const permessoNegato = (messaggio: string) => new ErroreApi(403, 'permesso_negato', messaggio)

/** Trasforma gli errori di zod in un elenco di campi con messaggio. */
export function campiDaZod(errore: z.ZodError): CampoErrato[] {
  return errore.issues.flatMap((i) => {
    const base = i.path.map(String).join('.')
    if (i.code === 'unrecognized_keys') {
      return i.keys.map((k) => ({ campo: base ? `${base}.${k}` : k, messaggio: 'campo non previsto (controlla il nome)' }))
    }
    return [{ campo: base || '(corpo)', messaggio: i.message }]
  })
}

export function daZod(errore: z.ZodError, stato: 400 | 422, cosa: string): ErroreApi {
  const campi = campiDaZod(errore)
  const elenco = campi.map((c) => `${c.campo}: ${c.messaggio}`).join('; ')
  return new ErroreApi(stato, stato === 400 ? 'richiesta_non_valida' : 'dati_non_validi', `${cosa} non validi. ${elenco}`, campi)
}

/**
 * Errori del database → risposta. Le funzioni SQL alzano eccezioni con codici precisi:
 * 42501 permessi, P0002 non trovato, 22023 dati non validi, P0001 regola del gestionale.
 */
export function daDatabase(e: unknown): ErroreApi {
  if (e instanceof ErroreApi) return e
  const err = e as { code?: string; message?: string }
  const messaggio = messaggioErrore(e, 'Errore interno: riprova più tardi.')
  switch (err?.code) {
    case '42501':
      return new ErroreApi(403, 'permesso_negato', messaggio)
    case 'P0002':
      return new ErroreApi(404, 'non_trovato', messaggio)
    case '22023':
    case '23514':
    case '23502':
      return new ErroreApi(422, 'dati_non_validi', messaggio)
    case '23503':
      return new ErroreApi(422, 'dati_non_validi', 'Uno degli elementi indicati non esiste.')
    case '22P02':
    case '22007':
    case '22008':
      return new ErroreApi(400, 'richiesta_non_valida', 'Un valore della richiesta non ha il formato giusto.')
    case 'P0001':
    case '23505':
      return new ErroreApi(409, 'conflitto', messaggio)
  }
  // Solo codice e testo dell'errore: mai la query né i parametri (potrebbero contenere impronte o dati).
  console.error('[api] errore inatteso', err?.code ?? '', err?.message ?? String(e))
  return new ErroreApi(500, 'errore_interno', 'Errore interno: riprova più tardi.')
}

export function rispostaErrore(e: ErroreApi, intestazioni: Record<string, string> = {}): Response {
  return Response.json(
    { errore: { codice: e.codice, messaggio: e.message, ...(e.campi?.length ? { campi: e.campi } : {}) } },
    { status: e.stato, headers: { ...intestazioni, ...e.intestazioni, 'Cache-Control': 'no-store' } },
  )
}
