-- Migrazione: lettura delle email in sola lettura (sezione 16.2–16.5), completamenti allo schema della migrazione 4.

-- Controllo in corso: impedisce che il processo pianificato e "Controlla ora" elaborino la stessa casella
-- insieme (si considera abbandonato dopo 15 minuti). Nessun grant: serve solo al processo del server.
alter table public.caselle_email add column if not exists controllo_in_corso_dal timestamptz;

-- Tentativi non riusciti (Gmail o AI): dopo 5 l'email non viene più riproposta a ogni controllo.
-- È solo un numero: nessun contenuto.
alter table public.email_elaborate add column if not exists tentativi smallint not null default 0;
create index if not exists email_elaborate_da_fare on public.email_elaborate (casella_id, elaborata_il)
  where esito in ('in_attesa', 'da_rielaborare');

-- Mittente non riconosciuto che è un cliente (sezione 16.3, punto 8): dopo aver aggiunto l'indirizzo al cliente
-- (con le regole RLS di clienti_email), l'utente segna le email ignorate di quel mittente da rielaborare.
-- Tocca solo le email della PROPRIA casella; l'identificativo Gmail arriva dalla pagina "La mia email",
-- che legge le intestazioni dal vivo. Al controllo successivo il cliente viene riconosciuto di nuovo
-- con l'indirizzo esatto: un identificativo sbagliato torna semplicemente "ignorata".
create or replace function public.segna_email_da_rielaborare(p_gmail_ids text[], p_cliente uuid, p_indirizzo text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_casella uuid;
  v_indirizzo text := lower(trim(coalesce(p_indirizzo, '')));
  v_n integer;
begin
  if public.mio_studio() is null then
    raise exception 'Utente non attivo' using errcode = '42501';
  end if;
  if not public.puo_lavorare_cliente(p_cliente) then
    raise exception 'Non puoi collegare indirizzi a questo cliente' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clienti_email e where e.cliente_id = p_cliente and e.indirizzo = v_indirizzo) then
    raise exception 'L''indirizzo non è tra quelli del cliente' using errcode = 'P0001';
  end if;
  select c.id into v_casella from public.caselle_email c
   where c.utente_id = auth.uid() and c.studio_id = public.mio_studio();
  if v_casella is null then
    raise exception 'La tua casella email non è collegata' using errcode = 'P0002';
  end if;
  update public.email_elaborate
     set esito = 'da_rielaborare', tentativi = 0, elaborata_il = now()
   where casella_id = v_casella and esito = 'ignorata'
     and gmail_id = any(coalesce(p_gmail_ids, '{}'::text[]));
  get diagnostics v_n = row_count;
  perform public.registra_attivita('mittente_collegato', 'cliente', p_cliente,
    jsonb_build_object('indirizzo', v_indirizzo, 'email_da_rielaborare', v_n));
  return v_n;
end $$;

revoke execute on function public.segna_email_da_rielaborare(text[], uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.segna_email_da_rielaborare(text[], uuid, text) from anon';
  end if;
end $$;
grant execute on function public.segna_email_da_rielaborare(text[], uuid, text) to authenticated;
