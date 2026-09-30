import 'server-only'
import type { Tx } from '@/lib/db'
import type { CreazioneCompiti, Ruolo } from '@/lib/auth/sessione'
import type { Priorita, StatoCompito } from '@/lib/dati/compiti'

// Letture per la scheda compito, il modulo "Nuovo compito" e i filtri dell'elenco (sezioni 8 e 9).
// Tutte girano dentro conUtente: le righe le filtra RLS, i permessi li calcolano le funzioni SQL.

export type Persona = { id: string; nome: string; ruolo: Ruolo }

export type SchedaCompito = {
  id: string
  titolo: string
  descrizione: string
  stato: StatoCompito
  priorita: Priorita
  scadenza: Date | null
  scadenza_con_orario: boolean
  cliente_id: string | null
  cliente: string | null
  cliente_visibile: boolean
  creato_da: string | null
  creato_da_nome: string | null
  creato_da_agente: boolean
  creato_il: Date
  aggiornato_il: Date
  completato_il: Date | null
  completato_da_nome: string | null
  annullato_il: Date | null
  motivo_annullamento: string | null
  rimandato_motivo: string | null
  rimandato_da_nome: string | null
  rimandato_il: Date | null
  assegnatari: Persona[]
  sono_assegnatario: boolean
  puo_lavorare: boolean
  puo_controllare: boolean
  puo_commentare: boolean
  puo_caricare: boolean
}

export async function leggiCompito(tx: Tx, id: string): Promise<SchedaCompito | null> {
  const [k] = await tx<SchedaCompito[]>`
    select k.id, k.titolo, k.descrizione, k.stato, k.priorita, k.scadenza, k.scadenza_con_orario, k.cliente_id,
      c.nome_visualizzazione as cliente, coalesce(k.cliente_id is not null and public.puo_vedere_cliente(k.cliente_id), false) as cliente_visibile,
      k.creato_da, trim(cr.nome || ' ' || cr.cognome) as creato_da_nome, coalesce(cr.ruolo = 'agente', false) as creato_da_agente,
      k.creato_il, k.aggiornato_il, k.completato_il, trim(cd.nome || ' ' || cd.cognome) as completato_da_nome,
      k.annullato_il, k.motivo_annullamento, k.rimandato_motivo, trim(rd.nome || ' ' || rd.cognome) as rimandato_da_nome, k.rimandato_il,
      coalesce((select json_agg(json_build_object('id', u.id, 'nome', trim(u.nome || ' ' || u.cognome), 'ruolo', u.ruolo)
                                order by u.cognome, u.nome)
                from public.compiti_assegnatari a join public.utenti u on u.id = a.utente_id where a.compito_id = k.id), '[]') as assegnatari,
      exists (select 1 from public.compiti_assegnatari a where a.compito_id = k.id and a.utente_id = auth.uid()) as sono_assegnatario,
      public.puo_lavorare_compito(k.id) as puo_lavorare,
      public.puo_controllare_compito(k.id) as puo_controllare,
      public.puo_commentare_compito(k.id) as puo_commentare,
      ((public.puo_lavorare_compito(k.id) or public.puo_controllare_compito(k.id))
        and not (public.e_agente() and not public.agente_puo('carica_documenti'))) as puo_caricare
    from public.compiti k
    left join public.clienti c on c.id = k.cliente_id
    left join public.utenti cr on cr.id = k.creato_da
    left join public.utenti cd on cd.id = k.completato_da
    left join public.utenti rd on rd.id = k.rimandato_da
    where k.id = ${id}`
  return k ?? null
}

export type Documento = {
  id: string
  nome_file: string
  tipo: string
  dimensione: number
  caricato_il: Date
  caricato_da_nome: string | null
  caricato_da_agente: boolean
}

export async function documentiCompito(tx: Tx, compito: string): Promise<Documento[]> {
  return tx<Documento[]>`
    select d.id, d.nome_file, d.tipo, d.dimensione::float8 as dimensione, d.caricato_il,
      trim(u.nome || ' ' || u.cognome) as caricato_da_nome, coalesce(u.ruolo = 'agente', false) as caricato_da_agente
    from public.compiti_documenti d left join public.utenti u on u.id = d.caricato_da
    where d.compito_id = ${compito}
    order by d.caricato_il, d.nome_file`
}

export type Commento = { id: string; testo: string; creato_il: Date; autore_id: string | null; autore: string | null; autore_agente: boolean }

export async function commentiCompito(tx: Tx, compito: string): Promise<Commento[]> {
  return tx<Commento[]>`
    select m.id, m.testo, m.creato_il, m.autore_id, trim(u.nome || ' ' || u.cognome) as autore, coalesce(u.ruolo = 'agente', false) as autore_agente
    from public.compiti_commenti m left join public.utenti u on u.id = m.autore_id
    where m.compito_id = ${compito}
    order by m.creato_il, m.id`
}

export type Evento = {
  id: string
  tipo: string
  dati: Record<string, unknown>
  creato_il: Date
  autore: string | null
  autore_agente: boolean
}

export async function eventiCompito(tx: Tx, compito: string): Promise<Evento[]> {
  return tx<Evento[]>`
    select e.id, e.tipo, e.dati, e.creato_il, trim(u.nome || ' ' || u.cognome) as autore, coalesce(u.ruolo = 'agente', false) as autore_agente
    from public.compiti_eventi e left join public.utenti u on u.id = e.autore_id
    where e.compito_id = ${compito}
    -- eventi della stessa transazione hanno la stessa ora: ordine logico, poi per nome del file
    order by e.creato_il,
      array_position(array['creato', 'modificato', 'assegnatari', 'stato', 'rimandato', 'riaperto', 'annullato', 'documento', 'commento'], e.tipo),
      e.dati ->> 'nome_file', e.id`
}

/** Nomi di persone e clienti citati nella cronologia (solo quelli che l'utente può vedere). */
export async function nomiPerCronologia(tx: Tx, clienti: string[]) {
  const [persone, righeClienti] = await Promise.all([
    tx<{ id: string; nome: string }[]>`select id, trim(nome || ' ' || cognome) as nome from public.utenti`,
    clienti.length
      ? tx<{ id: string; nome: string }[]>`select id, nome_visualizzazione as nome from public.clienti where id = any(${clienti}::uuid[])`
      : Promise.resolve([]),
  ])
  return {
    persone: Object.fromEntries(persone.map((p) => [p.id, p.nome])) as Record<string, string>,
    clienti: Object.fromEntries(righeClienti.map((c) => [c.id, c.nome])) as Record<string, string>,
  }
}

/** Persone a cui l'utente può assegnare un compito, secondo "Chi può creare compiti" (puo_creare_compito_per). */
export async function personeAssegnabili(tx: Tx): Promise<Persona[]> {
  return tx<Persona[]>`
    select u.id, trim(u.nome || ' ' || u.cognome) as nome, u.ruolo
    from public.utenti u
    where u.attivo and u.ruolo in ('admin', 'collaboratore') and public.puo_creare_compito_per(u.id)
    order by u.ruolo = 'admin', lower(u.cognome), lower(u.nome)`
}

export type ClienteSelezionabile = {
  id: string
  nome: string
  ragione_sociale: string
  titolari: string
  referente_id: string | null
  referente: string | null
}

/** Clienti che chi crea il compito può vedere per intero (puo_vedere_cliente), con titolari e referente. */
export async function clientiSelezionabili(tx: Tx, includi: string | null = null): Promise<ClienteSelezionabile[]> {
  return tx<ClienteSelezionabile[]>`
    select c.id, c.nome_visualizzazione as nome, c.ragione_sociale,
      coalesce((select string_agg(trim(t.nome || ' ' || t.cognome), ', ' order by t.principale desc, t.ordine)
                from public.clienti_titolari t where t.cliente_id = c.id), '') as titolari,
      r.id as referente_id, r.nome as referente
    from public.clienti c
    left join lateral (
      select u.id, trim(u.nome || ' ' || u.cognome) as nome
      from public.assegnazioni a join public.utenti u on u.id = a.utente_id
      where a.cliente_id = c.id and a.al is null and u.attivo
      order by a.referente_principale desc, a.dal limit 1
    ) r on true
    where (public.puo_vedere_cliente(c.id) and c.stato = 'attivo') or c.id = ${includi}
    order by lower(c.nome_visualizzazione)`
}

/** Chi può creare compiti (sezione 5): admin sempre, collaboratori secondo l'impostazione dello studio. */
export function puoCreareCompiti(ruolo: Ruolo, creazione: CreazioneCompiti): boolean {
  return ruolo === 'admin' || creazione === 'per_se' || creazione === 'tutti'
}

export type OpzioniFiltri = { collaboratori: Persona[]; clienti: { id: string; nome: string }[]; senzaCliente: boolean }

/** Voci dei filtri dell'elenco: solo persone e clienti che compaiono nei compiti visibili (o, per chi vede tutto, i colleghi). */
export async function opzioniFiltri(tx: Tx, tuttiIColleghi: boolean): Promise<OpzioniFiltri> {
  const [collaboratori, clienti, senza] = await Promise.all([
    tuttiIColleghi
      ? tx<Persona[]>`
          select u.id, trim(u.nome || ' ' || u.cognome) as nome, u.ruolo from public.utenti u
          where u.ruolo in ('admin', 'collaboratore')
            and (u.attivo or exists (select 1 from public.compiti_assegnatari a where a.utente_id = u.id))
          order by u.ruolo = 'admin', lower(u.cognome), lower(u.nome)`
      : tx<Persona[]>`
          select distinct u.id, trim(u.nome || ' ' || u.cognome) as nome, u.ruolo, lower(u.cognome), lower(u.nome)
          from public.compiti_assegnatari a join public.utenti u on u.id = a.utente_id
          order by lower(u.cognome), lower(u.nome)`,
    tx<{ id: string; nome: string }[]>`
      select c.id, c.nome_visualizzazione as nome from public.clienti c
      where exists (select 1 from public.compiti k where k.cliente_id = c.id)
      order by lower(c.nome_visualizzazione)`,
    tx<{ n: number }[]>`select count(*)::int as n from public.compiti where cliente_id is null`,
  ])
  return {
    collaboratori: collaboratori.map(({ id, nome, ruolo }) => ({ id, nome, ruolo })),
    clienti,
    senzaCliente: senza[0].n > 0,
  }
}

/** Compiti rimandati indietro e non ancora di nuovo pronti (per evidenziarli negli elenchi). */
export async function compitiRimandati(tx: Tx): Promise<Set<string>> {
  const r = await tx<{ id: string }[]>`select id from public.compiti where rimandato_il is not null and stato = 'in_lavorazione'`
  return new Set(r.map((x) => x.id))
}
