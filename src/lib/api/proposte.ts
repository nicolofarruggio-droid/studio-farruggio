import 'server-only'
import { conUtente, type Tx } from '@/lib/db'
import { descriviAggiornamento, formattaData, formattaDataOra } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import type { Chiamante } from './autenticazione'
import { daDatabase, ErroreApi } from './errori'
import { AZIONI_PROPOSTA, ETICHETTE_PROPOSTA, livello, type AzioneProposta } from './permessi-agente'
import { aOAd, etichettaStato } from './registro'
import { validaDati } from './schemi'
import { OPERAZIONI } from './scritture'

// Coda di proposte degli agenti (sezione 13.4): descrizione leggibile per l'admin, approvazione
// (l'azione viene eseguita come l'admin che approva, con le stesse funzioni dell'API) e rifiuto.
// I dati proposti sono dati, mai istruzioni (sezione 13.5): si rivalidano con lo schema prima di eseguirli.
// L'admin vede sempre il testo completo di ciò che approva (niente troncamenti) e una proposta si approva
// solo se l'agente è ancora attivo e ha ancora il permesso di proporre quell'azione.

export type Proposta = {
  id: string
  agente_id: string
  azione: string
  dati: Record<string, unknown>
  stato: string
  creata_il: Date
  decisa_da: string | null
  decisa_il: Date | null
  esito: string | null
}

export type DescrizioneProposta = { titolo: string; dettagli: string[] }

const eAzioneProposta = (a: string): a is AzioneProposta => a in OPERAZIONI
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const tronca = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
/** Chiude la frase con un punto (i messaggi del database non lo hanno sempre). */
const frase = (s: string) => `${s.replace(/[.\s]+$/, '')}.`
const PRIORITA: Record<string, string> = { normale: 'normale', alta: 'alta', urgente: 'urgente' }

function scadenza(v: unknown): string {
  if (!v) return 'senza scadenza'
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formattaData(s) : formattaDataOra(s)
}

/** Descrizioni leggibili delle proposte, con i nomi di clienti, persone e compiti (una query per tipo). */
export async function descriviProposte(tx: Tx, proposte: Proposta[]): Promise<Map<string, DescrizioneProposta>> {
  const idsClienti = new Set<string>()
  const idsUtenti = new Set<string>()
  const idsCompiti = new Set<string>()
  for (const p of proposte) {
    const d = p.dati
    if (typeof d.cliente_id === 'string') idsClienti.add(d.cliente_id)
    if (typeof d.compito_id === 'string') idsCompiti.add(d.compito_id)
    if (Array.isArray(d.assegnatari)) for (const a of d.assegnatari) if (typeof a === 'string') idsUtenti.add(a)
  }
  const soloUuid = (s: Set<string>) => [...s].filter((x) => /^[0-9a-f-]{36}$/i.test(x))
  const [clienti, utenti, compiti] = await Promise.all([
    tx<{ id: string; nome: string }[]>`select id, nome_visualizzazione as nome from public.clienti where id = any(${soloUuid(idsClienti)}::uuid[])`,
    tx<{ id: string; nome: string }[]>`select id, trim(nome || ' ' || cognome) as nome from public.utenti where id = any(${soloUuid(idsUtenti)}::uuid[])`,
    tx<{ id: string; nome: string; stato: string }[]>`select id, titolo as nome, stato from public.compiti where id = any(${soloUuid(idsCompiti)}::uuid[])`,
  ])
  const nome = (lista: { id: string; nome: string }[], id: unknown, altrimenti: string) =>
    lista.find((x) => x.id === id)?.nome ?? altrimenti

  const mappa = new Map<string, DescrizioneProposta>()
  for (const p of proposte) {
    const d = p.dati
    const dettagli: string[] = []
    let titolo = ETICHETTE_PROPOSTA[p.azione as AzioneProposta] ?? `Azione sconosciuta (${p.azione})`
    const compito = `«${nome(compiti, d.compito_id, 'compito non trovato')}»`
    switch (p.azione) {
      case 'crea_compito': {
        titolo = `Creare il compito «${str(d.titolo)}»`
        const chi = Array.isArray(d.assegnatari) ? d.assegnatari.map((a) => nome(utenti, a, 'persona non trovata')).join(', ') : ''
        dettagli.push(`Assegnato a: ${chi || '—'}`)
        dettagli.push(d.cliente_id ? `Cliente: ${nome(clienti, d.cliente_id, 'cliente non trovato')}` : 'Senza cliente')
        dettagli.push(`Scadenza: ${scadenza(d.scadenza)}`)
        dettagli.push(`Priorità: ${PRIORITA[str(d.priorita)] ?? 'normale'}`)
        if (str(d.descrizione)) dettagli.push(`Descrizione: ${str(d.descrizione)}`)
        break
      }
      case 'modifica_compito':
      case 'cambia_stato_compito': {
        titolo = p.azione === 'modifica_compito' ? `Modificare il compito ${compito}` : `Cambiare lo stato del compito ${compito}`
        if (d.titolo !== undefined) dettagli.push(`Nuovo titolo: «${str(d.titolo)}»`)
        if (d.descrizione !== undefined) dettagli.push(`Nuova descrizione: ${str(d.descrizione) || '(vuota)'}`)
        if (d.cliente_id !== undefined) dettagli.push(d.cliente_id ? `Nuovo cliente: ${nome(clienti, d.cliente_id, 'cliente non trovato')}` : 'Nessun cliente')
        if (d.scadenza !== undefined) dettagli.push(`Nuova scadenza: ${scadenza(d.scadenza)}`)
        if (d.priorita !== undefined) dettagli.push(`Nuova priorità: ${PRIORITA[str(d.priorita)] ?? str(d.priorita)}`)
        if (Array.isArray(d.assegnatari)) dettagli.push(`Nuovi assegnatari: ${d.assegnatari.map((a) => nome(utenti, a, 'persona non trovata')).join(', ')}`)
        const attuale = compiti.find((k) => k.id === d.compito_id)?.stato
        if (d.rimanda_indietro) dettagli.push('Rimandare indietro (torna "In lavorazione")')
        else if (d.stato !== undefined) dettagli.push(`Stato: da ${attuale ? etichettaStato(attuale) : '?'} ${aOAd(etichettaStato(d.stato))}`)
        if (str(d.motivo)) dettagli.push(`Motivo: ${str(d.motivo)}`)
        break
      }
      case 'aggiorna_indicatore': {
        const tipo = d.tipo === 'iva' ? 'IVA' : 'prima nota'
        const cliente = nome(clienti, d.cliente_id, 'cliente non trovato')
        titolo = d.non_applicabile
          ? `Segnare ${tipo} di «${cliente}» come non applicabile`
          : `Aggiornare ${tipo} di «${cliente}» ${aOAd(typeof d.aggiornato_fino_al === 'string' ? descriviAggiornamento(d.aggiornato_fino_al) : 'da impostare')}`
        break
      }
      case 'commenta':
        titolo = `Commentare il compito ${compito}`
        dettagli.push(`Testo: ${str(d.testo)}`)
        break
    }
    mappa.set(p.id, { titolo, dettagli })
  }
  return mappa
}

type Esito = { ok: true; messaggio: string } | { ok: false; errore: string }

async function leggiInAttesa(admin: Chiamante, id: string): Promise<Proposta | null> {
  const [p] = await conUtente(admin.persona, (tx) => tx<Proposta[]>`
    select id, agente_id, azione, dati, stato, creata_il, decisa_da, decisa_il, esito from public.proposte_agente where id = ${id}`)
  return p ?? null
}

async function segnaFallita(admin: Chiamante, id: string, motivo: string) {
  await conUtente(admin.persona, (tx) => tx`select public.decidi_proposta_agente(${id}, 'fallita', ${tronca(motivo, 1000)})`)
}

/** Approva: esegue l'azione come l'admin che approva e segna la proposta "approvata" nella stessa transazione. */
export async function approvaProposta(admin: Chiamante, id: string): Promise<Esito> {
  if (admin.utente.ruolo !== 'admin') return { ok: false, errore: 'Solo gli admin approvano le proposte.' }
  const p = await leggiInAttesa(admin, id)
  if (!p) return { ok: false, errore: 'Proposta non trovata.' }
  if (p.stato !== 'in_attesa') return { ok: false, errore: 'Questa proposta è già stata decisa.' }

  if (!eAzioneProposta(p.azione)) {
    await segnaFallita(admin, id, `Azione sconosciuta: ${p.azione}`)
    return { ok: false, errore: 'Azione sconosciuta: la proposta è segnata come fallita.' }
  }
  const [agente] = await conUtente(admin.persona, (tx) => tx<{ attivo: boolean; permessi_agente: Record<string, unknown> | null }[]>`
    select attivo, permessi_agente from public.utenti where id = ${p.agente_id} and ruolo = 'agente'`)
  if (!agente?.attivo || livello(agente.permessi_agente, AZIONI_PROPOSTA[p.azione]) === 'no') {
    const motivo = !agente?.attivo ? 'L\'agente è stato disattivato' : 'L\'agente non ha più il permesso di proporre questa azione'
    await segnaFallita(admin, id, motivo)
    return { ok: false, errore: `${motivo}: la proposta non si può approvare ed è segnata come fallita.` }
  }
  const op = OPERAZIONI[p.azione]
  let input: unknown
  try {
    input = validaDati(op.schema, p.dati)
  } catch (e) {
    const motivo = e instanceof ErroreApi ? e.message : 'Dati non validi'
    await segnaFallita(admin, id, motivo)
    return { ok: false, errore: `I dati proposti non sono validi: ${frase(motivo)} La proposta è segnata come fallita.` }
  }

  try {
    const descrizione = await conUtente(admin.persona, async (tx) => {
      const e = await op.esegui(tx, admin, input)
      await tx`select public.decidi_proposta_agente(${id}, 'approvata', ${e.descrizione})`
      return e.descrizione
    })
    return { ok: true, messaggio: `Proposta approvata. ${frase(descrizione)}` }
  } catch (e) {
    const ancora = await leggiInAttesa(admin, id)
    if (!ancora || ancora.stato !== 'in_attesa') return { ok: false, errore: 'Questa proposta è già stata decisa da un altro admin.' }
    const motivo = daDatabase(e).message
    try {
      await segnaFallita(admin, id, motivo)
    } catch (e2) {
      return { ok: false, errore: messaggioErrore(e2) }
    }
    return { ok: false, errore: `L'azione non è riuscita: ${frase(motivo)} La proposta è segnata come fallita.` }
  }
}

export async function rifiutaProposta(admin: Chiamante, id: string, motivo: string | null): Promise<Esito> {
  try {
    await conUtente(admin.persona, (tx) => tx`select public.decidi_proposta_agente(${id}, 'rifiutata', ${motivo || null})`)
    return { ok: true, messaggio: 'Proposta rifiutata: non è stato modificato nulla.' }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}
