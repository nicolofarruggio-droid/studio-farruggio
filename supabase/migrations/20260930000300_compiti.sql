-- Migrazione 3: compiti, assegnatari, documenti, commenti, cronologia, notifiche.

create table public.compiti (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  cliente_id uuid references public.clienti(id) on delete cascade, -- facoltativo: "Senza cliente"
  titolo text not null check (length(trim(titolo)) between 1 and 300),
  descrizione text not null default '' check (length(descrizione) <= 20000),
  creato_da uuid references public.utenti(id) on delete set null,
  scadenza timestamptz,                       -- null = "Senza scadenza"
  scadenza_con_orario boolean not null default false,
  priorita text not null default 'normale' check (priorita in ('normale', 'alta', 'urgente')),
  stato text not null default 'assegnato'
    check (stato in ('assegnato', 'in_lavorazione', 'pronto_revisione', 'completato', 'annullato')),
  completato_il timestamptz,
  completato_da uuid references public.utenti(id) on delete set null,
  annullato_il timestamptz,
  motivo_annullamento text,
  -- ultimo "rimanda indietro": resta in cima alla scheda finché il compito non è di nuovo pronto
  rimandato_motivo text,
  rimandato_da uuid references public.utenti(id) on delete set null,
  rimandato_il timestamptz,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create index compiti_studio_stato on public.compiti (studio_id, stato, scadenza);
create index compiti_cliente on public.compiti (cliente_id);
create index compiti_creato_da on public.compiti (creato_da);

create table public.compiti_assegnatari (
  compito_id uuid not null references public.compiti(id) on delete cascade,
  utente_id uuid not null references public.utenti(id) on delete cascade,
  studio_id uuid not null references public.studi(id) on delete cascade,
  assegnato_il timestamptz not null default now(),
  primary key (compito_id, utente_id)
);
create index assegnatari_utente on public.compiti_assegnatari (utente_id);

create table public.compiti_documenti (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  compito_id uuid not null references public.compiti(id) on delete cascade,
  nome_file text not null check (length(nome_file) between 1 and 255),
  tipo text not null,             -- MIME
  dimensione bigint not null check (dimensione >= 0),
  percorso text not null unique,  -- studio_id/compiti/compito_id/file_id
  caricato_da uuid references public.utenti(id) on delete set null,
  caricato_il timestamptz not null default now(),
  -- nessuna cancellazione dal gestionale; se si deciderà di permetterlo, solo "nascosto" con traccia (sezione 14)
  nascosto boolean not null default false,
  nascosto_da uuid references public.utenti(id) on delete set null,
  nascosto_il timestamptz
);
create index documenti_compito on public.compiti_documenti (compito_id, caricato_il);

create table public.compiti_commenti (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  compito_id uuid not null references public.compiti(id) on delete cascade,
  autore_id uuid references public.utenti(id) on delete set null,
  testo text not null check (length(trim(testo)) between 1 and 10000),
  creato_il timestamptz not null default now()
);
create index commenti_compito on public.compiti_commenti (compito_id, creato_il);

-- Cronologia completa del compito (stati, scadenza, file, commenti, assegnazioni).
create table public.compiti_eventi (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  compito_id uuid not null references public.compiti(id) on delete cascade,
  autore_id uuid references public.utenti(id) on delete set null,
  tipo text not null, -- creato | stato | rimandato | riaperto | annullato | modificato | assegnatari | documento | commento
  dati jsonb not null default '{}'::jsonb,
  creato_il timestamptz not null default now()
);
create index eventi_compito on public.compiti_eventi (compito_id, creato_il);

create table public.notifiche (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studi(id) on delete cascade,
  utente_id uuid not null references public.utenti(id) on delete cascade, -- destinatario
  tipo text not null check (tipo in ('assegnato', 'pronto', 'documenti', 'rimandato', 'casella', 'agente', 'proposta')),
  compito_id uuid references public.compiti(id) on delete cascade,
  autore_id uuid references public.utenti(id) on delete set null,
  testo text not null,
  motivo text,
  letta boolean not null default false,
  email_inviata_il timestamptz,
  creata_il timestamptz not null default now()
);
create index notifiche_utente on public.notifiche (utente_id, letta, creata_il desc);
create index notifiche_email_da_inviare on public.notifiche (creata_il) where email_inviata_il is null;

-- ---------------------------------------------------------------------------
-- Funzioni di permesso sui compiti
-- ---------------------------------------------------------------------------
create or replace function public.compito_aperto(p_stato text) returns boolean
language sql immutable as $$
  select p_stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')
$$;

create or replace function public.puo_vedere_compito(p_compito uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.id = p_compito and c.studio_id = public.mio_studio()
      and (c.cliente_id is null or public.cliente_dello_studio(c.cliente_id))
      and (public.vede_tutto_lo_studio()
           or c.creato_da = auth.uid()
           or exists (select 1 from public.compiti_assegnatari a
                      where a.compito_id = c.id and a.utente_id in (select public.spazi_visibili())))
  )
$$;

-- Lavorare sul compito (stato, documenti): admin, chi l'ha creato, chi è assegnato (o ha accesso
-- completo al suo spazio), collaboratori con "accesso completo", agente abilitato.
create or replace function public.puo_lavorare_compito(p_compito uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.id = p_compito and c.studio_id = public.mio_studio()
      and (c.cliente_id is null or public.cliente_dello_studio(c.cliente_id))
      and (public.lavora_su_tutto_lo_studio()
           or c.creato_da = auth.uid()
           or public.agente_puo('aggiorna_compiti')
           or exists (select 1 from public.compiti_assegnatari a
                      where a.compito_id = c.id and a.utente_id in (select public.spazi_lavorabili())))
  )
$$;

-- Controllare il compito (chiudere, rimandare indietro, riaprire, annullare): admin o chi l'ha creato.
create or replace function public.puo_controllare_compito(p_compito uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.id = p_compito and c.studio_id = public.mio_studio()
      and (public.e_admin() or c.creato_da = auth.uid())
  )
$$;

create or replace function public.puo_commentare_compito(p_compito uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.id = p_compito and c.studio_id = public.mio_studio()
      and (c.cliente_id is null or public.cliente_dello_studio(c.cliente_id))
      and (public.lavora_su_tutto_lo_studio()
           or c.creato_da = auth.uid()
           or public.agente_puo('commenta')
           or exists (select 1 from public.compiti_assegnatari a
                      where a.compito_id = c.id and a.utente_id in (select public.spazi_lavorabili())))
  )
$$;

-- "Chi può creare compiti" (sezione 5): la regola vive nel database.
create or replace function public.puo_creare_compito_per(p_assegnatario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when not exists (select 1 from public.utenti t where t.id = p_assegnatario and t.studio_id = me.studio_id
                       and t.attivo and t.ruolo in ('admin', 'collaboratore')) then false
      when me.ruolo = 'admin' then true
      when me.ruolo = 'agente' then coalesce(me.permessi_agente ->> 'crea_compiti' in ('si', 'proposta'), false)
      when s.creazione_compiti = 'tutti' then true
      when s.creazione_compiti = 'per_se' then p_assegnatario = me.id
      else false
    end
    from public.utenti me join public.studi s on s.id = me.studio_id
    where me.id = auth.uid() and me.attivo
  ), false)
$$;

-- Clienti visibili solo perché c'è un compito che li riguarda (si vede il nome del cliente).
create or replace function public.cliente_con_compito_visibile(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compiti c
    where c.cliente_id = p_cliente
      and (c.creato_da = auth.uid()
           or exists (select 1 from public.compiti_assegnatari a
                      where a.compito_id = c.id and a.utente_id in (select public.spazi_visibili())))
  )
$$;

drop policy clienti_lettura on public.clienti;
create policy clienti_lettura on public.clienti for select to authenticated
  using (studio_id = (select public.mio_studio()) and eliminato_il is null
         and ((select public.vede_tutto_lo_studio()) or public.cliente_assegnato_visibile(id)
              or public.cliente_con_compito_visibile(id)));

-- ---------------------------------------------------------------------------
-- Operazioni sui compiti (tutte controllano i permessi: valgono per interfaccia e API)
-- ---------------------------------------------------------------------------
create or replace function public.notifica(
  p_utente uuid, p_tipo text, p_compito uuid, p_testo text, p_motivo text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- nessuno riceve notifiche per le proprie azioni
  if p_utente is null or p_utente = auth.uid() then
    return;
  end if;
  insert into public.notifiche (studio_id, utente_id, tipo, compito_id, autore_id, testo, motivo)
  select u.studio_id, u.id, p_tipo, p_compito, auth.uid(), p_testo, p_motivo
  from public.utenti u where u.id = p_utente and u.attivo;
end $$;
revoke all on function public.notifica(uuid, text, uuid, text, text) from public;

create or replace function public.nome_utente(p_utente uuid) returns text
language sql stable security definer set search_path = '' as $$
  select trim(u.nome || ' ' || u.cognome) from public.utenti u where u.id = p_utente
$$;

create or replace function public.crea_compito(
  p_titolo text,
  p_descrizione text,
  p_cliente uuid,
  p_assegnatari uuid[],
  p_scadenza timestamptz,
  p_scadenza_con_orario boolean,
  p_priorita text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid := public.mio_studio();
  v_id uuid;
  v_utente uuid;
  v_autore text := public.nome_utente(auth.uid());
begin
  if v_studio is null then
    raise exception 'Utente non attivo' using errcode = '42501';
  end if;
  if coalesce(array_length(p_assegnatari, 1), 0) = 0 then
    raise exception 'Scegli a chi assegnare il compito' using errcode = '22023';
  end if;
  if public.e_agente() and not public.agente_puo('crea_compiti') then
    raise exception 'L''agente non è abilitato a creare compiti' using errcode = '42501';
  end if;
  foreach v_utente in array p_assegnatari loop
    if not public.puo_creare_compito_per(v_utente) then
      raise exception 'Non puoi assegnare compiti a questa persona' using errcode = '42501';
    end if;
  end loop;
  if p_cliente is not null and not public.puo_vedere_cliente(p_cliente) then
    raise exception 'Cliente non trovato' using errcode = 'P0002';
  end if;
  if coalesce(p_priorita, 'normale') not in ('normale', 'alta', 'urgente') then
    raise exception 'Priorità non valida' using errcode = '22023';
  end if;

  insert into public.compiti (studio_id, cliente_id, titolo, descrizione, creato_da, scadenza, scadenza_con_orario, priorita)
  values (v_studio, p_cliente, trim(p_titolo), coalesce(p_descrizione, ''), auth.uid(), p_scadenza,
          coalesce(p_scadenza_con_orario, false) and p_scadenza is not null, coalesce(p_priorita, 'normale'))
  returning id into v_id;

  insert into public.compiti_assegnatari (compito_id, utente_id, studio_id)
  select v_id, x, v_studio from unnest(p_assegnatari) as x group by x;

  insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
  values (v_studio, v_id, auth.uid(), 'creato',
          jsonb_build_object('assegnatari', to_jsonb(p_assegnatari), 'scadenza', p_scadenza, 'priorita', p_priorita));

  foreach v_utente in array p_assegnatari loop
    perform public.notifica(v_utente, 'assegnato', v_id, v_autore || ' ti ha assegnato: ' || trim(p_titolo));
  end loop;
  return v_id;
end $$;

create or replace function public.modifica_compito(
  p_compito uuid,
  p_titolo text,
  p_descrizione text,
  p_cliente uuid,
  p_scadenza timestamptz,
  p_scadenza_con_orario boolean,
  p_priorita text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_prima public.compiti%rowtype;
  v_modifiche jsonb := '{}'::jsonb;
begin
  if not public.puo_controllare_compito(p_compito) then
    raise exception 'Solo un admin o chi ha creato il compito può modificarlo' using errcode = '42501';
  end if;
  select * into v_prima from public.compiti where id = p_compito for update;
  if p_cliente is not null and p_cliente is distinct from v_prima.cliente_id and not public.puo_vedere_cliente(p_cliente) then
    raise exception 'Cliente non trovato' using errcode = 'P0002';
  end if;
  if coalesce(p_priorita, 'normale') not in ('normale', 'alta', 'urgente') then
    raise exception 'Priorità non valida' using errcode = '22023';
  end if;

  if v_prima.titolo is distinct from trim(p_titolo) then
    v_modifiche := v_modifiche || jsonb_build_object('titolo', jsonb_build_object('prima', v_prima.titolo, 'dopo', trim(p_titolo)));
  end if;
  if v_prima.descrizione is distinct from coalesce(p_descrizione, '') then
    v_modifiche := v_modifiche || jsonb_build_object('descrizione', true);
  end if;
  if v_prima.cliente_id is distinct from p_cliente then
    v_modifiche := v_modifiche || jsonb_build_object('cliente', jsonb_build_object('prima', v_prima.cliente_id, 'dopo', p_cliente));
  end if;
  if v_prima.scadenza is distinct from p_scadenza or v_prima.scadenza_con_orario is distinct from coalesce(p_scadenza_con_orario, false) then
    v_modifiche := v_modifiche || jsonb_build_object('scadenza', jsonb_build_object('prima', v_prima.scadenza, 'dopo', p_scadenza,
      'con_orario', coalesce(p_scadenza_con_orario, false) and p_scadenza is not null));
  end if;
  if v_prima.priorita is distinct from coalesce(p_priorita, 'normale') then
    v_modifiche := v_modifiche || jsonb_build_object('priorita', jsonb_build_object('prima', v_prima.priorita, 'dopo', p_priorita));
  end if;
  if v_modifiche = '{}'::jsonb then
    return;
  end if;

  update public.compiti
     set titolo = trim(p_titolo), descrizione = coalesce(p_descrizione, ''), cliente_id = p_cliente,
         scadenza = p_scadenza, scadenza_con_orario = coalesce(p_scadenza_con_orario, false) and p_scadenza is not null,
         priorita = coalesce(p_priorita, 'normale'), aggiornato_il = now()
   where id = p_compito;
  insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
  values (v_prima.studio_id, p_compito, auth.uid(), 'modificato', v_modifiche);
end $$;

create or replace function public.riassegna_compito(p_compito uuid, p_assegnatari uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_compito public.compiti%rowtype;
  v_prima uuid[];
  v_utente uuid;
begin
  if not public.puo_controllare_compito(p_compito) then
    raise exception 'Solo un admin o chi ha creato il compito può riassegnarlo' using errcode = '42501';
  end if;
  if coalesce(array_length(p_assegnatari, 1), 0) = 0 then
    raise exception 'Scegli a chi assegnare il compito' using errcode = '22023';
  end if;
  foreach v_utente in array p_assegnatari loop
    if not public.puo_creare_compito_per(v_utente) then
      raise exception 'Non puoi assegnare compiti a questa persona' using errcode = '42501';
    end if;
  end loop;
  select * into v_compito from public.compiti where id = p_compito for update;
  select coalesce(array_agg(utente_id), '{}') into v_prima from public.compiti_assegnatari where compito_id = p_compito;

  delete from public.compiti_assegnatari where compito_id = p_compito and not (utente_id = any(p_assegnatari));
  insert into public.compiti_assegnatari (compito_id, utente_id, studio_id)
  select p_compito, x, v_compito.studio_id from unnest(p_assegnatari) as x
  on conflict do nothing;

  insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
  values (v_compito.studio_id, p_compito, auth.uid(), 'assegnatari',
          jsonb_build_object('prima', to_jsonb(v_prima), 'dopo', to_jsonb(p_assegnatari)));

  foreach v_utente in array p_assegnatari loop
    if not (v_utente = any(v_prima)) then
      perform public.notifica(v_utente, 'assegnato', p_compito,
        public.nome_utente(auth.uid()) || ' ti ha assegnato: ' || v_compito.titolo);
    end if;
  end loop;
end $$;

-- Cambio di stato secondo il flusso: assegnato → in lavorazione → pronto per revisione → completato.
create or replace function public.cambia_stato_compito(p_compito uuid, p_stato text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.compiti%rowtype;
  v_controllore boolean;
  v_lavoratore boolean;
  v_autore text := public.nome_utente(auth.uid());
  v_utente uuid;
begin
  select * into v_c from public.compiti where id = p_compito and studio_id = public.mio_studio() for update;
  if not found or not public.puo_vedere_compito(p_compito) then
    raise exception 'Compito non trovato' using errcode = 'P0002';
  end if;
  v_controllore := public.puo_controllare_compito(p_compito);
  v_lavoratore := public.puo_lavorare_compito(p_compito);

  if p_stato = v_c.stato then
    return;
  end if;

  if p_stato in ('in_lavorazione', 'pronto_revisione') and public.compito_aperto(v_c.stato) then
    if not (v_lavoratore or v_controllore) then
      raise exception 'Non puoi cambiare lo stato di questo compito' using errcode = '42501';
    end if;
    update public.compiti
       set stato = p_stato, aggiornato_il = now(),
           rimandato_motivo = case when p_stato = 'pronto_revisione' then null else rimandato_motivo end,
           rimandato_da = case when p_stato = 'pronto_revisione' then null else rimandato_da end,
           rimandato_il = case when p_stato = 'pronto_revisione' then null else rimandato_il end
     where id = p_compito;
    insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
    values (v_c.studio_id, p_compito, auth.uid(), 'stato', jsonb_build_object('prima', v_c.stato, 'dopo', p_stato));
    if p_stato = 'pronto_revisione' then
      perform public.notifica(v_c.creato_da, 'pronto', p_compito,
        v_autore || ' ha segnato pronto per revisione: ' || v_c.titolo);
    end if;

  elsif p_stato = 'assegnato' and public.compito_aperto(v_c.stato) then
    if not (v_lavoratore or v_controllore) then
      raise exception 'Non puoi cambiare lo stato di questo compito' using errcode = '42501';
    end if;
    update public.compiti set stato = p_stato, aggiornato_il = now() where id = p_compito;
    insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
    values (v_c.studio_id, p_compito, auth.uid(), 'stato', jsonb_build_object('prima', v_c.stato, 'dopo', p_stato));

  elsif p_stato = 'completato' and public.compito_aperto(v_c.stato) then
    if not v_controllore then
      raise exception 'Solo un admin o chi ha creato il compito può chiuderlo dopo il controllo' using errcode = '42501';
    end if;
    update public.compiti
       set stato = 'completato', completato_il = now(), completato_da = auth.uid(), aggiornato_il = now(),
           rimandato_motivo = null, rimandato_da = null, rimandato_il = null
     where id = p_compito;
    insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
    values (v_c.studio_id, p_compito, auth.uid(), 'stato', jsonb_build_object('prima', v_c.stato, 'dopo', 'completato'));

  elsif p_stato = 'annullato' and public.compito_aperto(v_c.stato) then
    if not v_controllore then
      raise exception 'Solo un admin o chi ha creato il compito può annullarlo' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_motivo, ''))) = 0 then
      raise exception 'Scrivi il motivo dell''annullamento' using errcode = '22023';
    end if;
    update public.compiti
       set stato = 'annullato', annullato_il = now(), motivo_annullamento = trim(p_motivo), aggiornato_il = now()
     where id = p_compito;
    insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
    values (v_c.studio_id, p_compito, auth.uid(), 'annullato',
            jsonb_build_object('prima', v_c.stato, 'motivo', trim(p_motivo)));

  elsif p_stato = 'in_lavorazione' and not public.compito_aperto(v_c.stato) then
    -- riapertura di un compito completato o annullato
    if not v_controllore then
      raise exception 'Solo un admin o chi ha creato il compito può riaprirlo' using errcode = '42501';
    end if;
    update public.compiti
       set stato = 'in_lavorazione', completato_il = null, completato_da = null,
           annullato_il = null, motivo_annullamento = null, aggiornato_il = now()
     where id = p_compito;
    insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
    values (v_c.studio_id, p_compito, auth.uid(), 'riaperto',
            jsonb_build_object('prima', v_c.stato, 'motivo', nullif(trim(coalesce(p_motivo, '')), '')));
  else
    raise exception 'Passaggio di stato non consentito' using errcode = '22023';
  end if;
end $$;

-- "Rimanda indietro" un compito pronto per revisione, con la spiegazione (sezione 8).
create or replace function public.rimanda_indietro_compito(p_compito uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.compiti%rowtype;
  v_utente uuid;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not public.puo_controllare_compito(p_compito) then
    raise exception 'Solo un admin o chi ha creato il compito può rimandarlo indietro' using errcode = '42501';
  end if;
  select * into v_c from public.compiti where id = p_compito for update;
  if v_c.stato <> 'pronto_revisione' then
    raise exception 'Si può rimandare indietro solo un compito pronto per revisione' using errcode = '22023';
  end if;
  update public.compiti
     set stato = 'in_lavorazione', rimandato_motivo = coalesce(v_motivo, ''), rimandato_da = auth.uid(),
         rimandato_il = now(), aggiornato_il = now()
   where id = p_compito;
  insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
  values (v_c.studio_id, p_compito, auth.uid(), 'rimandato', jsonb_build_object('motivo', v_motivo));
  for v_utente in select utente_id from public.compiti_assegnatari where compito_id = p_compito loop
    perform public.notifica(v_utente, 'rimandato', p_compito,
      public.nome_utente(auth.uid()) || ' ha rimandato indietro: ' || v_c.titolo, v_motivo);
  end loop;
end $$;

create or replace function public.aggiungi_commento(p_compito uuid, p_testo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_studio uuid := public.mio_studio();
begin
  if not public.puo_commentare_compito(p_compito) then
    raise exception 'Non puoi commentare questo compito' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_testo, ''))) = 0 then
    raise exception 'Il commento è vuoto' using errcode = '22023';
  end if;
  insert into public.compiti_commenti (studio_id, compito_id, autore_id, testo)
  values (v_studio, p_compito, auth.uid(), trim(p_testo)) returning id into v_id;
  insert into public.compiti_eventi (studio_id, compito_id, autore_id, tipo, dati)
  values (v_studio, p_compito, auth.uid(), 'commento', jsonb_build_object('commento_id', v_id));
  return v_id;
end $$;

-- Registra un documento già caricato nello spazio file (il percorso lo decide il server).
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
  if not (public.puo_lavorare_compito(p_compito) or public.puo_controllare_compito(p_compito))
     or (public.e_agente() and not public.agente_puo('carica_documenti')) then
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

-- Una sola notifica per un gruppo di file caricati insieme.
create or replace function public.notifica_documenti(p_compito uuid, p_numero integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.compiti%rowtype;
  v_utente uuid;
  v_testo text;
begin
  if not public.puo_vedere_compito(p_compito) then
    raise exception 'Compito non trovato' using errcode = 'P0002';
  end if;
  select * into v_c from public.compiti where id = p_compito;
  v_testo := public.nome_utente(auth.uid()) || ' ha caricato ' ||
    case when p_numero = 1 then 'un documento' else p_numero || ' documenti' end || ' in: ' || v_c.titolo;
  for v_utente in
    select v_c.creato_da union select utente_id from public.compiti_assegnatari where compito_id = p_compito
  loop
    perform public.notifica(v_utente, 'documenti', p_compito, v_testo);
  end loop;
end $$;

create or replace function public.segna_notifiche_lette(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifiche set letta = true
   where utente_id = auth.uid() and not letta and (p_ids is null or id = any(p_ids))
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.compiti enable row level security;
alter table public.compiti_assegnatari enable row level security;
alter table public.compiti_documenti enable row level security;
alter table public.compiti_commenti enable row level security;
alter table public.compiti_eventi enable row level security;
alter table public.notifiche enable row level security;

create policy compiti_lettura on public.compiti for select to authenticated
  using (public.puo_vedere_compito(id));
create policy assegnatari_lettura on public.compiti_assegnatari for select to authenticated
  using (public.puo_vedere_compito(compito_id));
-- I documenti restano sempre consultabili da chi vede il compito, anche a compito chiuso.
create policy documenti_lettura on public.compiti_documenti for select to authenticated
  using (public.puo_vedere_compito(compito_id) and not nascosto);
create policy commenti_lettura on public.compiti_commenti for select to authenticated
  using (public.puo_vedere_compito(compito_id));
create policy eventi_lettura on public.compiti_eventi for select to authenticated
  using (public.puo_vedere_compito(compito_id));
create policy notifiche_lettura on public.notifiche for select to authenticated
  using (utente_id = auth.uid() and studio_id = (select public.mio_studio()));
create policy notifiche_letta on public.notifiche for update to authenticated
  using (utente_id = auth.uid() and studio_id = (select public.mio_studio()))
  with check (utente_id = auth.uid());

-- Scritture solo tramite le funzioni sopra: nessun insert/update/delete diretto.
revoke all on public.compiti, public.compiti_assegnatari, public.compiti_documenti, public.compiti_commenti,
  public.compiti_eventi, public.notifiche from anon, authenticated;
grant select on public.compiti, public.compiti_assegnatari, public.compiti_documenti, public.compiti_commenti,
  public.compiti_eventi, public.notifiche to authenticated;
grant update (letta) on public.notifiche to authenticated;
