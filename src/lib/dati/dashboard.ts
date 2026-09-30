import 'server-only'
import type { Tx } from '@/lib/db'

export type StatCollaboratore = {
  id: string
  nome: string
  cognome: string
  ruolo: 'admin' | 'collaboratore'
  clienti: number
  compiti_aperti: number
  compiti_in_scadenza: number
  compiti_scaduti: number
  clienti_in_ritardo: number
  casella: 'collegata' | 'non_collegata' | 'da_ricollegare'
}

/** Riepilogo per collaboratore (dashboard admin, sezione 9). */
export async function statisticheCollaboratori(tx: Tx): Promise<StatCollaboratore[]> {
  return tx<StatCollaboratore[]>`
    with soglie as (
      select (now() at time zone 'Europe/Rome')::date - make_interval(months => s.soglia_ritardo_iva_mesi) as limite_iva,
             (now() at time zone 'Europe/Rome')::date - make_interval(months => s.soglia_ritardo_prima_nota_mesi) as limite_pn
      from public.studi s where s.id = public.mio_studio()
    ),
    miei as (
      select a.utente_id, c.id as cliente_id
      from public.assegnazioni a join public.clienti c on c.id = a.cliente_id
      where a.al is null and c.stato = 'attivo'
    ),
    ritardi as (
      select m.utente_id, count(distinct m.cliente_id) as n
      from miei m cross join soglie
      left join public.aggiornamenti_contabili iva on iva.cliente_id = m.cliente_id and iva.tipo = 'iva'
      left join public.aggiornamenti_contabili pn on pn.cliente_id = m.cliente_id and pn.tipo = 'prima_nota'
      where (not coalesce(iva.non_applicabile, false) and iva.aggiornato_fino_al < soglie.limite_iva)
         or (not coalesce(pn.non_applicabile, false) and pn.aggiornato_fino_al < soglie.limite_pn)
      group by m.utente_id
    ),
    lavori as (
      select a.utente_id,
        count(*) as aperti,
        count(*) filter (where k.scadenza >= now() and k.scadenza < now() + interval '7 days') as in_scadenza,
        count(*) filter (where k.scadenza < now()) as scaduti
      from public.compiti_assegnatari a join public.compiti k on k.id = a.compito_id
      where k.stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')
      group by a.utente_id
    )
    select u.id, u.nome, u.cognome, u.ruolo,
      (select count(*)::int from miei m where m.utente_id = u.id) as clienti,
      coalesce(l.aperti, 0)::int as compiti_aperti, coalesce(l.in_scadenza, 0)::int as compiti_in_scadenza,
      coalesce(l.scaduti, 0)::int as compiti_scaduti, coalesce(r.n, 0)::int as clienti_in_ritardo,
      coalesce(ce.stato, 'non_collegata') as casella
    from public.utenti u
    left join lavori l on l.utente_id = u.id
    left join ritardi r on r.utente_id = u.id
    left join public.caselle_email ce on ce.utente_id = u.id
    where u.attivo and u.ruolo in ('admin', 'collaboratore')
    order by u.ruolo = 'collaboratore' desc, lower(u.cognome), lower(u.nome)`
}

export type ContatoriRitardi = { iva: number; prima_nota: number; clienti: number; da_impostare: number; totale: number }

export async function contatoriRitardi(tx: Tx, utente: string | null = null): Promise<ContatoriRitardi> {
  const [r] = await tx<ContatoriRitardi[]>`
    with soglie as (
      select (now() at time zone 'Europe/Rome')::date - make_interval(months => s.soglia_ritardo_iva_mesi) as limite_iva,
             (now() at time zone 'Europe/Rome')::date - make_interval(months => s.soglia_ritardo_prima_nota_mesi) as limite_pn
      from public.studi s where s.id = public.mio_studio()
    ),
    base as (
      select c.id,
        (not coalesce(iva.non_applicabile, false) and iva.aggiornato_fino_al < soglie.limite_iva) as r_iva,
        (not coalesce(pn.non_applicabile, false) and pn.aggiornato_fino_al < soglie.limite_pn) as r_pn,
        ((iva.aggiornato_fino_al is null and not coalesce(iva.non_applicabile, false))
          or (pn.aggiornato_fino_al is null and not coalesce(pn.non_applicabile, false))) as da_impostare
      from public.clienti c cross join soglie
      left join public.aggiornamenti_contabili iva on iva.cliente_id = c.id and iva.tipo = 'iva'
      left join public.aggiornamenti_contabili pn on pn.cliente_id = c.id and pn.tipo = 'prima_nota'
      where c.stato = 'attivo' and public.puo_vedere_cliente(c.id)
        and (${utente}::uuid is null or exists (select 1 from public.assegnazioni a where a.cliente_id = c.id and a.al is null and a.utente_id = ${utente}))
    )
    select count(*) filter (where r_iva)::int as iva, count(*) filter (where r_pn)::int as prima_nota,
           count(*) filter (where r_iva or r_pn)::int as clienti, count(*) filter (where da_impostare)::int as da_impostare,
           count(*)::int as totale
    from base`
  return r
}
