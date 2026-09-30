-- Migrazione 4: caselle email in sola lettura, controlli, email elaborate, registro delle chiamate AI.

create table public.caselle_email (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  utente_id uuid not null unique references public.utenti(id) on delete cascade,
  fornitore text not null default 'gmail' check (fornitore in ('gmail', 'microsoft')),
  indirizzo text,
  stato text not null default 'non_collegata' check (stato in ('collegata', 'non_collegata', 'da_ricollegare')),
  -- deve essere solo https://www.googleapis.com/auth/gmail.readonly (sezione 16.2)
  permesso text,
  collegata_il timestamptz,
  ultimo_controllo timestamptz,
  cursore text, -- historyId di Gmail: parte dal momento del consenso
  ultimo_errore text,
  creato_il timestamptz not null default now()
);
create index caselle_da_controllare on public.caselle_email (stato, ultimo_controllo) where stato = 'collegata';

-- Token cifrati in una tabella separata: nessun privilegio a anon/authenticated,
-- non leggibile da interfaccia, API pubbliche o AI. La legge solo il processo di sincronizzazione.
create table public.caselle_email_token (
  casella_id uuid primary key references public.caselle_email(id) on delete cascade,
  token_cifrato text not null,
  aggiornato_il timestamptz not null default now()
);

create table public.controlli_email (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  casella_id uuid not null references public.caselle_email(id) on delete cascade,
  eseguito_il timestamptz not null default now(),
  email_nuove integer not null default 0,
  associate integer not null default 0,
  ignorate integer not null default 0,
  errori integer not null default 0
);
create index controlli_casella on public.controlli_email (casella_id, eseguito_il desc);

-- Solo per non rielaborare la stessa email: nessun testo, oggetto o mittente.
create table public.email_elaborate (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  casella_id uuid not null references public.caselle_email(id) on delete cascade,
  gmail_id text not null,
  message_id text,
  esito text not null check (esito in ('associata', 'ignorata', 'in_attesa', 'da_rielaborare')),
  clienti uuid[] not null default '{}',
  elaborata_il timestamptz not null default now(),
  unique (casella_id, gmail_id)
);
create index email_elaborate_esito on public.email_elaborate (casella_id, esito, elaborata_il desc);

create table public.ai_richieste (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  utente_id uuid references public.utenti(id) on delete set null,
  funzione text not null check (funzione in ('importazione', 'riassunto_email', 'riassunto_incollato')),
  modello text not null,
  token_ingresso integer not null default 0,
  token_uscita integer not null default 0,
  costo_stimato numeric(12, 6) not null default 0, -- dollari
  esito text not null, -- ok | errore | interrotta
  durata_ms integer,
  creato_il timestamptz not null default now()
);
create index ai_richieste_studio on public.ai_richieste (studio_id, creato_il desc);

create or replace function public.registra_ai(
  p_funzione text, p_modello text, p_token_ingresso integer, p_token_uscita integer,
  p_costo numeric, p_esito text, p_durata_ms integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.mio_studio() is null then
    raise exception 'Utente non attivo' using errcode = '42501';
  end if;
  insert into public.ai_richieste (studio_id, utente_id, funzione, modello, token_ingresso, token_uscita, costo_stimato, esito, durata_ms)
  values (public.mio_studio(), auth.uid(), p_funzione, p_modello, coalesce(p_token_ingresso, 0), coalesce(p_token_uscita, 0),
          coalesce(p_costo, 0), p_esito, p_durata_ms);
end $$;

alter table public.caselle_email enable row level security;
alter table public.caselle_email_token enable row level security;
alter table public.controlli_email enable row level security;
alter table public.email_elaborate enable row level security;
alter table public.ai_richieste enable row level security;

-- La casella la vede il proprietario; l'admin vede solo se è collegata (colonne limitate dai grant).
create policy caselle_lettura on public.caselle_email for select to authenticated
  using (studio_id = (select public.mio_studio()) and (utente_id = auth.uid() or (select public.e_admin())));
create policy controlli_lettura on public.controlli_email for select to authenticated
  using (studio_id = (select public.mio_studio())
         and exists (select 1 from public.caselle_email c where c.id = casella_id and c.utente_id = auth.uid()));
create policy email_elaborate_lettura on public.email_elaborate for select to authenticated
  using (studio_id = (select public.mio_studio())
         and exists (select 1 from public.caselle_email c where c.id = casella_id and c.utente_id = auth.uid()));
create policy ai_lettura_admin on public.ai_richieste for select to authenticated
  using (studio_id = (select public.mio_studio()) and (select public.e_admin()));

revoke all on public.caselle_email, public.caselle_email_token, public.controlli_email, public.email_elaborate,
  public.ai_richieste from anon, authenticated;
grant select (id, studio_id, utente_id, fornitore, indirizzo, stato, collegata_il, ultimo_controllo, ultimo_errore)
  on public.caselle_email to authenticated;
grant select on public.controlli_email, public.email_elaborate, public.ai_richieste to authenticated;
