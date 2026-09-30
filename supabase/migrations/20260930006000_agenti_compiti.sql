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

-- Documenti: un agente carica solo con il permesso carica_documenti, su qualsiasi compito aperto dello studio.
create or replace function public.registra_documento(
  p_compito uuid, p_id uuid, p_nome_file text, p_tipo text, p_dimensione bigint, p_percorso text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.compiti%rowtype;
  v_utente uuid;
  v_destinatari uuid[];
begin
  select * into v_c from public.compiti where id = p_compito and studio_id = public.mio_studio();
  if not found then
    raise exception 'Compito non trovato' using errcode = 'P0002';
  end if;
  -- persone: chi lavora sul compito o lo controlla; agenti: solo con carica_documenti = 'si' (su tutto lo studio)
  if not (case when public.e_agente() then public.agente_puo('carica_documenti')
               else public.puo_lavorare_compito(p_compito) or public.puo_controllare_compito(p_compito) end) then
    raise exception 'Non puoi caricare documenti su questo compito' using errcode = '42501';
  end if;
  if not public.compito_aperto(v_c.stato) then
    raise exception 'Il compito è chiuso: riaprilo per aggiungere documenti' using errcode = 'P0001';
  end if;
  if p_percorso is distinct from (v_c.studio_id::text || '/compiti/' || p_compito::text || '/' || p_id::text) then
    raise exception 'Percorso del file non valido' using errcode = '42501';
  end if;

  insert into public.compiti_documenti (id, studio_id, compito_id, nome_file, tipo, dimensione, percorso, caricato_da)
  values (p_id, v_c.studio_id, p_compito, p_nome_file, p_tipo, p_dimensione, p_percorso, auth.uid());
  insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
  values (v_c.studio_id, p_compito, auth.uid(), 'documento',
          jsonb_build_object('documento_id', p_id, 'nome_file', p_nome_file, 'dimensione', p_dimensione));
  return p_id;
end $$;

grant execute on function public.creatore_umano_o_agente_abilitato(uuid, text) to authenticated;
