-- Migrazione 5: account agente (sezione 13), token API, coda di proposte, limiti di frequenza.

create table public.agenti_token (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  agente_id uuid not null references public.utenti(id) on delete cascade,
  nome text not null,
  token_hash text not null unique, -- SHA-256 del token: il token in chiaro si vede una volta sola
  prefisso text not null,          -- prime lettere, per riconoscerlo nell'elenco
  scade_il timestamptz not null,
  revocato_il timestamptz,
  ultimo_uso_il timestamptz,
  creato_da uuid references public.utenti(id) on delete set null,
  creato_il timestamptz not null default now()
);
create index agenti_token_agente on public.agenti_token (agente_id);

create table public.proposte_agente (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  agente_id uuid not null references public.utenti(id) on delete cascade,
  azione text not null, -- crea_compito | aggiorna_indicatore | cambia_stato_compito | commenta
  dati jsonb not null,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'approvata', 'rifiutata', 'fallita')),
  creata_il timestamptz not null default now(),
  decisa_da uuid references public.utenti(id) on delete set null,
  decisa_il timestamptz,
  esito text
);
create index proposte_studio on public.proposte_agente (studio_id, stato, creata_il desc);

-- Contatore per finestra di un minuto (limiti di frequenza dell'API).
create table public.api_uso (
  token_id uuid not null references public.agenti_token(id) on delete cascade,
  minuto timestamptz not null,
  letture integer not null default 0,
  scritture integer not null default 0,
  primary key (token_id, minuto)
);

-- Azioni che un agente può avere abilitate (le altre non esistono per gli agenti).
create or replace function public.azioni_agente() returns text[]
language sql immutable as $$
  select array['crea_compiti', 'aggiorna_compiti', 'aggiorna_indicatori', 'commenta', 'carica_documenti']
$$;

create or replace function public.crea_agente(p_nome text, p_descrizione text, p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid := public.mio_studio();
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono creare account agente' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nome, ''))) = 0 then
    raise exception 'Il nome è obbligatorio' using errcode = '22023';
  end if;
  insert into public.utenti (id, studio_id, nome, cognome, email, ruolo, descrizione, permessi_agente)
  values (p_id, v_studio, trim(p_nome), '', 'agente-' || p_id::text || '@agenti.invalid', 'agente',
          nullif(trim(coalesce(p_descrizione, '')), ''), '{}'::jsonb);
  perform public.registra_attivita('agente_creato', 'utente', p_id, jsonb_build_object('nome', trim(p_nome)));
  return p_id;
end $$;

create or replace function public.imposta_permessi_agente(p_agente uuid, p_permessi jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_prima jsonb;
  v_pulito jsonb := '{}'::jsonb;
  v_azione text;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono cambiare i permessi degli agenti' using errcode = '42501';
  end if;
  foreach v_azione in array public.azioni_agente() loop
    if p_permessi ->> v_azione in ('si', 'proposta') then
      v_pulito := v_pulito || jsonb_build_object(v_azione, p_permessi ->> v_azione);
    end if;
  end loop;
  select permessi_agente into v_prima from public.utenti
   where id = p_agente and studio_id = public.mio_studio() and ruolo = 'agente';
  if not found then
    raise exception 'Agente non trovato' using errcode = 'P0002';
  end if;
  update public.utenti set permessi_agente = v_pulito where id = p_agente;
  perform public.registra_attivita('permessi_agente_modificati', 'utente', p_agente,
    jsonb_build_object('prima', v_prima, 'dopo', v_pulito));
end $$;

create or replace function public.crea_token_agente(p_agente uuid, p_nome text, p_hash text, p_prefisso text, p_giorni integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono creare token' using errcode = '42501';
  end if;
  if not exists (select 1 from public.utenti where id = p_agente and studio_id = public.mio_studio() and ruolo = 'agente') then
    raise exception 'Agente non trovato' using errcode = 'P0002';
  end if;
  if p_giorni not between 1 and 365 then
    raise exception 'La durata deve essere tra 1 e 365 giorni' using errcode = '22023';
  end if;
  insert into public.agenti_token (studio_id, agente_id, nome, token_hash, prefisso, scade_il, creato_da)
  values (public.mio_studio(), p_agente, coalesce(nullif(trim(p_nome), ''), 'Token'), p_hash, p_prefisso,
          now() + make_interval(days => p_giorni), auth.uid())
  returning id into v_id;
  perform public.registra_attivita('token_agente_creato', 'utente', p_agente,
    jsonb_build_object('token_id', v_id, 'prefisso', p_prefisso, 'giorni', p_giorni));
  return v_id;
end $$;

create or replace function public.revoca_token_agente(p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_agente uuid;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono revocare token' using errcode = '42501';
  end if;
  update public.agenti_token set revocato_il = now()
   where id = p_token and studio_id = public.mio_studio() and revocato_il is null
  returning agente_id into v_agente;
  if not found then
    raise exception 'Token non trovato' using errcode = 'P0002';
  end if;
  perform public.registra_attivita('token_agente_revocato', 'utente', v_agente, jsonb_build_object('token_id', p_token));
end $$;

-- L'agente mette in coda una proposta: la esegue un admin approvandola (sezione 13.4).
create or replace function public.crea_proposta_agente(p_azione text, p_dati jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_permesso text;
  v_admin uuid;
begin
  if not public.e_agente() then
    raise exception 'Solo gli agenti creano proposte' using errcode = '42501';
  end if;
  select permessi_agente ->> (case p_azione
      when 'crea_compito' then 'crea_compiti'
      when 'aggiorna_indicatore' then 'aggiorna_indicatori'
      when 'cambia_stato_compito' then 'aggiorna_compiti'
      when 'commenta' then 'commenta'
      else '-' end)
    into v_permesso from public.utenti where id = auth.uid();
  if v_permesso is distinct from 'proposta' then
    raise exception 'Questa azione non è abilitata in modalità proposta' using errcode = '42501';
  end if;
  insert into public.proposte_agente (studio_id, agente_id, azione, dati)
  values (public.mio_studio(), auth.uid(), p_azione, p_dati) returning id into v_id;
  perform public.registra_attivita('proposta_creata', 'proposta', v_id, jsonb_build_object('azione', p_azione));
  for v_admin in select id from public.utenti where studio_id = public.mio_studio() and ruolo = 'admin' and attivo loop
    insert into public.notifiche (studio_id, utente_id, tipo, autore_id, testo)
    values (public.mio_studio(), v_admin, 'proposta', auth.uid(),
            public.nome_utente(auth.uid()) || ' propone un''azione da approvare');
  end loop;
  return v_id;
end $$;

create or replace function public.decidi_proposta_agente(p_id uuid, p_stato text, p_esito text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin decidono sulle proposte' using errcode = '42501';
  end if;
  if p_stato not in ('approvata', 'rifiutata', 'fallita') then
    raise exception 'Esito non valido' using errcode = '22023';
  end if;
  update public.proposte_agente set stato = p_stato, decisa_da = auth.uid(), decisa_il = now(), esito = p_esito
   where id = p_id and studio_id = public.mio_studio() and stato = 'in_attesa';
  if not found then
    raise exception 'Proposta non trovata o già decisa' using errcode = 'P0002';
  end if;
  perform public.registra_attivita('proposta_' || p_stato, 'proposta', p_id, jsonb_build_object('esito', p_esito));
end $$;

alter table public.agenti_token enable row level security;
alter table public.proposte_agente enable row level security;
alter table public.api_uso enable row level security;

create policy agenti_token_lettura_admin on public.agenti_token for select to authenticated
  using (studio_id = (select public.mio_studio()) and (select public.e_admin()));
create policy proposte_lettura on public.proposte_agente for select to authenticated
  using (studio_id = (select public.mio_studio()) and ((select public.e_admin()) or agente_id = auth.uid()));

revoke all on public.agenti_token, public.proposte_agente, public.api_uso from anon, authenticated;
grant select (id, studio_id, agente_id, nome, prefisso, scade_il, revocato_il, ultimo_uso_il, creato_da, creato_il)
  on public.agenti_token to authenticated;
grant select on public.proposte_agente to authenticated;

-- ---------------------------------------------------------------------------
-- Funzioni: niente esecuzione per anon; authenticated sì (ognuna controlla i permessi da sé)
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
  end if;
end $$;
grant execute on all functions in schema public to authenticated;
-- notifica() è interna: la chiamano solo le altre funzioni
revoke execute on function public.notifica(uuid, text, uuid, text, text) from authenticated;
