// Date e orari: salvati in UTC, mostrati nel fuso Europe/Rome (sezione 2).
import { TZDate } from '@date-fns/tz'

export const FUSO = 'Europe/Rome'

const fmtData = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtDataOra = new Intl.DateTimeFormat('it-IT', {
  timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const fmtGiorno = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, weekday: 'short', day: 'numeric', month: 'short' })
const fmtParti = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Parti di data e ora a Roma per un istante. */
export function partiRoma(d: Date = new Date()) {
  const p = Object.fromEntries(fmtParti.formatToParts(d).map((x) => [x.type, x.value]))
  const giorni: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    anno: Number(p.year), mese: Number(p.month), giorno: Number(p.day),
    ora: Number(p.hour), minuto: Number(p.minute), giornoSettimana: giorni[p.weekday as string],
  }
}

/** Oggi a Roma, come "AAAA-MM-GG". */
export function oggiISO(d: Date = new Date()): string {
  const p = partiRoma(d)
  return `${p.anno}-${String(p.mese).padStart(2, '0')}-${String(p.giorno).padStart(2, '0')}`
}

export function fineMeseISO(anno: number, mese: number): string {
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  return `${anno}-${String(mese).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
}

export function isoValida(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, g] = s.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, g))
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g
}

/** Sottrae mesi a una data ISO, restando nel mese giusto (31/03 - 1 mese = 28 o 29/02). */
export function menoMesiISO(iso: string, mesi: number): string {
  const [a, m, g] = iso.split('-').map(Number)
  const tot = a * 12 + (m - 1) - mesi
  const na = Math.floor(tot / 12)
  const nm = (tot % 12) + 1
  const ultimo = new Date(Date.UTC(na, nm, 0)).getUTCDate()
  return `${na}-${String(nm).padStart(2, '0')}-${String(Math.min(g, ultimo)).padStart(2, '0')}`
}

export function formattaData(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [a, m, g] = d.split('-')
    return `${g}/${m}/${a}`
  }
  return fmtData.format(new Date(d))
}

export const formattaDataOra = (d: Date | string | null | undefined) => (d ? fmtDataOra.format(new Date(d)) : '')
export const formattaOra = (d: Date | string) => fmtOra.format(new Date(d))
export const formattaGiorno = (d: Date | string) => fmtGiorno.format(new Date(d))

/** "agosto 2026" da "2026-08-31". */
export function meseAnno(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return `${MESI[m - 1]} ${a}`
}

export function eFineMese(iso: string): boolean {
  const [a, m] = iso.split('-').map(Number)
  return fineMeseISO(a, m) === iso
}

/** "a luglio 2026", "ad agosto 2026": preposizione corretta davanti a vocale. */
export function aMese(testo: string): string {
  return /^[aeiou]/i.test(testo) ? `ad ${testo}` : `a ${testo}`
}

/** Testo leggibile di un indicatore: "agosto 2026" o, se non è fine mese, "15/08/2026". */
export function descriviAggiornamento(iso: string): string {
  return eFineMese(iso) ? meseAnno(iso) : formattaData(iso)
}

export type StatoIndicatore = 'aggiornato' | 'in_ritardo' | 'da_impostare' | 'non_applicabile'

/**
 * Sezione 7: "in ritardo" se la data è più vecchia della soglia (in mesi) rispetto a oggi.
 * Esempio con soglia 2 mesi, oggi 30/09/2026: 31/07/2026 è in regola, 30/06/2026 è in ritardo.
 */
export function statoIndicatore(
  valore: { aggiornato_fino_al: string | null; non_applicabile: boolean } | null | undefined,
  sogliaMesi: number,
  oggi: string = oggiISO(),
): StatoIndicatore {
  if (valore?.non_applicabile) return 'non_applicabile'
  if (!valore?.aggiornato_fino_al) return 'da_impostare'
  return valore.aggiornato_fino_al < menoMesiISO(oggi, sogliaMesi) ? 'in_ritardo' : 'aggiornato'
}

/** Istante UTC da data e ora locali di Roma ("2026-10-02", "17:30"). Senza ora: fine giornata. */
export function scadenzaDaInput(data: string, ora?: string | null): Date {
  const [a, m, g] = data.split('-').map(Number)
  if (ora && /^\d{2}:\d{2}$/.test(ora)) {
    const [h, min] = ora.split(':').map(Number)
    return new Date(new TZDate(a, m - 1, g, h, min, 0, FUSO).getTime())
  }
  return new Date(new TZDate(a, m - 1, g, 23, 59, 59, FUSO).getTime())
}

/** Data e ora a Roma per precompilare i campi di un modulo. */
export function inputDaScadenza(d: Date | string | null): { data: string; ora: string } {
  if (!d) return { data: '', ora: '' }
  const p = partiRoma(new Date(d))
  return {
    data: `${p.anno}-${String(p.mese).padStart(2, '0')}-${String(p.giorno).padStart(2, '0')}`,
    ora: `${String(p.ora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`,
  }
}

export type StatoScadenza = 'scaduto' | 'oggi' | 'settimana' | 'dopo' | 'nessuna'

export function statoScadenza(scadenza: Date | string | null, adesso: Date = new Date()): StatoScadenza {
  if (!scadenza) return 'nessuna'
  const s = new Date(scadenza)
  if (s.getTime() < adesso.getTime()) return 'scaduto'
  const giornoS = oggiISO(s)
  const oggi = oggiISO(adesso)
  if (giornoS === oggi) return 'oggi'
  const traSette = oggiISO(new Date(adesso.getTime() + 7 * 86400000))
  return giornoS <= traSette ? 'settimana' : 'dopo'
}

export function descriviScadenza(scadenza: Date | string | null, conOrario: boolean): string {
  if (!scadenza) return 'Senza scadenza'
  const d = new Date(scadenza)
  const oggi = oggiISO()
  const giorno = oggiISO(d)
  const domani = oggiISO(new Date(Date.now() + 86400000))
  const ieri = oggiISO(new Date(Date.now() - 86400000))
  const quando = giorno === oggi ? 'oggi' : giorno === domani ? 'domani' : giorno === ieri ? 'ieri' : formattaData(d)
  return conOrario ? `${quando} alle ${formattaOra(d)}` : quando
}
