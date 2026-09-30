// Azioni degli agenti nel registro attività: etichette, descrizioni leggibili e regole di annullamento.
// Modulo puro (lo usano la pagina di gestione, l'annullamento e i test).
import { descriviAggiornamento, formattaData } from '@/lib/date'
import { ETICHETTE_PROPOSTA, type AzioneProposta } from './permessi-agente'

/**
 * Per quanti giorni un'azione dell'agente resta annullabile ("modifiche recenti", sezione 13.4).
 * DECISIONE APERTA: proposta 30 giorni; oltre si corregge a mano dalla scheda del cliente o del compito.
 */
export const GIORNI_ANNULLAMENTO = 30

export const AZIONI_REGISTRO_AGENTE = {
  compito_creato: 'Compito creato',
  compito_modificato: 'Compito modificato',
  compito_stato_cambiato: 'Stato di un compito cambiato',
  indicatore_aggiornato: 'Indicatore aggiornato',
  commento_aggiunto: 'Commento aggiunto',
  documento_caricato: 'Documento caricato',
  proposta_creata: 'Proposta messa in coda',
} as const
export type AzioneRegistroAgente = keyof typeof AZIONI_REGISTRO_AGENTE

export const eAzioneRegistroAgente = (s: string): s is AzioneRegistroAgente => s in AZIONI_REGISTRO_AGENTE

const STATI: Record<string, string> = {
  assegnato: 'Assegnato', in_lavorazione: 'In lavorazione', pronto_revisione: 'Pronto per revisione',
  completato: 'Completato', annullato: 'Annullato',
}
export const etichettaStato = (s: unknown) => STATI[String(s)] ?? String(s)

const NOMI_INDICATORE: Record<string, string> = { iva: 'IVA', prima_nota: 'Prima nota' }

const CAMPI: Record<string, string> = {
  titolo: 'titolo', descrizione: 'descrizione', cliente_id: 'cliente', scadenza: 'scadenza',
  scadenza_con_orario: 'orario della scadenza', priorita: 'priorità', assegnatari: 'assegnatari',
}

type Valore = { aggiornato_fino_al: string | null; non_applicabile: boolean } | null | undefined

export function descriviValoreIndicatore(v: Valore): string {
  if (!v) return 'da impostare'
  if (v.non_applicabile) return 'non applicabile'
  return v.aggiornato_fino_al ? descriviAggiornamento(v.aggiornato_fino_al) : 'da impostare'
}

const testo = (v: unknown) => (typeof v === 'string' ? v : '')

/** "a" oppure "ad" davanti a una parola che comincia per a ("ad agosto 2026"). */
export const aOAd = (parola: string) => `${/^a/i.test(parola) ? 'ad' : 'a'} ${parola}`

/** Descrizione in italiano semplice di una riga del registro scritta da un agente. */
export function descriviVoceRegistro(azione: string, d: Record<string, unknown>): string {
  switch (azione) {
    case 'compito_creato': {
      const chi = Array.isArray(d.assegnatari) ? d.assegnatari.join(', ') : ''
      return `Ha creato il compito «${testo(d.titolo)}»` + (chi ? ` per ${chi}` : '') + (d.cliente ? `, cliente ${testo(d.cliente)}` : '')
    }
    case 'compito_modificato': {
      const dopo = (d.dopo ?? {}) as Record<string, unknown>
      const campi = Object.keys(dopo).map((k) => CAMPI[k] ?? k).join(', ')
      return `Ha modificato il compito «${testo(d.titolo)}» (${campi || 'nessun campo'})`
    }
    case 'compito_stato_cambiato':
      return d.rimandato
        ? `Ha rimandato indietro il compito «${testo(d.titolo)}»`
        : `Ha cambiato lo stato del compito «${testo(d.titolo)}» da ${etichettaStato(d.prima)} ${aOAd(etichettaStato(d.dopo))}`
    case 'indicatore_aggiornato':
      return `Ha aggiornato ${NOMI_INDICATORE[testo(d.tipo)] ?? 'un indicatore'} di «${testo(d.cliente)}»: ` +
        `da ${descriviValoreIndicatore(d.prima as Valore)} ${aOAd(descriviValoreIndicatore(d.dopo as Valore))}`
    case 'commento_aggiunto':
      return `Ha commentato il compito «${testo(d.titolo)}»: «${testo(d.estratto)}»`
    case 'documento_caricato':
      return `Ha caricato il documento «${testo(d.nome_file)}» in un compito`
    case 'proposta_creata': {
      const cosa = ETICHETTE_PROPOSTA[testo(d.azione) as AzioneProposta]
      return cosa ? `Ha proposto di ${cosa.charAt(0).toLowerCase()}${cosa.slice(1)} (da approvare)` : 'Ha messo in coda una proposta da approvare'
    }
    default:
      return azione
  }
}

/**
 * Perché una riga non si può annullare dall'elenco (null = si può annullare).
 * I controlli sullo stato attuale (valore cambiato di nuovo, compito già chiuso…) li fa l'annullamento.
 */
export function motivoNonAnnullabile(
  r: { azione: string; annullabile: boolean; annullato_il: Date | string | null; creato_il: Date | string },
  adesso: Date = new Date(),
): string | null {
  if (r.annullato_il) return `Già annullata il ${formattaData(r.annullato_il)}.`
  if (r.azione === 'commento_aggiunto') return 'I commenti non si eliminano: restano nella cronologia del compito. Se serve, aggiungi un commento di rettifica.'
  if (r.azione === 'documento_caricato') return 'I documenti non si eliminano: restano nel compito.'
  if (r.azione === 'proposta_creata') return 'Le proposte si approvano o si rifiutano nella sezione "Proposte in attesa".'
  if (!r.annullabile) return 'Questa azione non ha cambiato nulla, oppure non si può annullare.'
  const giorni = (adesso.getTime() - new Date(r.creato_il).getTime()) / 86_400_000
  if (giorni > GIORNI_ANNULLAMENTO) return `Sono passati più di ${GIORNI_ANNULLAMENTO} giorni: correggi a mano dalla scheda del cliente o del compito.`
  return null
}
