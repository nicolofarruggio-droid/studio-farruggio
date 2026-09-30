-- Migrazione 7: registro degli indirizzi email dei clienti, eliminazione definitiva dal cestino,
-- archiviazione e titolari condivisi tra clienti.

-- Aggiungere o togliere un indirizzo email di un cliente finisce nel registro attività (sezione 16.1).
create or replace function public.trg_clienti_email_registro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_riga public.clienti_email%rowtype;
begin
  if tg_op = 'DELETE' then
    v_riga := old;
    -- se è il cliente stesso a essere eliminato non serve una voce per ogni indirizzo
    if not exists (select 1 from public.clienti where id = old.cliente_id) then
      return null;
    end if;
  else
    v_riga := new;
  end if;
  insert into public.registro_attivita (studio_id, attore_id, attore_ruolo, azione, entita, entita_id, dettagli)
  values (v_riga.studio_id, auth.uid(), coalesce(public.mio_ruolo(), 'sistema'),
          case when tg_op = 'DELETE' then 'email_cliente_rimossa' else 'email_cliente_aggiunta' end,
          'cliente', v_riga.cliente_id, jsonb_build_object('indirizzo', v_riga.indirizzo, 'tipo', v_riga.tipo));
  return null;
end $$;

create trigger clienti_email_registro after insert or delete on public.clienti_email
  for each row execute function public.trg_clienti_email_registro();

-- Eliminazione definitiva di un cliente dal cestino: restituisce i percorsi dei documenti
-- dei suoi compiti, che il server cancella poi dallo spazio file.
-- DECISIONE APERTA (sezione 14): cestino di 30 giorni proposto; si può anche eliminare subito dal cestino.
create or replace function public.elimina_cliente_definitivo(p_cliente uuid) returns setof text
language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_percorsi text[];
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono eliminare definitivamente i clienti' using errcode = '42501';
  end if;
  select nome_visualizzazione into v_nome from public.clienti
   where id = p_cliente and studio_id = public.mio_studio() and eliminato_il is not null;
  if not found then
    raise exception 'Cliente non trovato nel cestino' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(d.percorso), '{}') into v_percorsi
    from public.compiti_documenti d join public.compiti k on k.id = d.compito_id
   where k.cliente_id = p_cliente;
  delete from public.clienti where id = p_cliente;
  perform public.registra_attivita('cliente_eliminato_definitivamente', 'cliente', p_cliente,
    jsonb_build_object('nome', v_nome, 'documenti', coalesce(array_length(v_percorsi, 1), 0)));
  return query select unnest(v_percorsi);
end $$;

-- Pulizia automatica del cestino dopo 30 giorni (chiamata dal processo pianificato, senza utente).
create or replace function public.svuota_cestino_scaduto(p_giorni integer default 30)
returns table (cliente_id uuid, studio_id uuid, percorso text)
language plpgsql security definer set search_path = '' as $$
declare
  v_c record;
begin
  for v_c in select c.id, c.studio_id, c.nome_visualizzazione from public.clienti c
             where c.eliminato_il is not null and c.eliminato_il < now() - make_interval(days => p_giorni) loop
    return query
      select v_c.id, v_c.studio_id, d.percorso
      from public.compiti_documenti d join public.compiti k on k.id = d.compito_id
      where k.cliente_id = v_c.id;
    delete from public.clienti where id = v_c.id;
    insert into public.registro_attivita (studio_id, attore_id, attore_ruolo, azione, entita, entita_id, dettagli)
    values (v_c.studio_id, null, 'sistema', 'cliente_eliminato_definitivamente', 'cliente', v_c.id,
            jsonb_build_object('nome', v_c.nome_visualizzazione, 'motivo', 'cestino scaduto'));
  end loop;
end $$;
revoke execute on function public.svuota_cestino_scaduto(integer) from public, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.svuota_cestino_scaduto(integer) from anon';
  end if;
end $$;

-- Altri clienti con lo stesso titolare (il sistema lo segnala senza bloccare, sezione 6).
create or replace function public.clienti_stesso_titolare(p_cliente uuid)
returns table (id uuid, nome_visualizzazione text, titolare text)
language sql stable security invoker set search_path = '' as $$
  select distinct c.id, c.nome_visualizzazione, trim(t2.nome || ' ' || t2.cognome)
  from public.clienti_titolari t1
  join public.clienti_titolari t2
    on lower(trim(t2.nome)) = lower(trim(t1.nome)) and lower(trim(t2.cognome)) = lower(trim(t1.cognome))
   and t2.cliente_id <> t1.cliente_id and t2.studio_id = t1.studio_id
  join public.clienti c on c.id = t2.cliente_id
  where t1.cliente_id = p_cliente and length(trim(t1.cognome)) > 0
$$;

grant execute on function public.elimina_cliente_definitivo(uuid), public.clienti_stesso_titolare(uuid) to authenticated;

-- Quante caselle email sono collegate nello studio (in cima alle Comunicazioni, sezione 16.1):
-- solo il numero, visibile a tutti gli utenti dello studio.
create or replace function public.caselle_collegate_studio() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.caselle_email
  where studio_id = public.mio_studio() and stato = 'collegata'
$$;
grant execute on function public.caselle_collegate_studio() to authenticated;
