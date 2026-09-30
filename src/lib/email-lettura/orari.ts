// Quando si controllano le caselle (sezione 16.3): ogni 10 minuti, dalle 8 alle 21, dal lunedì al sabato,
// ora italiana. Il processo pianificato parte ogni 10 minuti e si ferma subito fuori orario; gli orari
// si calcolano nel fuso Europe/Rome, così il cambio dell'ora legale non li sposta.
// Valori modificabili senza toccare il codice: EMAIL_CONTROLLO_MINUTI, _ORA_INIZIO, _ORA_FINE, _GIORNI.
import { partiRoma } from '@/lib/date'

export type ConfigControlli = {
  /** ogni quanti minuti */
  minuti: number
  /** primo controllo del giorno (ora intera, ora italiana) */
  oraInizio: number
  /** ultimo controllo del giorno (ora intera, ora italiana): alle 21:00 sì, alle 21:10 no */
  oraFine: number
  /** 1 = lunedì … 7 = domenica */
  giorni: number[]
}

export const CONTROLLI_PREDEFINITI: ConfigControlli = { minuti: 10, oraInizio: 8, oraFine: 21, giorni: [1, 2, 3, 4, 5, 6] }

function intero(v: string | undefined, min: number, max: number, predefinito: number): number {
  if (v === undefined || v.trim() === '') return predefinito
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : predefinito
}

export function configControlli(env: Record<string, string | undefined> = process.env): ConfigControlli {
  const giorni = (env.EMAIL_CONTROLLO_GIORNI ?? '')
    .split(',')
    .map((g) => Number(g.trim()))
    .filter((g) => Number.isInteger(g) && g >= 1 && g <= 7)
  const oraInizio = intero(env.EMAIL_CONTROLLO_ORA_INIZIO, 0, 23, CONTROLLI_PREDEFINITI.oraInizio)
  const oraFine = intero(env.EMAIL_CONTROLLO_ORA_FINE, 0, 23, CONTROLLI_PREDEFINITI.oraFine)
  return {
    minuti: intero(env.EMAIL_CONTROLLO_MINUTI, 1, 1440, CONTROLLI_PREDEFINITI.minuti),
    oraInizio,
    oraFine: Math.max(oraInizio, oraFine),
    giorni: giorni.length ? [...new Set(giorni)].sort() : CONTROLLI_PREDEFINITI.giorni,
  }
}

/**
 * È orario di controllo? Il giorno deve essere tra quelli scelti e l'ora tra l'inizio e la fine
 * (compresa l'ultima fascia: con fine alle 21 e controlli ogni 10 minuti, 21:00–21:09 sì, 21:10 no).
 */
export function eOrarioDiControllo(adesso: Date, c: ConfigControlli = CONTROLLI_PREDEFINITI): boolean {
  const p = partiRoma(adesso)
  const giorno = p.giornoSettimana === 0 ? 7 : p.giornoSettimana
  if (!c.giorni.includes(giorno)) return false
  const minuti = p.ora * 60 + p.minuto
  return minuti >= c.oraInizio * 60 && minuti < c.oraFine * 60 + Math.min(c.minuti, 60)
}

/** Una casella è "da controllare" se l'ultimo controllo è più vecchio dell'intervallo (con un minuto di margine). */
export function margineControlloMinuti(c: ConfigControlli): number {
  return Math.max(c.minuti - 1, 0)
}

/**
 * Prossimo controllo previsto per una casella: la prima fascia del processo pianificato (multipli
 * dell'intervallo) in orario di controllo e dopo che è passato l'intervallo dall'ultimo controllo.
 */
export function prossimoControllo(
  adesso: Date,
  ultimoControllo: Date | null,
  c: ConfigControlli = CONTROLLI_PREDEFINITI,
): Date | null {
  const passo = c.minuti * 60_000
  let t = adesso.getTime()
  if (ultimoControllo) t = Math.max(t, ultimoControllo.getTime() + margineControlloMinuti(c) * 60_000)
  t = Math.ceil(t / passo) * passo
  const limite = t + 8 * 24 * 60 * 60_000
  for (; t <= limite; t += passo) {
    const d = new Date(t)
    if (eOrarioDiControllo(d, c)) return d
  }
  return null
}

/** Descrizione degli orari per la pagina "La mia email". */
export function descriviOrari(c: ConfigControlli = CONTROLLI_PREDEFINITI): string {
  const nomi = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']
  const g = c.giorni
  const consecutivi = g.every((x, i) => i === 0 || x === g[i - 1] + 1)
  const giorni = g.length === 7 ? 'tutti i giorni' : consecutivi && g.length > 2
    ? `dal ${nomi[g[0]]} al ${nomi[g[g.length - 1]]}`
    : g.map((x) => nomi[x]).join(', ')
  const ogni = c.minuti % 60 === 0 ? (c.minuti === 60 ? 'ogni ora' : `ogni ${c.minuti / 60} ore`) : `ogni ${c.minuti} minuti`
  return `${ogni}, dalle ${c.oraInizio} alle ${c.oraFine}, ${giorni} (ora italiana)`
}
