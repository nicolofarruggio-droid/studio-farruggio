-- Migrazione 20: area "Studio" (traguardi T1/T5) — traccia delle email di notifica.
--
-- Le email delle notifiche dell'app si segnano in notifiche.email_inviata_il. Le email che non
-- nascono da una riga di `notifiche` (nuovi commenti e riepilogo giornaliero delle scadenze,
-- sezione 8) si tracciano qui, una riga per destinatario, così nessuna parte due volte anche se
-- il processo pianificato gira più volte o in parallelo (vincolo unique = "prenotazione").
--
-- La tabella la scrive e la legge solo il processo del server (cron, comeSistema): nessun grant
-- a anon/authenticated e RLS attiva senza policy, quindi dall'interfaccia e dalle API non si vede.

create table public.email_notifiche (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  utente_id uuid not null references public.utenti(id) on delete cascade,   -- destinatario
  tipo text not null check (tipo in ('commento', 'riepilogo_scadenze')),
  -- id del commento, oppure il giorno del riepilogo ("AAAA-MM-GG", ora italiana)
  riferimento text not null check (length(riferimento) between 1 and 100),
  compito_id uuid references public.compiti(id) on delete cascade,
  esito text not null default 'in_corso' check (esito in ('in_corso', 'inviata', 'saltata', 'errore')),
  errore text check (errore is null or length(errore) <= 500),
  creato_il timestamptz not null default now(),
  inviata_il timestamptz,
  unique (utente_id, tipo, riferimento)
);
create index email_notifiche_studio on public.email_notifiche (studio_id, creato_il desc);

-- Destinatario e compito devono essere dello stesso studio della riga (difesa in profondità).
create or replace function public.trg_email_notifiche_studio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.utenti u where u.id = new.utente_id and u.studio_id = new.studio_id) then
    raise exception 'Destinatario e studio non corrispondono' using errcode = '42501';
  end if;
  if new.compito_id is not null
     and not exists (select 1 from public.compiti k where k.id = new.compito_id and k.studio_id = new.studio_id) then
    raise exception 'Compito e studio non corrispondono' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger email_notifiche_studio before insert or update on public.email_notifiche
  for each row execute function public.trg_email_notifiche_studio();

alter table public.email_notifiche enable row level security;
revoke all on public.email_notifiche from anon, authenticated;

-- Funzione interna del trigger: nessuno la chiama direttamente (su Supabase i grant predefiniti
-- delle funzioni includono anon e authenticated, quindi si tolgono esplicitamente).
revoke execute on function public.trg_email_notifiche_studio() from public, anon, authenticated;

-- Il processo delle email cerca i commenti degli ultimi giorni in tutti gli studi.
create index if not exists commenti_recenti on public.compiti_commenti (creato_il);
