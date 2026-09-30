import type { FiltriCompiti, Priorita, RigaCompito, StatoCompito } from '@/lib/dati/compiti'
import { UUID_VALIDO } from '@/lib/documenti/regole'

// Filtri, vista e ordinamento dell'elenco compiti, letti dall'URL (sezione 13.1: URL stabili e leggibili).
// /compiti?q=&collaboratore=&cliente=&stato=&scadenza=&priorita=&vista=lista|scadenze&ordina=&verso=

export const STATI_FILTRO = {
  aperti: 'Aperti',
  assegnato: 'Assegnati',
  in_lavorazione: 'In lavorazione',
  pronto_revisione: 'Pronti per revisione',
  chiusi: 'Chiusi',
  completato: 'Completati',
  annullato: 'Annullati',
  tutti: 'Tutti',
} as const

export const SCADENZE_FILTRO = {
  scaduti: 'Scaduti',
  oggi: 'Scadono oggi',
  settimana: 'Nei prossimi 7 giorni',
  senza: 'Senza scadenza',
} as const

export const PRIORITA_FILTRO = { urgente: 'Urgente', alta: 'Alta', normale: 'Normale' } as const

export const COLONNE = {
  titolo: 'Compito',
  cliente: 'Cliente',
  assegnato: 'Assegnato a',
  scadenza: 'Scadenza',
  priorita: 'Priorità',
  stato: 'Stato',
  documenti: 'Documenti',
} as const

export type Colonna = keyof typeof COLONNE
export type Vista = 'lista' | 'scadenze'

export type ParametriElenco = {
  filtri: Required<Pick<FiltriCompiti, 'q' | 'collaboratore' | 'cliente' | 'stato' | 'priorita'>> & { scadenza: NonNullable<FiltriCompiti['scadenza']> }
  vista: Vista
  ordina: Colonna
  verso: 'asc' | 'desc'
}

type Grezzi = Record<string, string | string[] | undefined>

const uno = (p: Grezzi, k: string) => {
  const v = p[k]
  return (Array.isArray(v) ? v[0] : v ?? '').trim()
}
const tra = <T extends string>(v: string, ammessi: readonly T[], predefinito: T): T => (ammessi.includes(v as T) ? (v as T) : predefinito)

export function leggiParametri(p: Grezzi): ParametriElenco {
  const collaboratore = uno(p, 'collaboratore').toLowerCase()
  const cliente = uno(p, 'cliente').toLowerCase()
  return {
    filtri: {
      q: uno(p, 'q').slice(0, 200),
      collaboratore: UUID_VALIDO.test(collaboratore) ? collaboratore : '',
      cliente: cliente === 'nessuno' || UUID_VALIDO.test(cliente) ? cliente : '',
      stato: tra(uno(p, 'stato'), Object.keys(STATI_FILTRO) as (keyof typeof STATI_FILTRO)[], 'aperti'),
      scadenza: tra(uno(p, 'scadenza'), ['', 'scaduti', 'oggi', 'settimana', 'senza'] as const, ''),
      priorita: tra(uno(p, 'priorita'), ['', ...Object.keys(PRIORITA_FILTRO)], ''),
    },
    vista: uno(p, 'vista') === 'scadenze' ? 'scadenze' : 'lista',
    ordina: tra(uno(p, 'ordina'), Object.keys(COLONNE) as Colonna[], 'scadenza'),
    verso: uno(p, 'verso') === 'desc' ? 'desc' : 'asc',
  }
}

/** Query string con i soli valori diversi dal predefinito (più `cambia`). */
export function queryElenco(par: ParametriElenco, cambia: Partial<Record<string, string>> = {}): string {
  const v: Record<string, string> = {
    q: par.filtri.q, collaboratore: par.filtri.collaboratore, cliente: par.filtri.cliente,
    stato: par.filtri.stato === 'aperti' ? '' : par.filtri.stato, scadenza: par.filtri.scadenza, priorita: par.filtri.priorita,
    vista: par.vista, ordina: par.ordina === 'scadenza' ? '' : par.ordina, verso: par.verso === 'asc' ? '' : par.verso,
    ...cambia,
  }
  const q = new URLSearchParams()
  for (const [k, x] of Object.entries(v)) if (x) q.set(k, x)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const filtriAttivi = (par: ParametriElenco) =>
  !!(par.filtri.q || par.filtri.collaboratore || par.filtri.cliente || par.filtri.scadenza || par.filtri.priorita || par.filtri.stato !== 'aperti')

const PESO_PRIORITA: Record<Priorita, number> = { urgente: 0, alta: 1, normale: 2 }
const PESO_STATO: Record<StatoCompito, number> = { assegnato: 0, in_lavorazione: 1, pronto_revisione: 2, completato: 3, annullato: 4 }
const testo = (a: string, b: string) => a.localeCompare(b, 'it', { sensitivity: 'base' })

/** Ordinamento dell'elenco. "Senza scadenza" resta sempre in fondo quando si ordina per scadenza. */
export function ordinaCompiti(righe: RigaCompito[], ordina: Colonna, verso: 'asc' | 'desc'): RigaCompito[] {
  const s = verso === 'desc' ? -1 : 1
  const perScadenza = (a: RigaCompito, b: RigaCompito, segno = 1) => {
    if (!a.scadenza || !b.scadenza) return a.scadenza ? -1 : b.scadenza ? 1 : 0
    return segno * (new Date(a.scadenza).getTime() - new Date(b.scadenza).getTime())
  }
  const confronto: Record<Colonna, (a: RigaCompito, b: RigaCompito) => number> = {
    titolo: (a, b) => s * testo(a.titolo, b.titolo),
    cliente: (a, b) => s * testo(a.cliente ?? '', b.cliente ?? ''),
    assegnato: (a, b) => s * testo(a.assegnatari.map((x) => x.nome).join(), b.assegnatari.map((x) => x.nome).join()),
    scadenza: (a, b) => perScadenza(a, b, s),
    priorita: (a, b) => s * (PESO_PRIORITA[a.priorita] - PESO_PRIORITA[b.priorita]),
    stato: (a, b) => s * (PESO_STATO[a.stato] - PESO_STATO[b.stato]),
    documenti: (a, b) => s * (a.documenti - b.documenti),
  }
  // a parità: scadenza crescente (senza scadenza in fondo), poi l'ordine del database
  return righe
    .map((r, i) => ({ r, i }))
    .sort((x, y) => confronto[ordina](x.r, y.r) || perScadenza(x.r, y.r) || x.i - y.i)
    .map((x) => x.r)
}
