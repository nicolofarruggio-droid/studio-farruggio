// Forma delle risposte dell'API: nomi stabili, date ISO 8601, stato degli indicatori già calcolato.
import { descriviAggiornamento, statoIndicatore, type StatoIndicatore } from '@/lib/date'
import type { RigaCliente } from '@/lib/dati/clienti'
import type { RigaCompito } from '@/lib/dati/compiti'

export const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null)

export const nomeDi = (u: { nome: string; cognome?: string | null }) => `${u.nome} ${u.cognome ?? ''}`.trim()

export type IndicatoreApi = {
  aggiornato_fino_al: string | null
  non_applicabile: boolean
  stato: StatoIndicatore
  descrizione: string
}

const DESCRIZIONI_STATO: Record<StatoIndicatore, string> = {
  aggiornato: 'Aggiornato',
  in_ritardo: 'In ritardo',
  da_impostare: 'Da impostare',
  non_applicabile: 'Non applicabile',
}

export function indicatore(
  v: { aggiornato_fino_al: string | null; non_applicabile: boolean } | null | undefined,
  sogliaMesi: number,
): IndicatoreApi {
  const stato = statoIndicatore(v, sogliaMesi)
  const data = v?.aggiornato_fino_al ?? null
  return {
    aggiornato_fino_al: data,
    non_applicabile: v?.non_applicabile ?? false,
    stato,
    descrizione: stato === 'aggiornato' || stato === 'in_ritardo'
      ? `${DESCRIZIONI_STATO[stato]}: ${descriviAggiornamento(data!)}`
      : DESCRIZIONI_STATO[stato],
  }
}

export type Soglie = { soglia_ritardo_iva_mesi: number; soglia_ritardo_prima_nota_mesi: number }

export function clienteInElenco(r: RigaCliente, s: Soglie) {
  return {
    id: r.id,
    ragione_sociale: r.ragione_sociale,
    nome_visualizzazione: r.nome_visualizzazione,
    stato: r.stato,
    titolare: r.titolare,
    referente: r.referente_id ? { id: r.referente_id, nome: r.referente } : null,
    indicatori: {
      iva: indicatore(r.iva, s.soglia_ritardo_iva_mesi),
      prima_nota: indicatore(r.prima_nota, s.soglia_ritardo_prima_nota_mesi),
    },
    partita_iva: r.partita_iva,
    numero_dipendenti: r.numero_dipendenti,
    fatturato: r.fatturato === null ? null : Number(r.fatturato),
    compiti_aperti: r.compiti_aperti,
    puo_lavorare: r.puo_lavorare,
    url: `/clienti/${r.id}`,
  }
}

export function compitoInElenco(r: RigaCompito) {
  return {
    id: r.id,
    titolo: r.titolo,
    stato: r.stato,
    priorita: r.priorita,
    scadenza: iso(r.scadenza),
    scadenza_con_orario: r.scadenza_con_orario,
    cliente: r.cliente_id ? { id: r.cliente_id, nome: r.cliente } : null,
    creato_da: r.creato_da ? { id: r.creato_da, nome: r.creato_da_nome, agente: r.creato_da_agente } : null,
    assegnatari: r.assegnatari,
    documenti: r.documenti,
    completato_il: iso(r.completato_il),
    creato_il: iso(r.creato_il),
    url: `/compiti/${r.id}`,
  }
}

/** Paginazione in memoria di un elenco già filtrato dal database. */
export function pagina<T>(righe: T[], p: { pagina: number; limite: number }, totaleNoto = true) {
  const inizio = (p.pagina - 1) * p.limite
  return {
    dati: righe.slice(inizio, inizio + p.limite),
    pagina: p.pagina,
    limite: p.limite,
    ha_altre: righe.length > inizio + p.limite,
    ...(totaleNoto ? { totale: righe.length } : {}),
  }
}
