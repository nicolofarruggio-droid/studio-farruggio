// Schemi di validazione dell'API (zod). Modulo puro: lo usano le rotte, l'approvazione delle
// proposte (i dati proposti da un agente si rivalidano prima di eseguirli) e i test.
// Gli input restano JSON semplice (niente Date): così si salvano tali e quali nella coda di proposte.
import { z } from 'zod'
import { scadenzaDaInput } from '@/lib/date'
import { daZod, ErroreApi } from './errori'

/** Messaggi di zod in italiano (solo per le validazioni dell'API, senza toccare la configurazione globale). */
const erroriItaliani = z.locales.it().localeError

export const STATI_COMPITO = ['assegnato', 'in_lavorazione', 'pronto_revisione', 'completato', 'annullato'] as const
export const PRIORITA = ['normale', 'alta', 'urgente'] as const
export const TIPI_INDICATORE = ['iva', 'prima_nota'] as const
export type TipoIndicatore = (typeof TIPI_INDICATORE)[number]
/** Stesse chiavi di COLONNE_ORDINABILI in src/lib/dati/clienti.ts (verificato in operazioni.ts). */
export const ORDINAMENTI_CLIENTI = ['ragione_sociale', 'titolare', 'referente', 'iva', 'prima_nota', 'dipendenti', 'fatturato', 'compiti'] as const

const uuid = () => z.uuid({ error: 'atteso un identificativo UUID' })
const dataIso = z.iso.date({ error: 'Data non valida: usa il formato AAAA-MM-GG (per esempio 2026-08-31)' })

/** Scadenza: "AAAA-MM-GG" (fine giornata, senza orario) oppure data e ora ISO 8601 con fuso ("2026-10-02T17:30:00+02:00"). */
export const scadenza = z.union([dataIso, z.iso.datetime({ offset: true })], {
  error: 'Scadenza non valida: usa "AAAA-MM-GG" oppure data e ora ISO 8601 con fuso, per esempio "2026-10-02T17:30:00+02:00"',
})

export function leggiScadenza(s: string | null | undefined): { istante: Date | null; conOrario: boolean } {
  if (!s) return { istante: null, conOrario: false }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { istante: scadenzaDaInput(s), conOrario: false }
  return { istante: new Date(s), conOrario: true }
}

const paginazione = (massimo: number) => ({
  limite: z.coerce.number({ error: 'atteso un numero intero' }).int().min(1).max(massimo).default(50),
  pagina: z.coerce.number({ error: 'atteso un numero intero' }).int().min(1).max(10_000).default(1),
})

// ---------------------------------------------------------------------------
// Parametri di ricerca (query string)
// ---------------------------------------------------------------------------
export const queryClienti = z.strictObject({
  q: z.string().trim().max(200).optional(),
  collaboratore: z.union([uuid(), z.literal('nessuno')], { error: 'atteso un id di utente oppure "nessuno"' }).optional(),
  ritardo: z.enum(['iva', 'prima_nota', 'qualsiasi']).optional(),
  stato: z.enum(['attivo', 'archiviato', 'tutti']).optional(),
  ordina: z.enum(ORDINAMENTI_CLIENTI).optional(),
  verso: z.enum(['asc', 'desc']).optional(),
  ...paginazione(500),
})

export const queryCompiti = z.strictObject({
  q: z.string().trim().max(200).optional(),
  collaboratore: uuid().optional(),
  cliente: z.union([uuid(), z.literal('nessuno')], { error: 'atteso un id di cliente oppure "nessuno"' }).optional(),
  stato: z.enum(['aperti', 'chiusi', 'tutti', ...STATI_COMPITO]).optional(),
  priorita: z.enum(PRIORITA).optional(),
  scadenza: z.enum(['scaduti', 'oggi', 'settimana', 'senza']).optional(),
  creati_da: uuid().optional(),
  assegnati_a: uuid().optional(),
  ...paginazione(200),
})

export const queryCollaboratori = z.strictObject({
  includi_disattivati: z.enum(['true', 'false']).optional(),
})

export const queryProposte = z.strictObject({
  stato: z.enum(['in_attesa', 'approvata', 'rifiutata', 'fallita', 'tutte']).optional(),
  ...paginazione(200),
})

export const queryVuota = z.strictObject({})

// ---------------------------------------------------------------------------
// Corpi delle richieste (e dati delle proposte)
// ---------------------------------------------------------------------------
export const corpoIndicatore = z.strictObject({
  aggiornato_fino_al: dataIso.nullable(),
  non_applicabile: z.boolean().default(false),
})
export const inputIndicatore = corpoIndicatore.extend({
  cliente_id: uuid(),
  tipo: z.enum(TIPI_INDICATORE),
})
export type InputIndicatore = z.infer<typeof inputIndicatore>

const titolo = z.string().trim().min(1, 'obbligatorio').max(300, 'al massimo 300 caratteri')
const descrizione = z.string().max(20_000, 'al massimo 20.000 caratteri')
const assegnatari = z.array(uuid(), { error: 'attesa una lista di id di persone dello studio' })
  .min(1, 'indica almeno una persona')
  .max(20, 'al massimo 20 persone')

export const corpoCreaCompito = z.strictObject({
  titolo,
  descrizione: descrizione.default(''),
  cliente_id: uuid().nullable().default(null),
  assegnatari,
  scadenza: scadenza.nullable().default(null),
  priorita: z.enum(PRIORITA).default('normale'),
})
export type InputCreaCompito = z.infer<typeof corpoCreaCompito>

const CAMPI_MODIFICABILI = ['titolo', 'descrizione', 'cliente_id', 'scadenza', 'priorita', 'assegnatari'] as const

const baseModificaCompito = z.strictObject({
  titolo: titolo.optional(),
  descrizione: descrizione.optional(),
  cliente_id: uuid().nullable().optional(),
  scadenza: scadenza.nullable().optional(),
  priorita: z.enum(PRIORITA).optional(),
  assegnatari: assegnatari.optional(),
  stato: z.enum(STATI_COMPITO).optional(),
  motivo: z.string().trim().max(2000, 'al massimo 2.000 caratteri').optional(),
  rimanda_indietro: z.boolean().optional(),
})

function controllaModifica(d: z.infer<typeof baseModificaCompito>, ctx: z.RefinementCtx) {
  const campi = CAMPI_MODIFICABILI.some((k) => d[k] !== undefined)
  if (!campi && d.stato === undefined && !d.rimanda_indietro) {
    ctx.addIssue({ code: 'custom', message: 'Indica almeno un campo da modificare, oppure "stato" o "rimanda_indietro"', path: [] })
  }
  if (d.rimanda_indietro && d.stato !== undefined && d.stato !== 'in_lavorazione') {
    ctx.addIssue({ code: 'custom', message: 'Con "rimanda_indietro" il compito torna "in_lavorazione": non indicare un altro stato', path: ['stato'] })
  }
  if (d.stato === 'annullato' && !d.motivo) {
    ctx.addIssue({ code: 'custom', message: 'Per annullare un compito scrivi il motivo', path: ['motivo'] })
  }
}

export const corpoModificaCompito = baseModificaCompito.superRefine(controllaModifica)
export const inputModificaCompito = baseModificaCompito.extend({ compito_id: uuid() }).superRefine(controllaModifica)
export type InputModificaCompito = z.infer<typeof inputModificaCompito>

export const eSoloCambioStato = (d: z.infer<typeof baseModificaCompito>) => CAMPI_MODIFICABILI.every((k) => d[k] === undefined)

export const corpoCommento = z.strictObject({
  testo: z.string().trim().min(1, 'il commento è vuoto').max(10_000, 'al massimo 10.000 caratteri'),
})
export const inputCommento = corpoCommento.extend({ compito_id: uuid() })
export type InputCommento = z.infer<typeof inputCommento>

// ---------------------------------------------------------------------------
// Aiuti per le rotte
// ---------------------------------------------------------------------------
/** Valida i parametri di ricerca: quelli sconosciuti sono un errore (aiuta a scoprire i refusi). */
export function validaQuery<S extends z.ZodType>(schema: S, params: URLSearchParams): z.infer<S> {
  const oggetto: Record<string, string> = {}
  for (const [k, v] of params) {
    if (k in oggetto) throw new ErroreApi(400, 'richiesta_non_valida', `Il parametro "${k}" è ripetuto: indicalo una volta sola.`)
    oggetto[k] = v
  }
  const ammessi = schema instanceof z.ZodObject ? Object.keys(schema.shape) : null
  const sconosciuti = ammessi ? Object.keys(oggetto).filter((k) => !ammessi.includes(k)) : []
  if (ammessi && sconosciuti.length) {
    throw new ErroreApi(400, 'richiesta_non_valida',
      `Parametr${sconosciuti.length === 1 ? 'o' : 'i'} di ricerca sconosciut${sconosciuti.length === 1 ? 'o' : 'i'}: ${sconosciuti.join(', ')}. ` +
      (ammessi.length ? `Quelli ammessi sono: ${ammessi.join(', ')}.` : 'Questa operazione non accetta parametri di ricerca.'),
      sconosciuti.map((k) => ({ campo: k, messaggio: 'parametro sconosciuto' })))
  }
  const r = schema.safeParse(oggetto, { error: erroriItaliani })
  if (!r.success) throw daZod(r.error, 400, 'Parametri di ricerca')
  return r.data
}

/** Valida un corpo già letto (o i dati di una proposta). */
export function validaDati<S extends z.ZodType>(schema: S, dati: unknown, stato: 400 | 422 = 422): z.infer<S> {
  const r = schema.safeParse(dati, { error: erroriItaliani })
  if (!r.success) throw daZod(r.error, stato, 'Dati')
  return r.data
}

/** Legge il corpo JSON della richiesta e lo valida. */
export async function validaCorpo<S extends z.ZodType>(schema: S, richiesta: Request): Promise<z.infer<S>> {
  const tipo = richiesta.headers.get('content-type') ?? ''
  if (!tipo.toLowerCase().includes('application/json')) {
    throw new ErroreApi(400, 'richiesta_non_valida', 'Il corpo della richiesta deve essere JSON: aggiungi l\'intestazione "Content-Type: application/json".')
  }
  const testo = await richiesta.text()
  if (testo.length > 100_000) throw new ErroreApi(400, 'richiesta_non_valida', 'Il corpo della richiesta è troppo grande (massimo 100 KB).')
  let dati: unknown
  try {
    dati = JSON.parse(testo)
  } catch {
    throw new ErroreApi(400, 'richiesta_non_valida', 'Il corpo della richiesta non è JSON valido.')
  }
  return validaDati(schema, dati)
}

/** Identificativo nel percorso (/clienti/{id}): deve essere un UUID. */
export function idDaPercorso(valore: string | string[] | undefined, cosa = 'id'): string {
  const v = Array.isArray(valore) ? valore[0] : valore
  if (!v || !z.uuid().safeParse(v).success) {
    throw new ErroreApi(400, 'richiesta_non_valida', `L'identificativo "${cosa}" nel percorso non è valido: atteso un UUID.`)
  }
  return v.toLowerCase()
}
