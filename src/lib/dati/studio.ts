import 'server-only'
import { comeSistema, type Tx } from '@/lib/db'

// Query dell'area "Studio" (solo admin). Girano tutte dentro conUtente: le righe le filtra RLS.

export type PersonaStudio = {
  id: string
  nome: string
  cognome: string
  email: string
  ruolo: 'admin' | 'collaboratore'
  attivo: boolean
  ultimo_accesso: Date | null
  creato_il: Date
  disattivato_il: Date | null
  casella: 'collegata' | 'non_collegata' | 'da_ricollegare'
  clienti_referente: number
  clienti_aggiuntivo: number
  compiti_aperti: number
}

/** Persone dello studio (senza gli account agente), anche disattivate: non si eliminano mai. */
export async function elencoPersone(tx: Tx): Promise<PersonaStudio[]> {
  return tx<PersonaStudio[]>`
    select u.id, u.nome, u.cognome, u.email, u.ruolo, u.attivo, u.ultimo_accesso, u.creato_il, u.disattivato_il,
      coalesce(ce.stato, 'non_collegata') as casella,
      (select count(*)::int from public.assegnazioni a join public.clienti c on c.id = a.cliente_id
        where a.utente_id = u.id and a.al is null and a.referente_principale) as clienti_referente,
      (select count(*)::int from public.assegnazioni a join public.clienti c on c.id = a.cliente_id
        where a.utente_id = u.id and a.al is null and not a.referente_principale) as clienti_aggiuntivo,
      (select count(*)::int from public.compiti_assegnatari ca join public.compiti k on k.id = ca.compito_id
        where ca.utente_id = u.id and k.stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')) as compiti_aperti
    from public.utenti u
    left join public.caselle_email ce on ce.utente_id = u.id
    where u.ruolo in ('admin', 'collaboratore')
    order by u.attivo desc, lower(u.cognome), lower(u.nome)`
}

/**
 * Chi ha la verifica in due passaggi attiva (tabella di Supabase Auth, fuori da RLS).
 * Da chiamare solo con id già letti con RLS dall'admin (elencoPersone): non rivela altro.
 */
export async function conDuePassaggi(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  try {
    const r = await comeSistema((sql) => sql<{ user_id: string }[]>`
      select distinct user_id from auth.mfa_factors where status = 'verified' and user_id = any(${ids}::uuid[])`)
    return new Set(r.map((x) => x.user_id))
  } catch {
    return new Set() // per esempio senza lo schema di Supabase Auth
  }
}

export type InvitoInAttesa = {
  id: string
  email: string
  nome: string
  cognome: string
  ruolo: 'admin' | 'collaboratore'
  scade_il: Date
  scaduto: boolean
  email_inviata_il: Date | null
  errore_invio: string | null
  creato_il: Date
  creato_da_nome: string | null
}

export async function invitiInAttesa(tx: Tx): Promise<InvitoInAttesa[]> {
  return tx<InvitoInAttesa[]>`
    select i.id, i.email, i.nome, i.cognome, i.ruolo, i.scade_il, i.scade_il < now() as scaduto,
      i.email_inviata_il, i.errore_invio, i.creato_il, trim(u.nome || ' ' || u.cognome) as creato_da_nome
    from public.inviti i
    left join public.utenti u on u.id = i.creato_da
    where i.stato = 'in_attesa'
    order by i.creato_il desc`
}

export type AccessoCollega = {
  id: string
  utente_id: string
  utente: string
  utente_attivo: boolean
  proprietario_id: string
  proprietario: string
  proprietario_ruolo: string
  livello: 'lettura' | 'completa'
  creato_da_nome: string | null
  creato_il: Date
}

export async function elencoAccessi(tx: Tx): Promise<AccessoCollega[]> {
  return tx<AccessoCollega[]>`
    select a.id, a.utente_id, trim(u.nome || ' ' || u.cognome) as utente, u.attivo as utente_attivo,
      a.proprietario_id, trim(p.nome || ' ' || p.cognome) as proprietario, p.ruolo as proprietario_ruolo,
      a.livello, trim(c.nome || ' ' || c.cognome) as creato_da_nome, a.creato_il
    from public.accessi_colleghi a
    join public.utenti u on u.id = a.utente_id
    join public.utenti p on p.id = a.proprietario_id
    left join public.utenti c on c.id = a.creato_da
    order by lower(u.cognome), lower(u.nome), lower(p.cognome)`
}

export type DatiStudio = {
  id: string
  nome: string
  ragione_sociale: string | null
  partita_iva: string | null
  codice_fiscale: string | null
  indirizzo: string | null
  telefono: string | null
  email: string | null
  pec: string | null
  visibilita: 'solo_propri' | 'studio_lettura' | 'studio_completo'
  creazione_compiti: 'solo_admin' | 'per_se' | 'tutti'
  soglia_ritardo_iva_mesi: number
  soglia_ritardo_prima_nota_mesi: number
  lettura_email_attiva: boolean
  aggiornato_il: Date
}

export async function datiStudio(tx: Tx): Promise<DatiStudio> {
  const [s] = await tx<DatiStudio[]>`
    select id, nome, ragione_sociale, partita_iva, codice_fiscale, indirizzo, telefono, email, pec, visibilita,
      creazione_compiti, soglia_ritardo_iva_mesi, soglia_ritardo_prima_nota_mesi, lettura_email_attiva, aggiornato_il
    from public.studi where id = public.mio_studio()`
  return s
}

// ---------------------------------------------------------------------------
// Registro attività
// ---------------------------------------------------------------------------
export type FiltriRegistro = {
  da?: string // AAAA-MM-GG (ora italiana)
  a?: string
  persona?: string // id utente
  azione?: string
  soloAgenti?: boolean
  pagina?: number
}

export type RigaRegistro = {
  id: string
  creato_il: Date
  attore_id: string | null
  attore_ruolo: string | null
  attore_nome: string | null
  azione: string
  entita: string | null
  entita_id: string | null
  entita_nome: string | null
  dettagli: Record<string, unknown>
  annullato_il: Date | null
}

export const RIGHE_PER_PAGINA = 50

export async function registroAttivita(tx: Tx, f: FiltriRegistro): Promise<{ righe: RigaRegistro[]; totale: number }> {
  const pagina = Math.max(1, f.pagina ?? 1)
  const da = f.da || null
  const a = f.a || null
  const persona = f.persona || null
  const azione = f.azione || null
  const soloAgenti = Boolean(f.soloAgenti)
  const filtro = () => tx`
    (${da}::date is null or r.creato_il >= (${da}::date)::timestamp at time zone 'Europe/Rome')
    and (${a}::date is null or r.creato_il < ((${a}::date) + 1)::timestamp at time zone 'Europe/Rome')
    and (${persona}::uuid is null or r.attore_id = ${persona}::uuid)
    and (${azione}::text is null or r.azione = ${azione}::text)
    and (not ${soloAgenti}::boolean or r.attore_ruolo = 'agente')`
  const [{ totale }] = await tx<{ totale: number }[]>`
    select count(*)::int as totale from public.registro_attivita r where ${filtro()}`
  const righe = await tx<RigaRegistro[]>`
    select r.id, r.creato_il, r.attore_id, r.attore_ruolo, trim(u.nome || ' ' || u.cognome) as attore_nome,
      r.azione, r.entita, r.entita_id, r.dettagli, r.annullato_il,
      case r.entita
        when 'utente' then (select trim(x.nome || ' ' || x.cognome) from public.utenti x where x.id = r.entita_id)
        when 'cliente' then (select x.nome_visualizzazione from public.clienti x where x.id = r.entita_id)
        when 'compito' then (select x.titolo from public.compiti x where x.id = r.entita_id)
        when 'invito' then (select trim(x.nome || ' ' || x.cognome) || ' (' || x.email || ')' from public.inviti x where x.id = r.entita_id)
        when 'studio' then (select x.nome from public.studi x where x.id = r.entita_id)
        else null
      end as entita_nome
    from public.registro_attivita r
    left join public.utenti u on u.id = r.attore_id
    where ${filtro()}
    order by r.creato_il desc, r.id
    limit ${RIGHE_PER_PAGINA} offset ${(pagina - 1) * RIGHE_PER_PAGINA}`
  return { righe, totale }
}

export async function azioniNelRegistro(tx: Tx): Promise<string[]> {
  const r = await tx<{ azione: string }[]>`select distinct azione from public.registro_attivita order by azione`
  return r.map((x) => x.azione)
}

/** Tutte le persone dello studio, agenti compresi (per i nomi nel registro e nei filtri). */
export async function nomiUtenti(tx: Tx): Promise<{ id: string; nome: string; ruolo: string; attivo: boolean }[]> {
  return tx`
    select id, trim(nome || ' ' || cognome) as nome, ruolo, attivo from public.utenti
    order by ruolo = 'agente', lower(cognome), lower(nome)`
}

// ---------------------------------------------------------------------------
// Consumi AI (senza contenuti: solo conteggi, token e costo stimato)
// ---------------------------------------------------------------------------
export type RigaConsumi = {
  mese: string // AAAA-MM (ora italiana)
  funzione: 'importazione' | 'riassunto_email' | 'riassunto_incollato'
  chiamate: number
  token_ingresso: number
  token_uscita: number
  costo: number
  errori: number
}

export async function consumiAI(tx: Tx, mesi = 12): Promise<RigaConsumi[]> {
  return tx<RigaConsumi[]>`
    select to_char(r.creato_il at time zone 'Europe/Rome', 'YYYY-MM') as mese, r.funzione,
      count(*)::int as chiamate,
      coalesce(sum(r.token_ingresso), 0)::float8 as token_ingresso,
      coalesce(sum(r.token_uscita), 0)::float8 as token_uscita,
      coalesce(sum(r.costo_stimato), 0)::float8 as costo,
      count(*) filter (where r.esito <> 'ok')::int as errori
    from public.ai_richieste r
    where r.creato_il >= (date_trunc('month', now() at time zone 'Europe/Rome') - make_interval(months => ${mesi - 1}::int))
                         at time zone 'Europe/Rome'
    group by 1, 2
    order by 1 desc, 2`
}

// ---------------------------------------------------------------------------
// Esportazione completa (sezione 11): un foglio per tabella principale, senza token né segreti
// ---------------------------------------------------------------------------
export type FoglioEsportazione = { nome: string; righe: Record<string, unknown>[] }

export async function datiEsportazione(tx: Tx): Promise<FoglioEsportazione[]> {
  const clienti = await tx`
    select c.id, c.ragione_sociale, c.nome_visualizzazione, c.partita_iva, c.codice_fiscale, c.telefono,
      c.numero_dipendenti, c.fatturato::float8 as fatturato, c.stato, array_to_string(c.alias, ', ') as alias, c.note,
      (select trim(u.nome || ' ' || u.cognome) from public.assegnazioni a join public.utenti u on u.id = a.utente_id
        where a.cliente_id = c.id and a.al is null and a.referente_principale limit 1) as referente,
      (select string_agg(trim(u.nome || ' ' || u.cognome), ', ') from public.assegnazioni a join public.utenti u on u.id = a.utente_id
        where a.cliente_id = c.id and a.al is null and not a.referente_principale) as altri_collaboratori,
      c.creato_il, c.aggiornato_il
    from public.clienti c order by lower(c.nome_visualizzazione)`
  const titolari = await tx`
    select t.cliente_id, c.nome_visualizzazione as cliente, t.nome, t.cognome, t.principale
    from public.clienti_titolari t join public.clienti c on c.id = t.cliente_id
    order by lower(c.nome_visualizzazione), t.ordine`
  const email = await tx`
    select e.cliente_id, c.nome_visualizzazione as cliente, e.indirizzo, e.tipo, e.creato_il
    from public.clienti_email e join public.clienti c on c.id = e.cliente_id
    order by lower(c.nome_visualizzazione), e.indirizzo`
  const indicatori = await tx`
    select a.cliente_id, c.nome_visualizzazione as cliente, case a.tipo when 'iva' then 'IVA' else 'Prima nota' end as tipo,
      a.aggiornato_fino_al, a.non_applicabile, trim(u.nome || ' ' || u.cognome) as aggiornato_da, a.aggiornato_il
    from public.aggiornamenti_contabili a join public.clienti c on c.id = a.cliente_id
    left join public.utenti u on u.id = a.aggiornato_da
    order by lower(c.nome_visualizzazione), a.tipo`
  const storico = await tx`
    select s.cliente_id, c.nome_visualizzazione as cliente, case s.tipo when 'iva' then 'IVA' else 'Prima nota' end as tipo,
      s.valore_precedente, s.valore_nuovo, s.na_precedente as non_applicabile_prima, s.na_nuovo as non_applicabile_dopo,
      s.origine, trim(u.nome || ' ' || u.cognome) as modificato_da, s.modificato_il
    from public.aggiornamenti_storico s join public.clienti c on c.id = s.cliente_id
    left join public.utenti u on u.id = s.modificato_da
    order by lower(c.nome_visualizzazione), s.modificato_il`
  const compiti = await tx`
    select k.id, k.titolo, k.descrizione, c.nome_visualizzazione as cliente, k.stato, k.priorita, k.scadenza,
      k.scadenza_con_orario, trim(cr.nome || ' ' || cr.cognome) as creato_da,
      (select string_agg(trim(u.nome || ' ' || u.cognome), ', ') from public.compiti_assegnatari a
        join public.utenti u on u.id = a.utente_id where a.compito_id = k.id) as assegnato_a,
      k.creato_il, k.completato_il, k.annullato_il, k.motivo_annullamento
    from public.compiti k
    left join public.clienti c on c.id = k.cliente_id
    left join public.utenti cr on cr.id = k.creato_da
    order by k.creato_il`
  const commenti = await tx`
    select m.compito_id, k.titolo as compito, trim(u.nome || ' ' || u.cognome) as autore, m.testo, m.creato_il
    from public.compiti_commenti m join public.compiti k on k.id = m.compito_id
    left join public.utenti u on u.id = m.autore_id
    order by m.compito_id, m.creato_il`
  const documenti = await tx`
    select d.compito_id, k.titolo as compito, d.nome_file, d.tipo, d.dimensione, trim(u.nome || ' ' || u.cognome) as caricato_da,
      d.caricato_il
    from public.compiti_documenti d join public.compiti k on k.id = d.compito_id
    left join public.utenti u on u.id = d.caricato_da
    order by d.compito_id, d.caricato_il`
  const comunicazioni = await tx`
    select m.cliente_id, c.nome_visualizzazione as cliente, m.data, m.canale, m.fonte, m.mittente, m.oggetto, m.testo,
      array_to_string(m.allegati, ', ') as allegati, trim(u.nome || ' ' || u.cognome) as autore, m.creato_il
    from public.comunicazioni m join public.clienti c on c.id = m.cliente_id
    left join public.utenti u on u.id = m.autore_id
    order by lower(c.nome_visualizzazione), m.data`
  const utenti = await tx`
    select u.id, u.nome, u.cognome, u.email, u.ruolo, case when u.attivo then 'sì' else 'no' end as attivo,
      u.ultimo_accesso, u.creato_il, u.disattivato_il
    from public.utenti u order by u.ruolo = 'agente', lower(u.cognome), lower(u.nome)`
  return [
    { nome: 'Clienti', righe: clienti },
    { nome: 'Titolari', righe: titolari },
    { nome: 'Email dei clienti', righe: email },
    { nome: 'Indicatori', righe: indicatori },
    { nome: 'Storico indicatori', righe: storico },
    { nome: 'Compiti', righe: compiti },
    { nome: 'Commenti', righe: commenti },
    { nome: 'Documenti (elenco)', righe: documenti },
    { nome: 'Comunicazioni', righe: comunicazioni },
    { nome: 'Utenti', righe: utenti },
  ]
}
