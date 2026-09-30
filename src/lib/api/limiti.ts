// Limiti di frequenza dell'API (sezione 13.4). Modulo puro: il conteggio vero è atomico nel
// database (public.api_registra_uso, finestra di un minuto per token).

export const LIMITE_LETTURE_PREDEFINITO = 120
export const LIMITE_SCRITTURE_PREDEFINITO = 30

export type Limiti = { letture: number; scritture: number }

function intero(v: string | undefined, predefinito: number): number {
  if (v === undefined || v.trim() === '') return predefinito
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : predefinito
}

/** Limiti al minuto per token, configurabili con API_LIMITE_LETTURE e API_LIMITE_SCRITTURE. */
export function limitiDaAmbiente(env: Record<string, string | undefined> = process.env): Limiti {
  return {
    letture: intero(env.API_LIMITE_LETTURE, LIMITE_LETTURE_PREDEFINITO),
    scritture: intero(env.API_LIMITE_SCRITTURE, LIMITE_SCRITTURE_PREDEFINITO),
  }
}

/** Le richieste GET/HEAD sono letture; tutte le altre contano come scritture. */
export function eScrittura(metodo: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(metodo.toUpperCase())
}

export type EsitoConteggio = { consentito: boolean; conteggio: number; riprova_tra: number }

/** Intestazioni standard per far regolare l'agente (e Retry-After quando è bloccato). */
export function intestazioniLimite(limite: number, esito: EsitoConteggio): Record<string, string> {
  const h: Record<string, string> = {
    'X-RateLimit-Limit': String(limite),
    'X-RateLimit-Remaining': String(Math.max(0, limite - esito.conteggio)),
    'X-RateLimit-Reset': String(esito.riprova_tra),
  }
  if (!esito.consentito) h['Retry-After'] = String(esito.riprova_tra)
  return h
}

export function messaggioLimite(scrittura: boolean, limite: number, riprovaTra: number): string {
  return `Troppe richieste: il limite è di ${limite} ${scrittura ? 'scritture' : 'letture'} al minuto per token. ` +
    `Riprova tra ${riprovaTra} ${riprovaTra === 1 ? 'secondo' : 'secondi'}.`
}
