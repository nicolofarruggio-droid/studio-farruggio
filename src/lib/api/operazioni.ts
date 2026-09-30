import 'server-only'
import type { z } from 'zod'
import { conUtente, type Tx } from '@/lib/db'
import { COLONNE_ORDINABILI, colleghi, elencoClienti } from '@/lib/dati/clienti'
import { elencoCompiti } from '@/lib/dati/compiti'
import type { Chiamante } from './autenticazione'
import { nonTrovato } from './errori'
import { clienteInElenco, compitoInElenco, indicatore, iso, nomeDi, pagina } from './formato'
import { limitiDaAmbiente } from './limiti'
import { livello, tuttiIPermessi } from './permessi-agente'
import { ORDINAMENTI_CLIENTI, type queryClienti, type queryCollaboratori, type queryCompiti, type queryProposte } from './schemi'

// Operazioni di lettura dell'API. Ognuna riceve il chiamante già autenticato e gira con
// conUtente(persona): i dati che tornano sono esattamente quelli che RLS gli lascia vedere.

// Le chiavi di ordinamento dello schema devono essere quelle di elencoClienti (controllo in compilazione).
type Uguali<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _ordinamentiAllineati: Uguali<(typeof ORDINAMENTI_CLIENTI)[number], keyof typeof COLONNE_ORDINABILI> = true
void _ordinamentiAllineati

type Persona = { id: string; nome: string; ruolo: string }

/** Nomi e ruoli di più utenti dello studio in una sola query. */
async function persone(tx: Tx, ids: (string | null | undefined)[]): Promise<Map<string, Persona>> {
  const unici = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unici.length) return new Map()
  const righe = await tx<{ id: string; nome: string; cognome: string; ruolo: string }[]>`
    select id, nome, cognome, ruolo from public.utenti where id = any(${unici}::uuid[])`
  return new Map(righe.map((u) => [u.id, { id: u.id, nome: nomeDi(u), ruolo: u.ruolo }]))
}

const chi = (m: Map<string, Persona>, id: string | null | undefined) => (id ? (m.get(id) ?? { id, nome: 'Utente non più visibile', ruolo: 'sconosciuto' }) : null)

// ---------------------------------------------------------------------------
// Chi sono
// ---------------------------------------------------------------------------
export function leggiMe(c: Chiamante) {
  const base = {
    tipo: c.tipo,
    utente: { id: c.utente.id, nome: c.utente.nome, cognome: c.utente.cognome, ruolo: c.utente.ruolo, email: c.tipo === 'persona' ? c.utente.email : null },
    studio: {
      id: c.studio.id,
      nome: c.studio.nome,
      visibilita: c.studio.visibilita,
      creazione_compiti: c.studio.creazione_compiti,
      soglia_ritardo_iva_mesi: c.studio.soglia_ritardo_iva_mesi,
      soglia_ritardo_prima_nota_mesi: c.studio.soglia_ritardo_prima_nota_mesi,
    },
  }
  if (c.tipo !== 'agente' || !c.token) return base
  const limiti = limitiDaAmbiente()
  return {
    ...base,
    permessi: tuttiIPermessi(c.utente.permessi_agente),
    token: { nome: c.token.nome, prefisso: c.token.prefisso, scade_il: iso(c.token.scade_il) },
    limiti: { letture_al_minuto: limiti.letture, scritture_al_minuto: limiti.scritture },
  }
}

// ---------------------------------------------------------------------------
// Collaboratori
// ---------------------------------------------------------------------------
export async function elencaCollaboratori(c: Chiamante, q: z.infer<typeof queryCollaboratori>) {
  const righe = await conUtente(c.persona, (tx) => colleghi(tx, q.includi_disattivati !== 'true'))
  return { dati: righe.map((u) => ({ id: u.id, nome: u.nome, cognome: u.cognome, ruolo: u.ruolo, attivo: u.attivo })) }
}

// ---------------------------------------------------------------------------
// Clienti
// ---------------------------------------------------------------------------
export async function elencaClienti(c: Chiamante, q: z.infer<typeof queryClienti>) {
  const righe = await conUtente(c.persona, (tx) => elencoClienti(tx, {
    q: q.q, collaboratore: q.collaboratore, ritardo: q.ritardo, stato: q.stato, ordina: q.ordina, verso: q.verso,
  }))
  return pagina(righe.map((r) => clienteInElenco(r, c.studio)), q)
}

export async function leggiCliente(c: Chiamante, id: string) {
  return conUtente(c.persona, async (tx) => {
    const [k] = await tx<{
      id: string; ragione_sociale: string; nome_visualizzazione: string; telefono: string | null; codice_fiscale: string | null
      partita_iva: string | null; numero_dipendenti: number | null; fatturato: string | null; note: string | null
      stato: string; alias: string[]; creato_il: Date; aggiornato_il: Date; puo_lavorare: boolean; puo_aggiornare_indicatori: boolean
    }[]>`
      select c.id, c.ragione_sociale, c.nome_visualizzazione, c.telefono, c.codice_fiscale, c.partita_iva, c.numero_dipendenti,
        c.fatturato::text as fatturato, c.note, c.stato, c.alias, c.creato_il, c.aggiornato_il,
        public.puo_lavorare_cliente(c.id) as puo_lavorare, public.puo_aggiornare_indicatori(c.id) as puo_aggiornare_indicatori
      from public.clienti c where c.id = ${id} and public.puo_vedere_cliente(c.id)`
    if (!k) throw nonTrovato('Cliente non trovato')

    const [titolari, email, indicatori, storico, collaboratori, compiti] = await Promise.all([
      tx<{ nome: string; cognome: string; principale: boolean }[]>`
        select nome, cognome, principale from public.clienti_titolari where cliente_id = ${id} order by principale desc, ordine`,
      tx<{ indirizzo: string; tipo: string }[]>`
        select indirizzo, tipo from public.clienti_email where cliente_id = ${id} order by tipo, indirizzo`,
      tx<{ tipo: 'iva' | 'prima_nota'; aggiornato_fino_al: string | null; non_applicabile: boolean; aggiornato_il: Date; aggiornato_da: string | null }[]>`
        select tipo, aggiornato_fino_al, non_applicabile, aggiornato_il, aggiornato_da
        from public.aggiornamenti_contabili where cliente_id = ${id}`,
      tx<{ id: string; tipo: string; valore_precedente: string | null; valore_nuovo: string | null; na_precedente: boolean | null
           na_nuovo: boolean | null; origine: string; modificato_da: string | null; modificato_il: Date }[]>`
        select id, tipo, valore_precedente, valore_nuovo, na_precedente, na_nuovo, origine, modificato_da, modificato_il
        from public.aggiornamenti_storico where cliente_id = ${id} order by modificato_il desc limit 30`,
      tx<{ id: string; nome: string; cognome: string; referente_principale: boolean; dal: Date }[]>`
        select u.id, u.nome, u.cognome, a.referente_principale, a.dal
        from public.assegnazioni a join public.utenti u on u.id = a.utente_id
        where a.cliente_id = ${id} and a.al is null order by a.referente_principale desc, a.dal`,
      elencoCompiti(tx, { cliente: id, stato: 'tutti' }, 100),
    ])
    const nomi = await persone(tx, [...indicatori.map((i) => i.aggiornato_da), ...storico.map((s) => s.modificato_da)])
    const ind = (tipo: 'iva' | 'prima_nota', soglia: number) => {
      const r = indicatori.find((i) => i.tipo === tipo)
      return { ...indicatore(r, soglia), aggiornato_il: iso(r?.aggiornato_il), aggiornato_da: chi(nomi, r?.aggiornato_da) }
    }
    return {
      id: k.id,
      ragione_sociale: k.ragione_sociale,
      nome_visualizzazione: k.nome_visualizzazione,
      stato: k.stato,
      telefono: k.telefono,
      codice_fiscale: k.codice_fiscale,
      partita_iva: k.partita_iva,
      numero_dipendenti: k.numero_dipendenti,
      fatturato: k.fatturato === null ? null : Number(k.fatturato),
      note: k.note,
      alias: k.alias,
      creato_il: iso(k.creato_il),
      aggiornato_il: iso(k.aggiornato_il),
      titolari,
      email,
      indicatori: {
        iva: ind('iva', c.studio.soglia_ritardo_iva_mesi),
        prima_nota: ind('prima_nota', c.studio.soglia_ritardo_prima_nota_mesi),
      },
      storico_indicatori: storico.map((s) => ({
        tipo: s.tipo,
        valore_precedente: s.valore_precedente,
        valore_nuovo: s.valore_nuovo,
        non_applicabile_prima: s.na_precedente,
        non_applicabile_dopo: s.na_nuovo,
        origine: s.origine,
        modificato_da: chi(nomi, s.modificato_da),
        modificato_il: iso(s.modificato_il),
      })),
      collaboratori: collaboratori.map((u) => ({ id: u.id, nome: nomeDi(u), referente_principale: u.referente_principale, dal: iso(u.dal) })),
      compiti: compiti.map(compitoInElenco),
      permessi: { lavorare: k.puo_lavorare, aggiornare_indicatori: k.puo_aggiornare_indicatori },
      url: `/clienti/${k.id}`,
    }
  })
}

// ---------------------------------------------------------------------------
// Compiti
// ---------------------------------------------------------------------------
export async function elencaCompiti(c: Chiamante, q: z.infer<typeof queryCompiti>) {
  const righe = await conUtente(c.persona, (tx) => elencoCompiti(tx, {
    q: q.q, collaboratore: q.collaboratore, cliente: q.cliente, stato: q.stato, priorita: q.priorita,
    scadenza: q.scadenza, creatiDa: q.creati_da, assegnatiA: q.assegnati_a,
  }, q.pagina * q.limite + 1))
  return pagina(righe.map(compitoInElenco), q, false)
}

type RigaCompitoDettaglio = {
  id: string; titolo: string; descrizione: string; stato: string; priorita: string; scadenza: Date | null
  scadenza_con_orario: boolean; cliente_id: string | null; cliente: string | null; creato_da: string | null
  completato_il: Date | null; completato_da: string | null; annullato_il: Date | null; motivo_annullamento: string | null
  rimandato_motivo: string | null; rimandato_da: string | null; rimandato_il: Date | null; creato_il: Date; aggiornato_il: Date
  puo_lavorare: boolean; puo_controllare: boolean; puo_commentare: boolean
}

/**
 * Scheda completa di un compito, dentro una transazione già aperta (serve anche dopo le scritture).
 * I permessi dicono cosa il chiamante può fare subito; per un agente contano anche i suoi permessi.
 */
export async function compitoCompleto(tx: Tx, id: string, chiamante?: Chiamante) {
  const [k] = await tx<RigaCompitoDettaglio[]>`
    select k.id, k.titolo, k.descrizione, k.stato, k.priorita, k.scadenza, k.scadenza_con_orario, k.cliente_id,
      c.nome_visualizzazione as cliente, k.creato_da, k.completato_il, k.completato_da, k.annullato_il, k.motivo_annullamento,
      k.rimandato_motivo, k.rimandato_da, k.rimandato_il, k.creato_il, k.aggiornato_il,
      public.puo_lavorare_compito(k.id) as puo_lavorare, public.puo_controllare_compito(k.id) as puo_controllare,
      public.puo_commentare_compito(k.id) as puo_commentare
    from public.compiti k left join public.clienti c on c.id = k.cliente_id
    where k.id = ${id}`
  if (!k) throw nonTrovato('Compito non trovato')
  const [assegnatari, commenti, documenti, eventi] = await Promise.all([
    tx<{ utente_id: string }[]>`select utente_id from public.compiti_assegnatari where compito_id = ${id}`,
    tx<{ id: string; autore_id: string | null; testo: string; creato_il: Date }[]>`
      select id, autore_id, testo, creato_il from public.compiti_commenti where compito_id = ${id} order by creato_il`,
    tx<{ id: string; nome_file: string; tipo: string; dimensione: string; caricato_da: string | null; caricato_il: Date }[]>`
      select id, nome_file, tipo, dimensione::text as dimensione, caricato_da, caricato_il
      from public.compiti_documenti where compito_id = ${id} order by caricato_il`,
    tx<{ id: string; tipo: string; dati: Record<string, unknown>; autore_id: string | null; creato_il: Date }[]>`
      select id, tipo, dati, autore_id, creato_il from public.compiti_eventi where compito_id = ${id} order by creato_il`,
  ])
  const nomi = await persone(tx, [
    k.creato_da, k.completato_da, k.rimandato_da, ...assegnatari.map((a) => a.utente_id),
    ...commenti.map((x) => x.autore_id), ...documenti.map((x) => x.caricato_da), ...eventi.map((x) => x.autore_id),
  ])
  return {
    id: k.id,
    titolo: k.titolo,
    descrizione: k.descrizione,
    stato: k.stato,
    priorita: k.priorita,
    scadenza: iso(k.scadenza),
    scadenza_con_orario: k.scadenza_con_orario,
    cliente: k.cliente_id ? { id: k.cliente_id, nome: k.cliente } : null,
    creato_da: chi(nomi, k.creato_da),
    assegnatari: assegnatari.map((a) => chi(nomi, a.utente_id)!).sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
    completato_il: iso(k.completato_il),
    completato_da: chi(nomi, k.completato_da),
    annullato_il: iso(k.annullato_il),
    motivo_annullamento: k.motivo_annullamento,
    rimandato: k.rimandato_il ? { motivo: k.rimandato_motivo, da: chi(nomi, k.rimandato_da), il: iso(k.rimandato_il) } : null,
    creato_il: iso(k.creato_il),
    aggiornato_il: iso(k.aggiornato_il),
    permessi: permessiCompito(k, chiamante),
    commenti: commenti.map((x) => ({ id: x.id, autore: chi(nomi, x.autore_id), testo: x.testo, creato_il: iso(x.creato_il) })),
    documenti: documenti.map((d) => ({
      id: d.id, nome_file: d.nome_file, tipo: d.tipo, dimensione: Number(d.dimensione),
      caricato_da: chi(nomi, d.caricato_da), caricato_il: iso(d.caricato_il),
    })),
    cronologia: eventi.map((e) => ({ id: e.id, tipo: e.tipo, dati: e.dati, autore: chi(nomi, e.autore_id), creato_il: iso(e.creato_il) })),
    url: `/compiti/${k.id}`,
  }
}

function permessiCompito(k: { puo_lavorare: boolean; puo_controllare: boolean; puo_commentare: boolean }, c?: Chiamante) {
  if (c?.tipo !== 'agente') return { lavorare: k.puo_lavorare, controllare: k.puo_controllare, commentare: k.puo_commentare }
  const aggiorna = livello(c.utente.permessi_agente, 'aggiorna_compiti') === 'si'
  return {
    lavorare: k.puo_lavorare && aggiorna,
    controllare: k.puo_controllare && aggiorna,
    commentare: k.puo_commentare && livello(c.utente.permessi_agente, 'commenta') === 'si',
  }
}

export async function leggiCompito(c: Chiamante, id: string) {
  return conUtente(c.persona, (tx) => compitoCompleto(tx, id, c))
}

/** Il compito esiste ed è visibile al chiamante? (404 altrimenti) */
export async function richiediCompito(tx: Tx, id: string): Promise<{ id: string; titolo: string; stato: string }> {
  const [k] = await tx<{ id: string; titolo: string; stato: string }[]>`select id, titolo, stato from public.compiti where id = ${id}`
  if (!k) throw nonTrovato('Compito non trovato')
  return k
}

export async function elencaCommenti(c: Chiamante, id: string) {
  return conUtente(c.persona, async (tx) => {
    await richiediCompito(tx, id)
    const righe = await tx<{ id: string; autore_id: string | null; testo: string; creato_il: Date }[]>`
      select id, autore_id, testo, creato_il from public.compiti_commenti where compito_id = ${id} order by creato_il`
    const nomi = await persone(tx, righe.map((r) => r.autore_id))
    return { dati: righe.map((x) => ({ id: x.id, autore: chi(nomi, x.autore_id), testo: x.testo, creato_il: iso(x.creato_il) })) }
  })
}

// ---------------------------------------------------------------------------
// Proposte (l'agente vede le sue, l'admin tutte quelle dello studio)
// ---------------------------------------------------------------------------
type RigaProposta = {
  id: string; agente_id: string; azione: string; dati: Record<string, unknown>; stato: string
  creata_il: Date; decisa_da: string | null; decisa_il: Date | null; esito: string | null
}

async function formatoProposte(tx: Tx, righe: RigaProposta[]) {
  const nomi = await persone(tx, [...righe.map((r) => r.agente_id), ...righe.map((r) => r.decisa_da)])
  return righe.map((p) => ({
    id: p.id,
    azione: p.azione,
    dati: p.dati,
    stato: p.stato,
    agente: chi(nomi, p.agente_id),
    creata_il: iso(p.creata_il),
    decisa_da: chi(nomi, p.decisa_da),
    decisa_il: iso(p.decisa_il),
    esito: p.esito,
  }))
}

export async function elencaProposte(c: Chiamante, q: z.infer<typeof queryProposte>) {
  return conUtente(c.persona, async (tx) => {
    const stato = !q.stato || q.stato === 'tutte' ? null : q.stato
    const righe = await tx<RigaProposta[]>`
      select id, agente_id, azione, dati, stato, creata_il, decisa_da, decisa_il, esito from public.proposte_agente
      where (${stato}::text is null or stato = ${stato})
      order by creata_il desc
      limit ${q.pagina * q.limite + 1}`
    return pagina(await formatoProposte(tx, righe), q, false)
  })
}

export async function leggiProposta(c: Chiamante, id: string) {
  return conUtente(c.persona, async (tx) => {
    const righe = await tx<RigaProposta[]>`
      select id, agente_id, azione, dati, stato, creata_il, decisa_da, decisa_il, esito from public.proposte_agente where id = ${id}`
    if (!righe.length) throw nonTrovato('Proposta non trovata', true)
    return (await formatoProposte(tx, righe))[0]
  })
}
