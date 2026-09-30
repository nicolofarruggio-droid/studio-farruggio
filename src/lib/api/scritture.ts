import 'server-only'
import type { z } from 'zod'
import type postgres from 'postgres'
import { conUtente, type Tx } from '@/lib/db'
import { descriviAggiornamento } from '@/lib/date'
import type { Chiamante } from './autenticazione'
import { ErroreApi, nonTrovato, permessoNegato } from './errori'
import { indicatore, iso } from './formato'
import { compitoCompleto, richiediCompito } from './operazioni'
import { AZIONI_PROPOSTA, DESCRIZIONI_AZIONI, livello, type AzioneProposta } from './permessi-agente'
import { risposta, type Esito } from './rotta'
import {
  corpoCreaCompito, inputCommento, inputIndicatore, inputModificaCompito, leggiScadenza,
  type InputCommento, type InputCreaCompito, type InputIndicatore, type InputModificaCompito,
} from './schemi'

// Operazioni di scrittura dell'API. Stesso codice per tre strade:
// * persona (admin o collaboratore): esegue con i suoi permessi;
// * agente con permesso "si": esegue con origine "agente" e scrive nel registro attività i valori
//   prima/dopo che servono per annullare (sezione 13.4);
// * agente con permesso "proposta": mette in coda i dati; un admin li approva e l'operazione viene
//   eseguita con le stesse funzioni, come l'admin che approva (vedi proposte.ts).

export type VoceRegistro = {
  azione: string
  entita: string
  entita_id: string | null
  dettagli: Record<string, unknown>
  annullabile: boolean
}

export type EsitoScrittura = {
  risultato: unknown
  stato: 200 | 201
  registro: VoceRegistro[]
  /** Testo breve per l'esito di una proposta approvata. */
  descrizione: string
  posizione?: string
}

export type OperazioneScrittura<S extends z.ZodType = z.ZodType> = {
  schema: S
  /** Controlli di esistenza e visibilità (404) prima di mettere in coda una proposta. */
  controlla: (tx: Tx, input: z.infer<S>) => Promise<void>
  esegui: (tx: Tx, chiamante: Chiamante, input: z.infer<S>) => Promise<EsitoScrittura>
}

// ---------------------------------------------------------------------------
// Controlli comuni
// ---------------------------------------------------------------------------
async function controllaAssegnatari(tx: Tx, ids: string[]) {
  const unici = [...new Set(ids)]
  const trovati = await tx<{ id: string }[]>`
    select id from public.utenti where id = any(${unici}::uuid[]) and ruolo in ('admin', 'collaboratore') and attivo`
  const mancanti = unici.filter((id) => !trovati.some((t) => t.id === id))
  if (mancanti.length) {
    throw new ErroreApi(422, 'dati_non_validi',
      `assegnatari: ${mancanti.join(', ')} non ${mancanti.length === 1 ? 'è una persona attiva' : 'sono persone attive'} dello studio. ` +
      'Usa GET /api/v1/collaboratori per l\'elenco.', [{ campo: 'assegnatari', messaggio: 'Persona non trovata o non attiva' }])
  }
}

async function controllaCliente(tx: Tx, id: string | null | undefined) {
  if (!id) return
  const [r] = await tx<{ ok: boolean }[]>`select public.puo_vedere_cliente(${id}) as ok`
  if (!r.ok) throw nonTrovato('Cliente non trovato')
}

async function nomeCliente(tx: Tx, id: string | null): Promise<string | null> {
  if (!id) return null
  const [r] = await tx<{ nome: string }[]>`select nome_visualizzazione as nome from public.clienti where id = ${id}`
  return r?.nome ?? null
}

// ---------------------------------------------------------------------------
// Crea compito
// ---------------------------------------------------------------------------
async function controllaCreaCompito(tx: Tx, d: InputCreaCompito) {
  await controllaAssegnatari(tx, d.assegnatari)
  await controllaCliente(tx, d.cliente_id)
}

const creaCompito: OperazioneScrittura<typeof corpoCreaCompito> = {
  schema: corpoCreaCompito,
  controlla: controllaCreaCompito,
  async esegui(tx, c, d: InputCreaCompito) {
    await controllaCreaCompito(tx, d)
    const s = leggiScadenza(d.scadenza)
    const [r] = await tx<{ id: string }[]>`
      select public.crea_compito(${d.titolo}, ${d.descrizione}, ${d.cliente_id}, ${d.assegnatari}::uuid[],
        ${s.istante}, ${s.conOrario}, ${d.priorita}) as id`
    const compito = await compitoCompleto(tx, r.id, c)
    return {
      risultato: compito,
      stato: 201,
      posizione: `/api/v1/compiti/${r.id}`,
      descrizione: `Compito «${d.titolo}» creato`,
      registro: [{
        azione: 'compito_creato',
        entita: 'compito',
        entita_id: r.id,
        dettagli: {
          titolo: d.titolo, cliente_id: d.cliente_id, cliente: compito.cliente?.nome ?? null,
          assegnatari: compito.assegnatari.map((a) => a.nome), scadenza: iso(s.istante), priorita: d.priorita,
        },
        annullabile: true,
      }],
    }
  },
}

// ---------------------------------------------------------------------------
// Aggiorna compito (campi, assegnatari, stato)
// ---------------------------------------------------------------------------
type CampiCompito = {
  titolo: string; descrizione: string; cliente_id: string | null; scadenza: string | null
  scadenza_con_orario: boolean; priorita: string
}

async function controllaAggiornaCompito(tx: Tx, d: InputModificaCompito) {
  await richiediCompito(tx, d.compito_id)
  if (d.assegnatari) await controllaAssegnatari(tx, d.assegnatari)
  if (d.cliente_id) await controllaCliente(tx, d.cliente_id)
}

const ETICHETTE_STATO: Record<string, string> = {
  assegnato: 'assegnato', in_lavorazione: 'in lavorazione', pronto_revisione: 'pronto per revisione',
  completato: 'completato', annullato: 'annullato',
}

const aggiornaCompito: OperazioneScrittura<typeof inputModificaCompito> = {
  schema: inputModificaCompito,
  controlla: controllaAggiornaCompito,
  async esegui(tx, c, d: InputModificaCompito) {
    await controllaAggiornaCompito(tx, d)
    const [k] = await tx<(Omit<CampiCompito, 'scadenza'> & { scadenza: Date | null; stato: string })[]>`
      select titolo, descrizione, cliente_id, scadenza, scadenza_con_orario, priorita, stato
      from public.compiti where id = ${d.compito_id}`
    if (d.rimanda_indietro && k.stato !== 'pronto_revisione') {
      throw new ErroreApi(409, 'conflitto',
        `Si può rimandare indietro solo un compito pronto per revisione (questo è "${ETICHETTE_STATO[k.stato] ?? k.stato}").`)
    }
    const prima: CampiCompito = {
      titolo: k.titolo, descrizione: k.descrizione, cliente_id: k.cliente_id, scadenza: iso(k.scadenza),
      scadenza_con_orario: k.scadenza_con_orario, priorita: k.priorita,
    }
    const registro: VoceRegistro[] = []
    const cambi: string[] = []

    // 1. campi del compito (modifica_compito: admin o chi l'ha creato)
    const nuovi: CampiCompito = { ...prima }
    if (d.titolo !== undefined) nuovi.titolo = d.titolo
    if (d.descrizione !== undefined) nuovi.descrizione = d.descrizione
    if (d.cliente_id !== undefined) nuovi.cliente_id = d.cliente_id
    if (d.priorita !== undefined) nuovi.priorita = d.priorita
    if (d.scadenza !== undefined) {
      const s = leggiScadenza(d.scadenza)
      nuovi.scadenza = iso(s.istante)
      nuovi.scadenza_con_orario = s.conOrario
    }
    const cambiati = (Object.keys(nuovi) as (keyof CampiCompito)[]).filter((f) => nuovi[f] !== prima[f])
    const campiPrima: Record<string, unknown> = {}
    const campiDopo: Record<string, unknown> = {}
    if (cambiati.length) {
      await tx`select public.modifica_compito(${d.compito_id}, ${nuovi.titolo}, ${nuovi.descrizione}, ${nuovi.cliente_id},
        ${nuovi.scadenza}::timestamptz, ${nuovi.scadenza_con_orario}, ${nuovi.priorita})`
      for (const f of cambiati) {
        campiPrima[f] = prima[f]
        campiDopo[f] = nuovi[f]
      }
      cambi.push(...cambiati)
    }

    // 2. assegnatari (riassegna_compito: admin o chi l'ha creato)
    if (d.assegnatari) {
      const attuali = (await tx<{ utente_id: string }[]>`
        select utente_id from public.compiti_assegnatari where compito_id = ${d.compito_id}`).map((r) => r.utente_id).sort()
      const richiesti = [...new Set(d.assegnatari)].sort()
      if (attuali.join() !== richiesti.join()) {
        await tx`select public.riassegna_compito(${d.compito_id}, ${richiesti}::uuid[])`
        campiPrima.assegnatari = attuali
        campiDopo.assegnatari = richiesti
        cambi.push('assegnatari')
      }
    }
    if (Object.keys(campiDopo).length) {
      registro.push({
        azione: 'compito_modificato', entita: 'compito', entita_id: d.compito_id,
        dettagli: { titolo: prima.titolo, prima: campiPrima, dopo: campiDopo }, annullabile: true,
      })
    }

    // 3. stato (cambia_stato_compito o rimanda_indietro_compito, con le regole del flusso)
    const statoFinale = d.rimanda_indietro ? 'in_lavorazione' : d.stato
    if (statoFinale && statoFinale !== k.stato) {
      if (d.rimanda_indietro) {
        await tx`select public.rimanda_indietro_compito(${d.compito_id}, ${d.motivo ?? null})`
      } else {
        try {
          await tx`select public.cambia_stato_compito(${d.compito_id}, ${statoFinale}, ${d.motivo ?? null})`
        } catch (e) {
          // "Passaggio di stato non consentito": è un conflitto con lo stato attuale, non un dato sbagliato
          if ((e as { code?: string }).code === '22023') {
            throw new ErroreApi(409, 'conflitto', `${(e as Error).message}: il compito è "${ETICHETTE_STATO[k.stato] ?? k.stato}" ` +
              `e non può passare a "${ETICHETTE_STATO[statoFinale]}". Un compito chiuso si riapre con stato "in_lavorazione".`)
          }
          throw e
        }
      }
      registro.push({
        azione: 'compito_stato_cambiato', entita: 'compito', entita_id: d.compito_id,
        dettagli: { titolo: nuovi.titolo, prima: k.stato, dopo: statoFinale, motivo: d.motivo ?? null, rimandato: !!d.rimanda_indietro },
        annullabile: true,
      })
      cambi.push('stato')
    }

    return {
      risultato: await compitoCompleto(tx, d.compito_id, c),
      stato: 200,
      descrizione: cambi.length ? `Compito «${nuovi.titolo}» aggiornato (${cambi.join(', ')})` : `Compito «${nuovi.titolo}»: nessuna modifica`,
      registro,
    }
  },
}

// ---------------------------------------------------------------------------
// Indicatore IVA / prima nota
// ---------------------------------------------------------------------------
type ValoreIndicatore = { aggiornato_fino_al: string | null; non_applicabile: boolean }

async function valoreIndicatore(tx: Tx, cliente: string, tipo: string): Promise<ValoreIndicatore | null> {
  const [r] = await tx<ValoreIndicatore[]>`
    select aggiornato_fino_al, non_applicabile from public.aggiornamenti_contabili where cliente_id = ${cliente} and tipo = ${tipo}`
  return r ? { aggiornato_fino_al: r.aggiornato_fino_al, non_applicabile: r.non_applicabile } : null
}

const NOMI_INDICATORE = { iva: 'IVA', prima_nota: 'prima nota' } as const

const aggiornaIndicatore: OperazioneScrittura<typeof inputIndicatore> = {
  schema: inputIndicatore,
  controlla: (tx, d: InputIndicatore) => controllaCliente(tx, d.cliente_id),
  async esegui(tx, c, d: InputIndicatore) {
    await controllaCliente(tx, d.cliente_id)
    const prima = await valoreIndicatore(tx, d.cliente_id, d.tipo)
    // come nell'interfaccia: "non applicabile" non conserva la data
    const data = d.non_applicabile ? null : d.aggiornato_fino_al
    await tx`select public.imposta_indicatore(${d.cliente_id}, ${d.tipo}, ${data}::date, ${d.non_applicabile})`
    const dopo = (await valoreIndicatore(tx, d.cliente_id, d.tipo))!
    const cliente = await nomeCliente(tx, d.cliente_id)
    const soglia = d.tipo === 'iva' ? c.studio.soglia_ritardo_iva_mesi : c.studio.soglia_ritardo_prima_nota_mesi
    const cambiato = prima?.aggiornato_fino_al !== dopo.aggiornato_fino_al || prima?.non_applicabile !== dopo.non_applicabile
    return {
      risultato: {
        cliente_id: d.cliente_id,
        cliente,
        tipo: d.tipo,
        prima: prima ? indicatore(prima, soglia) : null,
        dopo: indicatore(dopo, soglia),
        modificato: cambiato,
      },
      stato: 200,
      descrizione: `${NOMI_INDICATORE[d.tipo]} di «${cliente}»: ${dopo.non_applicabile ? 'non applicabile' : dopo.aggiornato_fino_al ? descriviAggiornamento(dopo.aggiornato_fino_al) : 'da impostare'}`,
      registro: [{
        azione: 'indicatore_aggiornato', entita: 'cliente', entita_id: d.cliente_id,
        dettagli: { cliente, tipo: d.tipo, prima, dopo }, annullabile: cambiato,
      }],
    }
  },
}

// ---------------------------------------------------------------------------
// Commento
// ---------------------------------------------------------------------------
const commenta: OperazioneScrittura<typeof inputCommento> = {
  schema: inputCommento,
  controlla: async (tx, d: InputCommento) => {
    await richiediCompito(tx, d.compito_id)
  },
  async esegui(tx, _c, d: InputCommento) {
    const compito = await richiediCompito(tx, d.compito_id)
    const [r] = await tx<{ id: string }[]>`select public.aggiungi_commento(${d.compito_id}, ${d.testo}) as id`
    const [x] = await tx<{ id: string; testo: string; creato_il: Date; autore_id: string; nome: string; cognome: string; ruolo: string }[]>`
      select k.id, k.testo, k.creato_il, u.id as autore_id, u.nome, u.cognome, u.ruolo
      from public.compiti_commenti k join public.utenti u on u.id = k.autore_id where k.id = ${r.id}`
    return {
      risultato: {
        id: x.id, compito_id: d.compito_id, testo: x.testo, creato_il: iso(x.creato_il),
        autore: { id: x.autore_id, nome: `${x.nome} ${x.cognome}`.trim(), ruolo: x.ruolo },
      },
      stato: 201,
      posizione: `/api/v1/compiti/${d.compito_id}/commenti`,
      descrizione: `Commento aggiunto a «${compito.titolo}»`,
      registro: [{
        azione: 'commento_aggiunto', entita: 'compito', entita_id: d.compito_id,
        dettagli: { titolo: compito.titolo, commento_id: r.id, estratto: d.testo.slice(0, 300) }, annullabile: false,
      }],
    }
  },
}

/** Registro delle operazioni di scrittura: le usano le rotte, l'approvazione delle proposte e un futuro server MCP. */
export const OPERAZIONI: Record<AzioneProposta, OperazioneScrittura> = {
  crea_compito: creaCompito as OperazioneScrittura,
  modifica_compito: aggiornaCompito as OperazioneScrittura,
  cambia_stato_compito: aggiornaCompito as OperazioneScrittura,
  aggiorna_indicatore: aggiornaIndicatore as OperazioneScrittura,
  commenta: commenta as OperazioneScrittura,
}

const MESSAGGIO_PROPOSTA = 'Proposta messa in coda: la eseguirà un admin dello studio approvandola in Studio → Agenti AI e API. ' +
  'Puoi controllarne lo stato con GET /api/v1/proposte/{id}.'

/**
 * Esegue una scrittura per il chiamante. Per gli agenti decide in base ai permessi configurati
 * dall'admin (e solo da lì, sezione 13.5): 403 se l'azione non è abilitata, 202 con la proposta
 * in coda se è abilitata "solo proposta", altrimenti esegue e traccia nel registro.
 */
export async function eseguiScrittura(chiamante: Chiamante, azione: AzioneProposta, input: unknown): Promise<Esito> {
  const op = OPERAZIONI[azione]
  if (chiamante.tipo === 'agente') {
    const permesso = AZIONI_PROPOSTA[azione]
    const liv = livello(chiamante.utente.permessi_agente, permesso)
    if (liv === 'no') {
      const cosa = DESCRIZIONI_AZIONI[permesso].infinito
      throw permessoNegato(`L'account agente non è abilitato ${/^a/i.test(cosa) ? 'ad' : 'a'} ${cosa}. ` +
        'Un admin può abilitarlo (anche solo in modalità proposta) da Studio → Agenti AI e API.')
    }
    if (liv === 'proposta') {
      const id = await conUtente(chiamante.persona, async (tx) => {
        await op.controlla(tx, input)
        const [r] = await tx<{ id: string }[]>`
          select public.crea_proposta_agente(${azione}, ${tx.json(input as postgres.JSONValue)}) as id`
        return r.id
      })
      return risposta({ proposta_id: id, stato: 'in_attesa', azione, messaggio: MESSAGGIO_PROPOSTA }, 202,
        { Location: `/api/v1/proposte/${id}` })
    }
    const e = await conUtente(chiamante.persona, async (tx) => {
      const e = await op.esegui(tx, chiamante, input)
      for (const v of e.registro) {
        const dettagli = { ...v.dettagli, via: 'api', token: chiamante.token?.prefisso ?? null }
        await tx`select public.registra_attivita(${v.azione}, ${v.entita}, ${v.entita_id},
          ${tx.json(dettagli as postgres.JSONValue)}, ${v.annullabile})`
      }
      return e
    }, { origine: 'agente' })
    return risposta(e.risultato, e.stato, e.posizione ? { Location: e.posizione } : undefined)
  }
  const e = await conUtente(chiamante.persona, (tx) => op.esegui(tx, chiamante, input))
  return risposta(e.risultato, e.stato, e.posizione ? { Location: e.posizione } : undefined)
}
