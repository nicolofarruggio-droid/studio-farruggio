import 'server-only'
import type { Tx } from '@/lib/db'

export type Indicatore = { aggiornato_fino_al: string | null; non_applicabile: boolean }

export type RigaCliente = {
  id: string
  ragione_sociale: string
  nome_visualizzazione: string
  stato: 'attivo' | 'archiviato'
  titolare: string | null
  referente_id: string | null
  referente: string | null
  iva: Indicatore | null
  prima_nota: Indicatore | null
  iva_in_ritardo: boolean
  prima_nota_in_ritardo: boolean
  numero_dipendenti: number | null
  fatturato: string | null
  partita_iva: string | null
  compiti_aperti: number
  puo_lavorare: boolean
}

export type FiltriClienti = {
  q?: string
  collaboratore?: string // id, oppure "nessuno"
  ritardo?: 'qualsiasi' | 'iva' | 'prima_nota' | ''
  stato?: 'attivo' | 'archiviato' | 'tutti' | ''
  ordina?: string
  verso?: 'asc' | 'desc'
  soloMiei?: string // id utente: solo i clienti assegnati a lui (vista "entra come")
}

export const COLONNE_ORDINABILI = {
  ragione_sociale: 'lower(c.ragione_sociale)',
  titolare: 'lower(t.titolare)',
  referente: 'lower(r.referente)',
  iva: 'iva.aggiornato_fino_al',
  prima_nota: 'pn.aggiornato_fino_al',
  dipendenti: 'c.numero_dipendenti',
  fatturato: 'c.fatturato',
  compiti: 'coalesce(k.n, 0)',
} as const

/**
 * Clienti che l'utente può vedere per intero (RLS + puo_vedere_cliente), con indicatori e ritardi
 * calcolati sulle soglie dello studio. Sezione 9: tabella clienti con filtri e ordinamento.
 */
export async function elencoClienti(tx: Tx, f: FiltriClienti = {}): Promise<RigaCliente[]> {
  const colonna = COLONNE_ORDINABILI[(f.ordina ?? 'ragione_sociale') as keyof typeof COLONNE_ORDINABILI] ?? COLONNE_ORDINABILI.ragione_sociale
  const verso = f.verso === 'desc' ? 'desc' : 'asc'
  const q = f.q?.trim() ? `%${f.q.trim().toLowerCase()}%` : null
  const stato = f.stato === 'tutti' ? null : f.stato || 'attivo'
  const collaboratore = f.collaboratore && f.collaboratore !== 'nessuno' ? f.collaboratore : null
  return tx.unsafe<RigaCliente[]>(
    `
    with soglie as (
      select (now() at time zone 'Europe/Rome')::date - make_interval(months => s.soglia_ritardo_iva_mesi) as limite_iva,
             (now() at time zone 'Europe/Rome')::date - make_interval(months => s.soglia_ritardo_prima_nota_mesi) as limite_pn
      from public.studi s where s.id = public.mio_studio()
    )
    select c.id, c.ragione_sociale, c.nome_visualizzazione, c.stato, t.titolare, r.referente_id, r.referente,
      case when iva.cliente_id is null then null else json_build_object('aggiornato_fino_al', iva.aggiornato_fino_al, 'non_applicabile', iva.non_applicabile) end as iva,
      case when pn.cliente_id is null then null else json_build_object('aggiornato_fino_al', pn.aggiornato_fino_al, 'non_applicabile', pn.non_applicabile) end as prima_nota,
      (coalesce(iva.non_applicabile, false) = false and iva.aggiornato_fino_al < soglie.limite_iva) as iva_in_ritardo,
      (coalesce(pn.non_applicabile, false) = false and pn.aggiornato_fino_al < soglie.limite_pn) as prima_nota_in_ritardo,
      c.numero_dipendenti, c.fatturato::text as fatturato, c.partita_iva, coalesce(k.n, 0)::int as compiti_aperti,
      public.puo_lavorare_cliente(c.id) as puo_lavorare
    from public.clienti c
    cross join soglie
    left join lateral (
      select trim(ct.nome || ' ' || ct.cognome) as titolare from public.clienti_titolari ct
      where ct.cliente_id = c.id order by ct.principale desc, ct.ordine limit 1
    ) t on true
    left join lateral (
      select u.id as referente_id, trim(u.nome || ' ' || u.cognome) as referente
      from public.assegnazioni a join public.utenti u on u.id = a.utente_id
      where a.cliente_id = c.id and a.al is null order by a.referente_principale desc, a.dal limit 1
    ) r on true
    left join public.aggiornamenti_contabili iva on iva.cliente_id = c.id and iva.tipo = 'iva'
    left join public.aggiornamenti_contabili pn on pn.cliente_id = c.id and pn.tipo = 'prima_nota'
    left join lateral (
      select count(*) as n from public.compiti k where k.cliente_id = c.id and public.compito_aperto(k.stato)
    ) k on true
    where public.puo_vedere_cliente(c.id)
      and ($1::text is null or c.stato = $1)
      and ($2::text is null or lower(c.ragione_sociale) like $2 or lower(c.nome_visualizzazione) like $2
           or lower(coalesce(c.partita_iva, '')) like $2 or lower(coalesce(c.codice_fiscale, '')) like $2
           or exists (select 1 from public.clienti_titolari x where x.cliente_id = c.id and lower(x.nome || ' ' || x.cognome) like $2)
           or exists (select 1 from public.clienti_email x where x.cliente_id = c.id and x.indirizzo like $2)
           or exists (select 1 from unnest(c.alias) al where lower(al) like $2))
      and ($3::uuid is null or exists (select 1 from public.assegnazioni a where a.cliente_id = c.id and a.al is null and a.utente_id = $3))
      and ($4::boolean is not true or not exists (select 1 from public.assegnazioni a where a.cliente_id = c.id and a.al is null))
      and ($5::uuid is null or exists (select 1 from public.assegnazioni a where a.cliente_id = c.id and a.al is null and a.utente_id = $5))
      and (case $6::text
             when 'iva' then coalesce(iva.non_applicabile, false) = false and iva.aggiornato_fino_al < soglie.limite_iva
             when 'prima_nota' then coalesce(pn.non_applicabile, false) = false and pn.aggiornato_fino_al < soglie.limite_pn
             when 'qualsiasi' then (coalesce(iva.non_applicabile, false) = false and iva.aggiornato_fino_al < soglie.limite_iva)
                                or (coalesce(pn.non_applicabile, false) = false and pn.aggiornato_fino_al < soglie.limite_pn)
             else true end)
    order by ${colonna} ${verso} nulls last, lower(c.ragione_sociale) asc
    `,
    [stato, q, collaboratore, f.collaboratore === 'nessuno', f.soloMiei ?? null, f.ritardo || null],
  )
}

export type Collega = { id: string; nome: string; cognome: string; ruolo: 'admin' | 'collaboratore'; attivo: boolean }

export async function colleghi(tx: Tx, soloAttivi = true): Promise<Collega[]> {
  return tx<Collega[]>`
    select id, nome, cognome, ruolo, attivo from public.utenti
    where ruolo in ('admin', 'collaboratore') and (${!soloAttivi} or attivo)
    order by ruolo = 'admin' desc, lower(cognome), lower(nome)`
}
