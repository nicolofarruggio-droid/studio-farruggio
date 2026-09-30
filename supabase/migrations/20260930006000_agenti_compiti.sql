-- Migrazione: un agente AI non ottiene poteri da "creatore" sui compiti che ha creato.
-- Controllare (chiudere, annullare, riaprire, rimandare indietro, modificare, riassegnare), lavorare e
-- commentare richiedono sempre il permesso esplicito dell'agente (sezione 13.3):
--   aggiorna_compiti = 'si' per stati e modifiche, commenta = 'si' per i commenti.

create or replace function public.creatore_umano_o_agente_abilitato(p_creato_da uuid, p_azione text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_creato_da = auth.uid() and (not public.e_agente() or public.agente_puo(p_azione))
$$;

create or replace function public.puo_controllare_compito(p_compito uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.id = p_compito and c.studio_id = public.mio_studio()
      and (public.e_admin() or public.creatore_umano_o_agente_abilitato(c.creato_da, 'aggiorna_compiti'))
  )
$$;

create or replace function public.puo_lavorare_compito(p_compito uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.id = p_compito and c.studio_id = public.mio_studio()
      and (c.cliente_id is null or public.cliente_dello_studio(c.cliente_id))
      and (public.lavora_su_tutto_lo_studio()
           or public.creatore_umano_o_agente_abilitato(c.creato_da, 'aggiorna_compiti')
           or public.agente_puo('aggiorna_compiti')
           or exists (select 1 from public.compiti_assegnatari a
                      where a.compito_id = c.id and a.utente_id in (select public.spazi_lavorabili())))
  )
$$;

create or replace function public.puo_commentare_compito(p_compito uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.id = p_compito and c.studio_id = public.mio_studio()
      and (c.cliente_id is null or public.cliente_dello_studio(c.cliente_id))
      and (public.lavora_su_tutto_lo_studio()
           or public.creatore_umano_o_agente_abilitato(c.creato_da, 'commenta')
           or public.agente_puo('commenta')
           or exists (select 1 from public.compiti_assegnatari a
                      where a.compito_id = c.id and a.utente_id in (select public.spazi_lavorabili())))
  )
$$;

grant execute on function public.creatore_umano_o_agente_abilitato(uuid, text) to authenticated;
