-- Migrazione 2: clienti, titolari, indirizzi email, assegnazioni, indicatori contabili, comunicazioni.

create table public.clienti (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  ragione_sociale text not null check (length(trim(ragione_sociale)) between 1 and 300),
  -- nome unico e stabile (sezione 6): servirà per nominare i file e associare le comunicazioni
  nome_visualizzazione text not null check (length(trim(nome_visualizzazione)) between 1 and 400),
  telefono text,
  codice_fiscale text,
  partita_iva text,
  numero_dipendenti integer check (numero_dipendenti is null or numero_dipendenti >= 0),
  fatturato numeric(16, 2) check (fatturato is null or fatturato >= 0),
  note text,
  stato text not null default 'attivo' check (stato in ('attivo', 'archiviato')),
  alias text[] not null default '{}',
  creato_da uuid references public.utenti(id) on delete set null,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  -- cestino: i clienti eliminati restano recuperabili per 30 giorni (proposta, sezione 14)
  eliminato_il timestamptz,
  eliminato_da uuid references public.utenti(id) on delete set null
);
create unique index clienti_nome_visualizzazione on public.clienti (studio_id, lower(nome_visualizzazione));
create index clienti_studio on public.clienti (studio_id) where eliminato_il is null;
create index clienti_piva on public.clienti (studio_id, partita_iva) where partita_iva is not null;

create table public.clienti_titolari (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  cliente_id uuid not null references public.clienti(id) on delete cascade,
  nome text not null default '',
  cognome text not null default '',
  principale boolean not null default false,
  ordine integer not null default 0,
  check (length(trim(nome || cognome)) > 0)
);
create index titolari_cliente on public.clienti_titolari (cliente_id, ordine);
create index titolari_nome on public.clienti_titolari (studio_id, lower(cognome), lower(nome));

create table public.clienti_email (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  cliente_id uuid not null references public.clienti(id) on delete cascade,
  indirizzo text not null check (indirizzo = lower(trim(indirizzo)) and indirizzo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  tipo text not null default 'ordinaria' check (tipo in ('ordinaria', 'pec')),
  creato_da uuid references public.utenti(id) on delete set null,
  creato_il timestamptz not null default now(),
  unique (cliente_id, indirizzo)
);
-- serve a riconoscere il mittente delle email (sezione 16.3)
create index clienti_email_indirizzo on public.clienti_email (studio_id, indirizzo);

create table public.assegnazioni (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  cliente_id uuid not null references public.clienti(id) on delete cascade,
  utente_id uuid not null references public.utenti(id) on delete cascade,
  referente_principale boolean not null default false,
  dal timestamptz not null default now(),
  al timestamptz,
  assegnato_da uuid references public.utenti(id) on delete set null,
  rimosso_da uuid references public.utenti(id) on delete set null,
  check (al is null or al >= dal)
);
create unique index assegnazioni_attiva on public.assegnazioni (cliente_id, utente_id) where al is null;
create unique index assegnazioni_un_referente on public.assegnazioni (cliente_id) where al is null and referente_principale;
create index assegnazioni_utente on public.assegnazioni (utente_id) where al is null;

create table public.aggiornamenti_contabili (
  studio_id uuid not null references public.studi(id) on delete cascade,
  cliente_id uuid not null references public.clienti(id) on delete cascade,
  tipo text not null check (tipo in ('iva', 'prima_nota')),
  aggiornato_fino_al date,
  non_applicabile boolean not null default false,
  aggiornato_da uuid references public.utenti(id) on delete set null,
  aggiornato_il timestamptz not null default now(),
  primary key (cliente_id, tipo)
);

create table public.aggiornamenti_storico (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  cliente_id uuid not null references public.clienti(id) on delete cascade,
  tipo text not null check (tipo in ('iva', 'prima_nota')),
  valore_precedente date,
  valore_nuovo date,
  na_precedente boolean,
  na_nuovo boolean,
  origine text not null default 'manuale', -- manuale | importazione | agente | annullamento
  modificato_da uuid references public.utenti(id) on delete set null,
  modificato_il timestamptz not null default now()
);
create index storico_cliente on public.aggiornamenti_storico (cliente_id, modificato_il desc);

create table public.comunicazioni (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  cliente_id uuid not null references public.clienti(id) on delete cascade,
  data timestamptz not null,
  canale text not null check (canale in ('email', 'telefono', 'incontro', 'whatsapp', 'altro')),
  testo text not null check (length(testo) between 1 and 20000),
  fonte text not null check (fonte in ('manuale', 'email_automatica', 'email_incollata')),
  autore_id uuid references public.utenti(id) on delete set null, -- chi l'ha scritta o proprietario della casella
  casella_id uuid,
  mittente text,
  oggetto text,
  allegati text[] not null default '{}',
  conversazione text,        -- thread_id di Gmail
  numero_messaggio integer,  -- posizione del messaggio nella conversazione
  message_id text,           -- per non creare doppioni
  creato_il timestamptz not null default now()
);
create index comunicazioni_cliente on public.comunicazioni (cliente_id, data desc);
create unique index comunicazioni_message_id on public.comunicazioni (studio_id, cliente_id, message_id) where message_id is not null;
create index comunicazioni_conversazione on public.comunicazioni (cliente_id, conversazione) where conversazione is not null;

-- ---------------------------------------------------------------------------
-- Funzioni di permesso sui clienti
-- ---------------------------------------------------------------------------

-- Cliente non eliminato e dello studio dell'utente.
create or replace function public.cliente_dello_studio(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clienti c
                 where c.id = p_cliente and c.studio_id = public.mio_studio() and c.eliminato_il is null)
$$;

-- Cliente assegnato a me o a un collega del cui spazio ho accesso.
create or replace function public.cliente_assegnato_visibile(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assegnazioni a
                 where a.cliente_id = p_cliente and a.al is null
                   and a.utente_id in (select public.spazi_visibili()))
$$;

-- Vista completa del cliente (anagrafica, indicatori, comunicazioni, email).
create or replace function public.puo_vedere_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.cliente_dello_studio(p_cliente)
     and (public.vede_tutto_lo_studio() or public.cliente_assegnato_visibile(p_cliente))
$$;

-- Lavoro sul cliente (indicatori, comunicazioni, indirizzi email).
create or replace function public.puo_lavorare_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.cliente_dello_studio(p_cliente) and (
    public.lavora_su_tutto_lo_studio()
    or exists (select 1 from public.assegnazioni a
               where a.cliente_id = p_cliente and a.al is null
                 and a.utente_id in (select public.spazi_lavorabili()))
  )
$$;

-- Aggiornare gli indicatori: chi lavora sul cliente, oppure un agente abilitato.
create or replace function public.puo_aggiornare_indicatori(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.puo_lavorare_cliente(p_cliente)
      or (public.agente_puo('aggiorna_indicatori') and public.cliente_dello_studio(p_cliente))
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
create or replace function public.trg_aggiornato_il() returns trigger
language plpgsql as $$
begin
  new.aggiornato_il := now();
  return new;
end $$;

create trigger clienti_aggiornato before update on public.clienti
  for each row execute function public.trg_aggiornato_il();

-- Storico degli indicatori: ogni modifica registra chi, quando, valore prima e dopo (sezione 7).
create or replace function public.trg_aggiornamenti_storico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_origine text := coalesce(nullif(current_setting('app.origine', true), ''),
                             case when public.e_agente() then 'agente' else 'manuale' end);
begin
  new.aggiornato_il := now();
  new.aggiornato_da := coalesce(auth.uid(), new.aggiornato_da);
  if tg_op = 'UPDATE' then
    if old.aggiornato_fino_al is not distinct from new.aggiornato_fino_al
       and old.non_applicabile = new.non_applicabile then
      return new;
    end if;
    insert into public.aggiornamenti_storico (studio_id, cliente_id, tipo, valore_precedente, valore_nuovo,
      na_precedente, na_nuovo, origine, modificato_da)
    values (new.studio_id, new.cliente_id, new.tipo, old.aggiornato_fino_al, new.aggiornato_fino_al,
      old.non_applicabile, new.non_applicabile, v_origine, new.aggiornato_da);
  else
    -- con "insert ... on conflict do update" il trigger BEFORE INSERT scatta anche quando la riga
    -- esiste già: in quel caso lo storico lo scrive il trigger BEFORE UPDATE
    if exists (select 1 from public.aggiornamenti_contabili a where a.cliente_id = new.cliente_id and a.tipo = new.tipo) then
      return new;
    end if;
    insert into public.aggiornamenti_storico (studio_id, cliente_id, tipo, valore_precedente, valore_nuovo,
      na_precedente, na_nuovo, origine, modificato_da)
    values (new.studio_id, new.cliente_id, new.tipo, null, new.aggiornato_fino_al,
      null, new.non_applicabile, v_origine, new.aggiornato_da);
  end if;
  return new;
end $$;

create trigger aggiornamenti_storico before insert or update on public.aggiornamenti_contabili
  for each row execute function public.trg_aggiornamenti_storico();

-- Coerenza di studio_id tra righe figlie e cliente (difesa in profondità).
create or replace function public.trg_studio_del_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clienti c where c.id = new.cliente_id and c.studio_id = new.studio_id) then
    raise exception 'Cliente e studio non corrispondono' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger titolari_studio before insert or update on public.clienti_titolari
  for each row execute function public.trg_studio_del_cliente();
create trigger clienti_email_studio before insert or update on public.clienti_email
  for each row execute function public.trg_studio_del_cliente();
create trigger assegnazioni_studio before insert or update on public.assegnazioni
  for each row execute function public.trg_studio_del_cliente();
create trigger aggiornamenti_studio before insert or update on public.aggiornamenti_contabili
  for each row execute function public.trg_studio_del_cliente();
create trigger comunicazioni_studio before insert or update on public.comunicazioni
  for each row execute function public.trg_studio_del_cliente();

-- L'assegnatario deve essere un collaboratore o admin dello stesso studio.
create or replace function public.trg_assegnazione_utente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.utenti u where u.id = new.utente_id and u.studio_id = new.studio_id
                 and u.ruolo in ('admin', 'collaboratore')) then
    raise exception 'Si possono assegnare clienti solo a persone dello studio' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger assegnazioni_utente before insert on public.assegnazioni
  for each row execute function public.trg_assegnazione_utente();

-- ---------------------------------------------------------------------------
-- Operazioni sui clienti
-- ---------------------------------------------------------------------------

-- Assegna (o riassegna) il referente principale di più clienti. Conserva lo storico.
create or replace function public.assegna_referente(p_clienti uuid[], p_utente uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid := public.mio_studio();
  v_cliente uuid;
  v_n integer := 0;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono assegnare i clienti' using errcode = '42501';
  end if;
  if p_utente is not null and not exists (
    select 1 from public.utenti where id = p_utente and studio_id = v_studio and attivo and ruolo in ('admin', 'collaboratore')
  ) then
    raise exception 'Collaboratore non trovato o non attivo' using errcode = 'P0002';
  end if;

  foreach v_cliente in array p_clienti loop
    if not public.cliente_dello_studio(v_cliente) then
      raise exception 'Cliente non trovato' using errcode = 'P0002';
    end if;
    -- chiude il referente attuale (se diverso)
    update public.assegnazioni set al = now(), rimosso_da = auth.uid()
     where cliente_id = v_cliente and al is null and referente_principale
       and (p_utente is null or utente_id <> p_utente);
    if p_utente is not null then
      -- se era già assegnato come collaboratore aggiuntivo, diventa referente
      update public.assegnazioni set referente_principale = true
       where cliente_id = v_cliente and utente_id = p_utente and al is null;
      if not found then
        insert into public.assegnazioni (studio_id, cliente_id, utente_id, referente_principale, assegnato_da)
        values (v_studio, v_cliente, p_utente, true, auth.uid());
      end if;
    end if;
    v_n := v_n + 1;
  end loop;

  perform public.registra_attivita('clienti_assegnati', 'utente', p_utente,
    jsonb_build_object('clienti', to_jsonb(p_clienti), 'numero', v_n));
  return v_n;
end $$;

-- Aggiunge o toglie un collaboratore aggiuntivo (il modello è molti-a-molti).
create or replace function public.imposta_collaboratore_aggiuntivo(p_cliente uuid, p_utente uuid, p_assegnato boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid := public.mio_studio();
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono assegnare i clienti' using errcode = '42501';
  end if;
  if not public.cliente_dello_studio(p_cliente) then
    raise exception 'Cliente non trovato' using errcode = 'P0002';
  end if;
  if p_assegnato then
    if not exists (select 1 from public.assegnazioni where cliente_id = p_cliente and utente_id = p_utente and al is null) then
      insert into public.assegnazioni (studio_id, cliente_id, utente_id, referente_principale, assegnato_da)
      values (v_studio, p_cliente, p_utente, false, auth.uid());
    end if;
  else
    update public.assegnazioni set al = now(), rimosso_da = auth.uid()
     where cliente_id = p_cliente and utente_id = p_utente and al is null;
  end if;
  perform public.registra_attivita(case when p_assegnato then 'collaboratore_aggiunto' else 'collaboratore_tolto' end,
    'cliente', p_cliente, jsonb_build_object('utente_id', p_utente));
end $$;

-- Imposta un indicatore (IVA o prima nota). Passa dalle regole RLS dell'utente.
create or replace function public.imposta_indicatore(
  p_cliente uuid, p_tipo text, p_data date, p_non_applicabile boolean default false
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_tipo not in ('iva', 'prima_nota') then
    raise exception 'Tipo di aggiornamento non valido' using errcode = '22023';
  end if;
  if not public.puo_aggiornare_indicatori(p_cliente) then
    raise exception 'Non puoi aggiornare questo cliente' using errcode = '42501';
  end if;
  insert into public.aggiornamenti_contabili (studio_id, cliente_id, tipo, aggiornato_fino_al, non_applicabile)
  values (public.mio_studio(), p_cliente, p_tipo, p_data, coalesce(p_non_applicabile, false))
  on conflict (cliente_id, tipo) do update
    set aggiornato_fino_al = excluded.aggiornato_fino_al, non_applicabile = excluded.non_applicabile;
end $$;

-- Sposta i clienti nel cestino (recuperabili per 30 giorni).
create or replace function public.elimina_clienti(p_clienti uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_nomi jsonb;
  v_n integer;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono eliminare i clienti' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(nome_visualizzazione), '[]'::jsonb) into v_nomi from public.clienti
   where id = any(p_clienti) and studio_id = public.mio_studio() and eliminato_il is null;
  update public.clienti set eliminato_il = now(), eliminato_da = auth.uid()
   where id = any(p_clienti) and studio_id = public.mio_studio() and eliminato_il is null;
  get diagnostics v_n = row_count;
  perform public.registra_attivita('clienti_eliminati', 'cliente', null,
    jsonb_build_object('clienti', to_jsonb(p_clienti), 'nomi', v_nomi, 'numero', v_n));
  return v_n;
end $$;

create or replace function public.ripristina_cliente(p_cliente uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono ripristinare i clienti' using errcode = '42501';
  end if;
  update public.clienti set eliminato_il = null, eliminato_da = null
   where id = p_cliente and studio_id = public.mio_studio() and eliminato_il is not null;
  if not found then
    raise exception 'Cliente non trovato nel cestino' using errcode = 'P0002';
  end if;
  perform public.registra_attivita('cliente_ripristinato', 'cliente', p_cliente);
end $$;

create or replace function public.clienti_nel_cestino()
returns table (id uuid, nome_visualizzazione text, eliminato_il timestamptz, eliminato_da uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.nome_visualizzazione, c.eliminato_il, c.eliminato_da
  from public.clienti c
  where public.e_admin() and c.studio_id = public.mio_studio() and c.eliminato_il is not null
  order by c.eliminato_il desc
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.clienti enable row level security;
alter table public.clienti_titolari enable row level security;
alter table public.clienti_email enable row level security;
alter table public.assegnazioni enable row level security;
alter table public.aggiornamenti_contabili enable row level security;
alter table public.aggiornamenti_storico enable row level security;
alter table public.comunicazioni enable row level security;

-- La policy di lettura dei clienti è completata nella migrazione dei compiti
-- (chi ha un compito su un cliente ne vede il nome). Usa le colonne della riga e non
-- rilegge la tabella, così vale anche per "insert ... returning".
create policy clienti_lettura on public.clienti for select to authenticated
  using (studio_id = (select public.mio_studio()) and eliminato_il is null
         and ((select public.vede_tutto_lo_studio()) or public.cliente_assegnato_visibile(id)));
create policy clienti_inserimento_admin on public.clienti for insert to authenticated
  with check (studio_id = (select public.mio_studio()) and (select public.e_admin()));
create policy clienti_modifica_admin on public.clienti for update to authenticated
  using (studio_id = (select public.mio_studio()) and (select public.e_admin()) and eliminato_il is null)
  with check (studio_id = (select public.mio_studio()) and (select public.e_admin()));

create policy titolari_lettura on public.clienti_titolari for select to authenticated
  using (exists (select 1 from public.clienti c where c.id = cliente_id));
create policy titolari_scrittura_admin on public.clienti_titolari for all to authenticated
  using (studio_id = (select public.mio_studio()) and (select public.e_admin()))
  with check (studio_id = (select public.mio_studio()) and (select public.e_admin()));

create policy clienti_email_lettura on public.clienti_email for select to authenticated
  using (public.puo_vedere_cliente(cliente_id));
create policy clienti_email_inserimento on public.clienti_email for insert to authenticated
  with check (studio_id = (select public.mio_studio()) and public.puo_lavorare_cliente(cliente_id));
create policy clienti_email_eliminazione on public.clienti_email for delete to authenticated
  using (studio_id = (select public.mio_studio()) and public.puo_lavorare_cliente(cliente_id));

create policy assegnazioni_lettura on public.assegnazioni for select to authenticated
  using (studio_id = (select public.mio_studio())
         and ((select public.vede_tutto_lo_studio()) or utente_id = auth.uid() or public.puo_vedere_cliente(cliente_id)));

create policy aggiornamenti_lettura on public.aggiornamenti_contabili for select to authenticated
  using (public.puo_vedere_cliente(cliente_id));
create policy aggiornamenti_inserimento on public.aggiornamenti_contabili for insert to authenticated
  with check (studio_id = (select public.mio_studio()) and public.puo_aggiornare_indicatori(cliente_id));
create policy aggiornamenti_modifica on public.aggiornamenti_contabili for update to authenticated
  using (public.puo_aggiornare_indicatori(cliente_id))
  with check (studio_id = (select public.mio_studio()) and public.puo_aggiornare_indicatori(cliente_id));

create policy storico_lettura on public.aggiornamenti_storico for select to authenticated
  using (public.puo_vedere_cliente(cliente_id));

create policy comunicazioni_lettura on public.comunicazioni for select to authenticated
  using (public.puo_vedere_cliente(cliente_id));
-- Inserimento manuale o email incollata: admin e chi lavora sul cliente, sempre a proprio nome.
create policy comunicazioni_inserimento on public.comunicazioni for insert to authenticated
  with check (studio_id = (select public.mio_studio())
              and public.puo_lavorare_cliente(cliente_id)
              and autore_id = auth.uid()
              and fonte in ('manuale', 'email_incollata')
              and message_id is null and casella_id is null);

revoke all on public.clienti, public.clienti_titolari, public.clienti_email, public.assegnazioni,
  public.aggiornamenti_contabili, public.aggiornamenti_storico, public.comunicazioni from anon, authenticated;

grant select, insert on public.clienti to authenticated;
grant update (ragione_sociale, nome_visualizzazione, telefono, codice_fiscale, partita_iva, numero_dipendenti,
  fatturato, note, stato, alias) on public.clienti to authenticated;
grant select, insert, update, delete on public.clienti_titolari to authenticated;
grant select, insert, delete on public.clienti_email to authenticated;
grant select on public.assegnazioni to authenticated;
grant select, insert, update (aggiornato_fino_al, non_applicabile) on public.aggiornamenti_contabili to authenticated;
grant select on public.aggiornamenti_storico to authenticated;
grant select, insert on public.comunicazioni to authenticated;
