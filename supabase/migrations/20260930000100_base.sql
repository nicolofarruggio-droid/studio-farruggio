-- BigBrotherStudio — Modulo 1
-- Migrazione 1: studi, utenti, funzioni di permesso, inviti, accessi tra colleghi, registro attività.
--
-- Regole generali (vedi CLAUDE.md):
-- * ogni tabella di business ha studio_id non nullo;
-- * l'isolamento è imposto con Row Level Security; le funzioni di permesso sono
--   SECURITY DEFINER con search_path vuoto e leggono l'utente da auth.uid();
-- * le operazioni con effetti su più righe o su altri utenti passano da funzioni SQL
--   che controllano i permessi, così interfaccia e API seguono le stesse regole.

-- ---------------------------------------------------------------------------
-- Studi
-- ---------------------------------------------------------------------------
create table public.studi (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 200),
  -- dati anagrafici dello studio
  ragione_sociale text,
  partita_iva text,
  codice_fiscale text,
  indirizzo text,
  telefono text,
  email text,
  pec text,
  -- impostazioni (solo admin)
  visibilita text not null default 'solo_propri'
    check (visibilita in ('solo_propri', 'studio_lettura', 'studio_completo')),
  creazione_compiti text not null default 'solo_admin'
    check (creazione_compiti in ('solo_admin', 'per_se', 'tutti')),
  soglia_ritardo_iva_mesi integer not null default 2 check (soglia_ritardo_iva_mesi between 0 and 36),
  soglia_ritardo_prima_nota_mesi integer not null default 2 check (soglia_ritardo_prima_nota_mesi between 0 and 36),
  -- lettura automatica delle email: spenta finché non sono chiusi i punti della sezione 16.5
  lettura_email_attiva boolean not null default false,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

comment on column public.studi.lettura_email_attiva is
  'Sezione 16.5: resta spenta per gli studi esterni finché non sono chiuse verifica Google, parere su Statuto dei lavoratori e privacy.';

-- ---------------------------------------------------------------------------
-- Utenti (persone e agenti). Per le persone id = auth.users.id.
-- ---------------------------------------------------------------------------
create table public.utenti (
  id uuid primary key,
  studio_id uuid not null references public.studi(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 100),
  cognome text not null default '' check (length(cognome) <= 100),
  email text not null,
  ruolo text not null check (ruolo in ('admin', 'collaboratore', 'agente')),
  attivo boolean not null default true,
  ultimo_accesso timestamptz,
  -- quando l'utente ha visto (o rimandato) la schermata "Collega la tua email"
  onboarding_email_il timestamptz,
  -- quali email di notifica ricevere (sezione 8): chiave -> boolean
  preferenze_notifiche jsonb not null default '{}'::jsonb,
  -- solo per gli agenti (sezione 13.3): azione -> 'no' | 'si' | 'proposta'
  permessi_agente jsonb not null default '{}'::jsonb,
  descrizione text,
  creato_il timestamptz not null default now(),
  disattivato_il timestamptz
);

create unique index utenti_email_unica on public.utenti (lower(email)) where ruolo <> 'agente';
create index utenti_studio on public.utenti (studio_id);

-- ---------------------------------------------------------------------------
-- Funzioni di identità e permesso (usate dalle policy)
-- ---------------------------------------------------------------------------
create or replace function public.mio_studio() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.studio_id from public.utenti u where u.id = auth.uid() and u.attivo
$$;

create or replace function public.mio_ruolo() returns text
language sql stable security definer set search_path = '' as $$
  select u.ruolo from public.utenti u where u.id = auth.uid() and u.attivo
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.ruolo = 'admin' from public.utenti u where u.id = auth.uid() and u.attivo), false)
$$;

create or replace function public.e_agente() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.ruolo = 'agente' from public.utenti u where u.id = auth.uid() and u.attivo), false)
$$;

-- Lettura su tutto lo studio: admin, agente (sola lettura di base) e collaboratori
-- quando la visibilità è "tutto lo studio" (in lettura o completa).
create or replace function public.vede_tutto_lo_studio() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when u.ruolo in ('admin', 'agente') then true
      else s.visibilita in ('studio_lettura', 'studio_completo')
    end
    from public.utenti u join public.studi s on s.id = u.studio_id
    where u.id = auth.uid() and u.attivo
  ), false)
$$;

-- Modifica su tutto lo studio: admin, e collaboratori con "tutto lo studio, accesso completo".
-- Gli agenti non lavorano "su tutto": ogni scrittura passa da agente_puo().
create or replace function public.lavora_su_tutto_lo_studio() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when u.ruolo = 'admin' then true
      when u.ruolo = 'collaboratore' then s.visibilita = 'studio_completo'
      else false
    end
    from public.utenti u join public.studi s on s.id = u.studio_id
    where u.id = auth.uid() and u.attivo
  ), false)
$$;

-- Permesso di scrittura di un agente: 'si' = diretto. 'proposta' passa dalla coda (sezione 13.4).
create or replace function public.agente_puo(p_azione text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select u.permessi_agente ->> p_azione = 'si'
    from public.utenti u
    where u.id = auth.uid() and u.attivo and u.ruolo = 'agente'
  ), false)
$$;

-- Accessi tra colleghi: la tabella è definita più sotto, le funzioni la leggono a runtime.
create table public.accessi_colleghi (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  utente_id uuid not null references public.utenti(id) on delete cascade,      -- chi riceve l'accesso
  proprietario_id uuid not null references public.utenti(id) on delete cascade, -- di chi è lo spazio
  livello text not null check (livello in ('lettura', 'completa')),
  creato_da uuid references public.utenti(id),
  creato_il timestamptz not null default now(),
  unique (utente_id, proprietario_id),
  check (utente_id <> proprietario_id)
);
create index accessi_colleghi_utente on public.accessi_colleghi (utente_id);
create index accessi_colleghi_proprietario on public.accessi_colleghi (proprietario_id);

-- Spazi (utenti) di cui posso vedere clienti e compiti: il mio e quelli concessi.
create or replace function public.spazi_visibili() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.utenti u where u.id = auth.uid() and u.attivo
  union
  select a.proprietario_id
  from public.accessi_colleghi a
  join public.utenti u on u.id = a.utente_id
  where a.utente_id = auth.uid() and u.attivo and a.studio_id = u.studio_id
$$;

-- Spazi su cui posso lavorare: il mio e quelli concessi con livello "completa".
create or replace function public.spazi_lavorabili() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.utenti u where u.id = auth.uid() and u.attivo
  union
  select a.proprietario_id
  from public.accessi_colleghi a
  join public.utenti u on u.id = a.utente_id
  where a.utente_id = auth.uid() and u.attivo and a.livello = 'completa' and a.studio_id = u.studio_id
$$;

-- ---------------------------------------------------------------------------
-- Registro attività (audit log). Scrive solo tramite registra_attivita() o funzioni del sistema.
-- ---------------------------------------------------------------------------
create table public.registro_attivita (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  attore_id uuid references public.utenti(id) on delete set null,
  attore_ruolo text, -- admin | collaboratore | agente | sistema
  azione text not null,
  entita text,
  entita_id uuid,
  dettagli jsonb not null default '{}'::jsonb,
  annullabile boolean not null default false,
  annullato_il timestamptz,
  annullato_da uuid references public.utenti(id) on delete set null,
  creato_il timestamptz not null default now()
);
create index registro_studio_data on public.registro_attivita (studio_id, creato_il desc);
create index registro_attore on public.registro_attivita (attore_id, creato_il desc);

create or replace function public.registra_attivita(
  p_azione text, p_entita text default null, p_entita_id uuid default null,
  p_dettagli jsonb default '{}'::jsonb, p_annullabile boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_studio uuid := public.mio_studio();
begin
  if v_studio is null then
    raise exception 'Utente non attivo' using errcode = '42501';
  end if;
  insert into public.registro_attivita (studio_id, attore_id, attore_ruolo, azione, entita, entita_id, dettagli, annullabile)
  values (v_studio, auth.uid(), public.mio_ruolo(), p_azione, p_entita, p_entita_id, coalesce(p_dettagli, '{}'::jsonb), p_annullabile)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Inviti (link valido 7 giorni; nel database solo l'impronta SHA-256 del codice)
-- ---------------------------------------------------------------------------
create table public.inviti (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  email text not null,
  nome text not null,
  cognome text not null default '',
  ruolo text not null check (ruolo in ('admin', 'collaboratore')),
  codice_hash text not null unique,
  scade_il timestamptz not null,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'accettato', 'annullato')),
  email_inviata_il timestamptz,
  errore_invio text,
  creato_da uuid references public.utenti(id) on delete set null,
  creato_il timestamptz not null default now(),
  accettato_da uuid references public.utenti(id) on delete set null,
  accettato_il timestamptz
);
create index inviti_studio on public.inviti (studio_id, stato);
create unique index inviti_uno_in_attesa on public.inviti (studio_id, lower(email)) where stato = 'in_attesa';

-- ---------------------------------------------------------------------------
-- Vincolo: ogni studio ha sempre almeno un admin attivo
-- ---------------------------------------------------------------------------
create or replace function public.trg_ultimo_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.ruolo = 'admin' and old.attivo and (new.ruolo <> 'admin' or not new.attivo) then
    if not exists (
      select 1 from public.utenti u
      where u.studio_id = old.studio_id and u.id <> old.id and u.ruolo = 'admin' and u.attivo
    ) then
      raise exception 'Lo studio deve avere sempre almeno un admin attivo' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger utenti_ultimo_admin before update of ruolo, attivo on public.utenti
  for each row execute function public.trg_ultimo_admin();

-- Registro dei cambi di impostazioni dello studio (visibilità, chi crea compiti, soglie, email)
create or replace function public.trg_studi_impostazioni() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_campo text;
  v_prima jsonb := to_jsonb(old);
  v_dopo jsonb := to_jsonb(new);
begin
  new.aggiornato_il := now();
  foreach v_campo in array array['visibilita', 'creazione_compiti', 'soglia_ritardo_iva_mesi',
    'soglia_ritardo_prima_nota_mesi', 'lettura_email_attiva', 'nome'] loop
    if v_prima -> v_campo is distinct from v_dopo -> v_campo then
      insert into public.registro_attivita (studio_id, attore_id, attore_ruolo, azione, entita, entita_id, dettagli)
      values (new.id, auth.uid(), public.mio_ruolo(), 'impostazione_modificata', 'studio', new.id,
        jsonb_build_object('campo', v_campo, 'prima', v_prima -> v_campo, 'dopo', v_dopo -> v_campo));
    end if;
  end loop;
  return new;
end $$;

create trigger studi_impostazioni before update on public.studi
  for each row execute function public.trg_studi_impostazioni();

-- ---------------------------------------------------------------------------
-- Operazioni su studio e utenti
-- ---------------------------------------------------------------------------

-- Crea lo studio per l'utente appena confermato (registrazione con email o Google).
create or replace function public.registra_studio(p_nome_studio text, p_nome text, p_cognome text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_email text := lower(auth.email());
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  if exists (select 1 from public.utenti where id = auth.uid()) then
    raise exception 'Questo account appartiene già a uno studio' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.utenti where lower(email) = v_email and ruolo <> 'agente') then
    raise exception 'Questo indirizzo email è già usato in uno studio' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_nome_studio, ''))) = 0 or length(trim(coalesce(p_nome, ''))) = 0 then
    raise exception 'Nome dello studio e nome sono obbligatori' using errcode = '22023';
  end if;

  insert into public.studi (nome) values (trim(p_nome_studio)) returning id into v_studio;
  insert into public.utenti (id, studio_id, nome, cognome, email, ruolo, ultimo_accesso)
  values (auth.uid(), v_studio, trim(p_nome), trim(coalesce(p_cognome, '')), v_email, 'admin', now());
  insert into public.registro_attivita (studio_id, attore_id, attore_ruolo, azione, entita, entita_id)
  values (v_studio, auth.uid(), 'admin', 'studio_registrato', 'studio', v_studio);
  return v_studio;
end $$;

-- Informazioni pubbliche di un invito (per la pagina del link, anche senza accesso).
create or replace function public.info_invito(p_codice_hash text)
returns table (id uuid, studio_nome text, email text, nome text, cognome text, ruolo text, stato text, scaduto boolean)
language sql stable security definer set search_path = '' as $$
  select i.id, s.nome, i.email, i.nome, i.cognome, i.ruolo, i.stato, i.scade_il < now()
  from public.inviti i join public.studi s on s.id = i.studio_id
  where i.codice_hash = p_codice_hash
$$;

create or replace function public.crea_invito(
  p_email text, p_nome text, p_cognome text, p_ruolo text, p_codice_hash text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono invitare' using errcode = '42501';
  end if;
  if p_ruolo not in ('admin', 'collaboratore') then
    raise exception 'Ruolo non valido' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Indirizzo email non valido' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_nome, ''))) = 0 then
    raise exception 'Il nome è obbligatorio' using errcode = '22023';
  end if;
  if exists (select 1 from public.utenti u where lower(u.email) = v_email and u.ruolo <> 'agente') then
    raise exception 'Questo indirizzo ha già un account in uno studio' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.inviti i where i.studio_id = public.mio_studio()
             and lower(i.email) = v_email and i.stato = 'in_attesa') then
    raise exception 'C''è già un invito in attesa per questo indirizzo: puoi rinviarlo' using errcode = 'P0001';
  end if;

  insert into public.inviti (studio_id, email, nome, cognome, ruolo, codice_hash, scade_il, creato_da)
  values (public.mio_studio(), v_email, trim(p_nome), trim(coalesce(p_cognome, '')), p_ruolo,
          p_codice_hash, now() + interval '7 days', auth.uid())
  returning id into v_id;

  perform public.registra_attivita('invito_creato', 'invito', v_id,
    jsonb_build_object('email', v_email, 'ruolo', p_ruolo));
  return v_id;
end $$;

create or replace function public.rinnova_invito(p_id uuid, p_codice_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono rinviare gli inviti' using errcode = '42501';
  end if;
  update public.inviti
     set codice_hash = p_codice_hash, scade_il = now() + interval '7 days',
         email_inviata_il = null, errore_invio = null
   where id = p_id and studio_id = public.mio_studio() and stato = 'in_attesa';
  if not found then
    raise exception 'Invito non trovato o non più in attesa' using errcode = 'P0002';
  end if;
  perform public.registra_attivita('invito_rinnovato', 'invito', p_id);
end $$;

create or replace function public.segna_invio_invito(p_id uuid, p_ok boolean, p_errore text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_admin() then
    raise exception 'Operazione riservata agli admin' using errcode = '42501';
  end if;
  update public.inviti
     set email_inviata_il = case when p_ok then now() else null end,
         errore_invio = case when p_ok then null else left(p_errore, 500) end
   where id = p_id and studio_id = public.mio_studio();
end $$;

create or replace function public.annulla_invito(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono annullare gli inviti' using errcode = '42501';
  end if;
  update public.inviti set stato = 'annullato'
   where id = p_id and studio_id = public.mio_studio() and stato = 'in_attesa';
  if not found then
    raise exception 'Invito non trovato o non più in attesa' using errcode = 'P0002';
  end if;
  perform public.registra_attivita('invito_annullato', 'invito', p_id);
end $$;

-- Accetta l'invito: l'utente autenticato deve avere la stessa email dell'invito.
create or replace function public.accetta_invito(p_codice_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invito public.inviti%rowtype;
  v_email text := lower(auth.email());
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  select * into v_invito from public.inviti where codice_hash = p_codice_hash for update;
  if not found or v_invito.stato <> 'in_attesa' then
    raise exception 'Invito non valido o già usato' using errcode = 'P0002';
  end if;
  if v_invito.scade_il < now() then
    raise exception 'Il link di invito è scaduto: chiedi all''admin di rinviarlo' using errcode = 'P0001';
  end if;
  if lower(v_invito.email) <> v_email then
    raise exception 'Questo invito è per un altro indirizzo email' using errcode = '42501';
  end if;
  if exists (select 1 from public.utenti where id = auth.uid()) then
    raise exception 'Questo account appartiene già a uno studio' using errcode = 'P0001';
  end if;

  insert into public.utenti (id, studio_id, nome, cognome, email, ruolo, ultimo_accesso)
  values (auth.uid(), v_invito.studio_id, v_invito.nome, v_invito.cognome, v_email, v_invito.ruolo, now());
  update public.inviti set stato = 'accettato', accettato_da = auth.uid(), accettato_il = now()
   where id = v_invito.id;
  insert into public.registro_attivita (studio_id, attore_id, attore_ruolo, azione, entita, entita_id, dettagli)
  values (v_invito.studio_id, auth.uid(), v_invito.ruolo, 'invito_accettato', 'invito', v_invito.id,
          jsonb_build_object('email', v_email));
  return v_invito.studio_id;
end $$;

create or replace function public.cambia_ruolo_utente(p_utente uuid, p_ruolo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_prima text;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono cambiare i ruoli' using errcode = '42501';
  end if;
  if p_ruolo not in ('admin', 'collaboratore') then
    raise exception 'Ruolo non valido' using errcode = '22023';
  end if;
  select ruolo into v_prima from public.utenti
   where id = p_utente and studio_id = public.mio_studio() and ruolo <> 'agente';
  if not found then
    raise exception 'Utente non trovato' using errcode = 'P0002';
  end if;
  update public.utenti set ruolo = p_ruolo where id = p_utente;
  if p_ruolo = 'admin' then
    -- gli admin vedono già tutto: gli accessi tra colleghi ricevuti non servono più
    delete from public.accessi_colleghi where utente_id = p_utente;
  end if;
  perform public.registra_attivita('ruolo_modificato', 'utente', p_utente,
    jsonb_build_object('prima', v_prima, 'dopo', p_ruolo));
end $$;

create or replace function public.imposta_utente_attivo(p_utente uuid, p_attivo boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono disattivare o riattivare utenti' using errcode = '42501';
  end if;
  update public.utenti
     set attivo = p_attivo,
         disattivato_il = case when p_attivo then null else now() end
   where id = p_utente and studio_id = public.mio_studio();
  if not found then
    raise exception 'Utente non trovato' using errcode = 'P0002';
  end if;
  if not p_attivo then
    -- un utente disattivato perde gli accessi ricevuti (sezione 3)
    delete from public.accessi_colleghi where utente_id = p_utente;
  end if;
  perform public.registra_attivita(case when p_attivo then 'utente_riattivato' else 'utente_disattivato' end,
    'utente', p_utente);
end $$;

create or replace function public.concedi_accesso_collega(p_utente uuid, p_proprietario uuid, p_livello text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_studio uuid := public.mio_studio();
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono concedere accessi' using errcode = '42501';
  end if;
  if p_livello not in ('lettura', 'completa') then
    raise exception 'Livello non valido' using errcode = '22023';
  end if;
  if p_utente = p_proprietario then
    raise exception 'Scegli due persone diverse' using errcode = '22023';
  end if;
  if not exists (select 1 from public.utenti where id = p_utente and studio_id = v_studio
                 and ruolo = 'collaboratore' and attivo) then
    raise exception 'L''accesso si concede solo a collaboratori attivi dello studio' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.utenti where id = p_proprietario and studio_id = v_studio
                 and ruolo in ('collaboratore', 'admin')) then
    raise exception 'Collega non trovato' using errcode = 'P0002';
  end if;

  insert into public.accessi_colleghi (studio_id, utente_id, proprietario_id, livello, creato_da)
  values (v_studio, p_utente, p_proprietario, p_livello, auth.uid())
  on conflict (utente_id, proprietario_id) do update set livello = excluded.livello, creato_da = excluded.creato_da, creato_il = now()
  returning id into v_id;

  perform public.registra_attivita('accesso_concesso', 'accesso_collega', v_id,
    jsonb_build_object('utente_id', p_utente, 'proprietario_id', p_proprietario, 'livello', p_livello));
  return v_id;
end $$;

create or replace function public.revoca_accesso_collega(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_riga public.accessi_colleghi%rowtype;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono togliere accessi' using errcode = '42501';
  end if;
  delete from public.accessi_colleghi where id = p_id and studio_id = public.mio_studio()
  returning * into v_riga;
  if not found then
    raise exception 'Accesso non trovato' using errcode = 'P0002';
  end if;
  perform public.registra_attivita('accesso_revocato', 'accesso_collega', p_id,
    jsonb_build_object('utente_id', v_riga.utente_id, 'proprietario_id', v_riga.proprietario_id, 'livello', v_riga.livello));
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.studi enable row level security;
alter table public.utenti enable row level security;
alter table public.accessi_colleghi enable row level security;
alter table public.registro_attivita enable row level security;
alter table public.inviti enable row level security;

create policy studi_lettura on public.studi for select to authenticated
  using (id = (select public.mio_studio()));
create policy studi_modifica_admin on public.studi for update to authenticated
  using (id = (select public.mio_studio()) and (select public.e_admin()))
  with check (id = (select public.mio_studio()) and (select public.e_admin()));

-- Tutti vedono i colleghi del proprio studio (nomi e ruoli servono per assegnare compiti).
create policy utenti_lettura on public.utenti for select to authenticated
  using (studio_id = (select public.mio_studio()));
-- Ognuno modifica solo i propri dati personali (colonne limitate dai grant).
create policy utenti_modifica_se on public.utenti for update to authenticated
  using (id = auth.uid() and attivo) with check (id = auth.uid() and attivo);

-- Accessi tra colleghi: l'admin vede tutto; B vede chi ha accesso al suo spazio; A vede i propri.
create policy accessi_lettura on public.accessi_colleghi for select to authenticated
  using (studio_id = (select public.mio_studio())
         and ((select public.e_admin()) or utente_id = auth.uid() or proprietario_id = auth.uid()));

create policy registro_lettura_admin on public.registro_attivita for select to authenticated
  using (studio_id = (select public.mio_studio()) and (select public.e_admin()));

create policy inviti_lettura_admin on public.inviti for select to authenticated
  using (studio_id = (select public.mio_studio()) and (select public.e_admin()));

-- ---------------------------------------------------------------------------
-- Privilegi: niente a anon; a authenticated solo il necessario (le righe le filtra RLS)
-- ---------------------------------------------------------------------------
revoke all on public.studi, public.utenti, public.accessi_colleghi, public.registro_attivita, public.inviti from anon;
revoke all on public.studi, public.utenti, public.accessi_colleghi, public.registro_attivita, public.inviti from authenticated;

grant select on public.studi to authenticated;
grant update (nome, ragione_sociale, partita_iva, codice_fiscale, indirizzo, telefono, email, pec,
  visibilita, creazione_compiti, soglia_ritardo_iva_mesi, soglia_ritardo_prima_nota_mesi, lettura_email_attiva)
  on public.studi to authenticated;
grant select on public.utenti to authenticated;
grant update (nome, cognome, onboarding_email_il, preferenze_notifiche, ultimo_accesso) on public.utenti to authenticated;
grant select on public.accessi_colleghi to authenticated;
grant select on public.registro_attivita to authenticated;
grant select (id, studio_id, email, nome, cognome, ruolo, scade_il, stato, email_inviata_il, errore_invio,
  creato_da, creato_il, accettato_da, accettato_il) on public.inviti to authenticated;
