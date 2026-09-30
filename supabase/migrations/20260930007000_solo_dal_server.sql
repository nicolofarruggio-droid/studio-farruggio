-- Migrazione: solo il server del sito agisce per conto degli utenti (revisione di sicurezza).
--
-- Supabase espone lo schema public anche via REST/GraphQL (Data API) a chiunque abbia un JWT: il sito non
-- usa quella strada (legge e scrive dal server con postgres.js). Qui la si chiude nel database, così resta
-- chiusa anche se nel progetto Supabase la Data API restasse attiva:
-- * il server imposta app.canale = 'server' in ogni transazione fatta per conto di un utente (src/lib/db.ts);
-- * senza quel valore le funzioni di identità non riconoscono nessun utente: nessuna policy e nessuna
--   funzione di permesso concede qualcosa;
-- * in più una policy RESTRICTIVE su ogni tabella esclude qualsiasi accesso diretto.
-- La verifica in due passaggi è imposta dal server (richiediUtente e rotte), che è l'unico canale.

create or replace function public.canale_server() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.canale', true), '') = 'server'
$$;

-- L'utente della richiesta, solo se la richiesta arriva dal server del sito.
create or replace function public.io() returns uuid
language sql stable as $$
  select case when public.canale_server() then auth.uid() end
$$;

create or replace function public.mio_studio() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.studio_id from public.utenti u where u.id = public.io() and u.attivo
$$;

create or replace function public.mio_ruolo() returns text
language sql stable security definer set search_path = '' as $$
  select u.ruolo from public.utenti u where u.id = public.io() and u.attivo
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.ruolo = 'admin' from public.utenti u where u.id = public.io() and u.attivo), false)
$$;

create or replace function public.e_agente() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.ruolo = 'agente' from public.utenti u where u.id = public.io() and u.attivo), false)
$$;

create or replace function public.vede_tutto_lo_studio() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when u.ruolo in ('admin', 'agente') then true
      else s.visibilita in ('studio_lettura', 'studio_completo')
    end
    from public.utenti u join public.studi s on s.id = u.studio_id
    where u.id = public.io() and u.attivo
  ), false)
$$;

create or replace function public.lavora_su_tutto_lo_studio() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when u.ruolo = 'admin' then true
      when u.ruolo = 'collaboratore' then s.visibilita = 'studio_completo'
      else false
    end
    from public.utenti u join public.studi s on s.id = u.studio_id
    where u.id = public.io() and u.attivo
  ), false)
$$;

create or replace function public.agente_puo(p_azione text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select u.permessi_agente ->> p_azione = 'si'
    from public.utenti u
    where u.id = public.io() and u.attivo and u.ruolo = 'agente'
  ), false)
$$;

create or replace function public.spazi_visibili() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.utenti u where u.id = public.io() and u.attivo
  union
  select a.proprietario_id
  from public.accessi_colleghi a
  join public.utenti u on u.id = a.utente_id
  where a.utente_id = public.io() and u.attivo and a.studio_id = u.studio_id
$$;

create or replace function public.spazi_lavorabili() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.utenti u where u.id = public.io() and u.attivo
  union
  select a.proprietario_id
  from public.accessi_colleghi a
  join public.utenti u on u.id = a.utente_id
  where a.utente_id = public.io() and u.attivo and a.livello = 'completa' and a.studio_id = u.studio_id
$$;

-- Tutte le altre funzioni dello schema public che leggono l'utente della richiesta passano a public.io():
-- chiamate dirette (senza il server) non hanno un utente e quindi nessun permesso.
-- Nelle migrazioni successive: usare sempre public.io(), mai auth.uid() (vedi CLAUDE.md).
do $$
declare
  f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%auth.uid()%'
             and p.proname not in ('io', 'canale_server') loop
    execute replace(pg_get_functiondef(f.oid), 'auth.uid()', 'public.io()');
  end loop;
end $$;

-- Registrazione dello studio e accettazione degli inviti usano l'utente direttamente: si accettano solo dal server.
create or replace function public.trg_solo_dal_server() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.canale_server() then
    raise exception 'Operazione consentita solo dal sito' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger utenti_solo_dal_server before insert or update or delete on public.utenti
  for each row execute function public.trg_solo_dal_server();

-- Policy RESTRICTIVE: ogni accesso diretto di un utente (Data API, GraphQL, Realtime) è escluso.
do $$
declare
  t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity loop
    execute format('create policy solo_dal_server on public.%I as restrictive for all to authenticated
                    using (public.canale_server()) with check (public.canale_server())', t.relname);
  end loop;
end $$;

-- Lo spazio file non si usa mai direttamente: il server crea link firmati (lettura e caricamento).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute 'drop policy if exists documenti_lettura on storage.objects';
    execute 'drop policy if exists documenti_caricamento on storage.objects';
  end if;
end $$;

-- Nome di un utente: solo dello stesso studio.
create or replace function public.nome_utente(p_utente uuid) returns text
language sql stable security definer set search_path = '' as $$
  select trim(u.nome || ' ' || u.cognome) from public.utenti u where u.id = p_utente and u.studio_id = public.mio_studio()
$$;

-- "Ha caricato N documenti": solo chi ha davvero appena caricato quei documenti.
create or replace function public.notifica_documenti(p_compito uuid, p_numero integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.compiti%rowtype;
  v_utente uuid;
  v_testo text;
  v_caricati integer;
begin
  if not public.puo_vedere_compito(p_compito) then
    raise exception 'Compito non trovato' using errcode = 'P0002';
  end if;
  select count(*) into v_caricati from public.compiti_documenti
   where compito_id = p_compito and caricato_da = public.io() and caricato_il > now() - interval '10 minutes';
  if p_numero < 1 or p_numero > v_caricati then
    raise exception 'Nessun documento appena caricato da notificare' using errcode = '22023';
  end if;
  select * into v_c from public.compiti where id = p_compito;
  v_testo := public.nome_utente(public.io()) || ' ha caricato ' ||
    case when p_numero = 1 then 'un documento' else p_numero || ' documenti' end || ' in: ' || v_c.titolo;
  for v_utente in
    select v_c.creato_da union select utente_id from public.compiti_assegnatari where compito_id = p_compito
  loop
    perform public.notifica(v_utente, 'documenti', p_compito, v_testo);
  end loop;
end $$;

-- Documenti: nome senza caratteri di controllo o nascosti (inversione del testo) e solo i tipi ammessi
-- (stesso elenco di src/lib/documenti/regole.ts, controllato da un test).
create or replace function public.trg_documento_valido() returns trigger
language plpgsql as $$
begin
  if new.nome_file ~ '[\x01-\x1f\x7f\u200e\u200f\u202a-\u202e\u2066-\u2069/\\]' or length(trim(new.nome_file)) = 0 then
    raise exception 'Nome del file non valido' using errcode = '22023';
  end if;
  if new.tipo not in (
    'application/msword',
    'application/pdf',
    'application/pkcs7-mime',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.ms-outlook',
    'application/vnd.ms-powerpoint',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/xml',
    'application/zip',
    'image/bmp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/webp',
    'message/rfc822',
    'text/csv',
    'text/plain'
  ) then
    raise exception 'Tipo di file non ammesso' using errcode = '22023';
  end if;
  if new.dimensione <= 0 then
    raise exception 'Il file è vuoto' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger compiti_documenti_validi before insert or update on public.compiti_documenti
  for each row execute function public.trg_documento_valido();

-- Limite agli inviti: al massimo 100 al giorno per studio (evita l'uso dello studio per mandare email a raffica).
create or replace function public.trg_limite_inviti() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.inviti where studio_id = new.studio_id and creato_il > now() - interval '1 day') >= 100 then
    raise exception 'Troppi inviti nelle ultime 24 ore: riprova domani' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger inviti_limite before insert on public.inviti
  for each row execute function public.trg_limite_inviti();

-- L'invito dice se il link è stato mandato per email (altrimenti l'admin l'ha visto e alla scelta della
-- password serve una conferma dell'indirizzo, vedi src/app/(pubblico)/azioni.ts).
drop function public.info_invito(text);
create function public.info_invito(p_codice_hash text)
returns table (id uuid, studio_nome text, email text, nome text, cognome text, ruolo text, stato text, scaduto boolean, email_inviata boolean)
language sql stable security definer set search_path = '' as $$
  select i.id, s.nome, i.email, i.nome, i.cognome, i.ruolo, i.stato, i.scade_il < now(), i.email_inviata_il is not null
  from public.inviti i join public.studi s on s.id = i.studio_id
  where i.codice_hash = p_codice_hash
$$;
revoke execute on function public.info_invito(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.info_invito(text) from anon, authenticated';
  end if;
end $$;

-- Una proposta si approva solo se l'agente è ancora attivo e ha ancora il permesso ("si" o "proposta")
-- per quell'azione: togliere il permesso o disattivare l'agente ferma anche le proposte già in coda.
create or replace function public.decidi_proposta_agente(p_id uuid, p_stato text, p_esito text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.proposte_agente%rowtype;
  v_permesso text;
  v_attivo boolean;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin decidono sulle proposte' using errcode = '42501';
  end if;
  if p_stato not in ('approvata', 'rifiutata', 'fallita') then
    raise exception 'Esito non valido' using errcode = '22023';
  end if;
  select * into v_p from public.proposte_agente
   where id = p_id and studio_id = public.mio_studio() and stato = 'in_attesa' for update;
  if not found then
    raise exception 'Proposta non trovata o già decisa' using errcode = 'P0002';
  end if;
  if p_stato = 'approvata' then
    select u.attivo, u.permessi_agente ->> (case v_p.azione
        when 'crea_compito' then 'crea_compiti'
        when 'aggiorna_indicatore' then 'aggiorna_indicatori'
        when 'cambia_stato_compito' then 'aggiorna_compiti'
        when 'modifica_compito' then 'aggiorna_compiti'
        when 'commenta' then 'commenta'
        else '-' end)
      into v_attivo, v_permesso
      from public.utenti u where u.id = v_p.agente_id and u.ruolo = 'agente';
    if not coalesce(v_attivo, false) or coalesce(v_permesso, 'no') not in ('si', 'proposta') then
      raise exception 'L''agente è disattivato o non ha più il permesso per questa azione' using errcode = '42501';
    end if;
  end if;
  update public.proposte_agente set stato = p_stato, decisa_da = public.io(), decisa_il = now(), esito = p_esito
   where id = p_id;
  perform public.registra_attivita('proposta_' || p_stato, 'proposta', p_id, jsonb_build_object('esito', p_esito));
end $$;
