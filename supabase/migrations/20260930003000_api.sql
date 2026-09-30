-- Migrazione: API per gli agenti AI (sezione 13, traguardo T6).
-- * limiti di frequenza per token con contatore atomico e avviso agli admin;
-- * annullamento delle azioni degli agenti nel registro attività (solo admin);
-- * coda di proposte: anche la modifica dei campi di un compito, controlli sui dati.

-- ---------------------------------------------------------------------------
-- Limiti di frequenza (tabella api_uso, finestra di un minuto)
-- ---------------------------------------------------------------------------
-- Conta una richiesta del token nel minuto corrente e dice se è entro il limite. Aggiorna anche
-- l'ultimo uso del token. Se il limite è superato avvisa gli admin dello studio con una notifica
-- di tipo 'agente', al massimo una all'ora per agente. La chiama solo il server (nessun grant).
create or replace function public.api_registra_uso(p_token uuid, p_scrittura boolean, p_limite integer)
returns table (consentito boolean, conteggio integer, riprova_tra integer, avviso_inviato boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_minuto timestamptz := date_trunc('minute', now());
  v_n integer;
  v_agente uuid;
  v_studio uuid;
  v_nome text;
  v_admin uuid;
begin
  if p_limite is null or p_limite < 1 then
    raise exception 'Limite non valido' using errcode = '22023';
  end if;
  update public.agenti_token set ultimo_uso_il = now()
   where id = p_token
  returning agente_id, studio_id into v_agente, v_studio;
  if not found then
    raise exception 'Token non trovato' using errcode = 'P0002';
  end if;

  insert into public.api_uso as u (token_id, minuto, letture, scritture)
  values (p_token, v_minuto, case when p_scrittura then 0 else 1 end, case when p_scrittura then 1 else 0 end)
  on conflict (token_id, minuto) do update
    set letture = u.letture + case when p_scrittura then 0 else 1 end,
        scritture = u.scritture + case when p_scrittura then 1 else 0 end
  returning case when p_scrittura then u.scritture else u.letture end into v_n;

  consentito := v_n <= p_limite;
  conteggio := v_n;
  riprova_tra := greatest(1, ceil(extract(epoch from (v_minuto + interval '1 minute' - now())))::integer);
  avviso_inviato := false;

  if not consentito then
    -- una sola notifica all'ora per agente, anche con richieste in parallelo
    perform pg_advisory_xact_lock(hashtextextended('api_avviso:' || v_agente::text, 0));
    if not exists (select 1 from public.notifiche n
                   where n.tipo = 'agente' and n.autore_id = v_agente and n.creata_il > now() - interval '1 hour') then
      select trim(u.nome || ' ' || u.cognome) into v_nome from public.utenti u where u.id = v_agente;
      for v_admin in select id from public.utenti where studio_id = v_studio and ruolo = 'admin' and attivo loop
        insert into public.notifiche (studio_id, utente_id, tipo, autore_id, testo)
        values (v_studio, v_admin, 'agente', v_agente,
                'L''agente ' || coalesce(v_nome, '') || ' ha superato il limite di ' || p_limite ||
                case when p_scrittura then ' scritture' else ' letture' end ||
                ' al minuto: le richieste in più vengono rifiutate. Controlla le sue azioni in Studio → Agenti AI e API.');
      end loop;
      avviso_inviato := true;
    end if;
  end if;

  -- pulizia dei contatori vecchi (di rado, non serve a ogni richiesta)
  if random() < 0.01 then
    delete from public.api_uso where minuto < now() - interval '1 day';
  end if;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- Annullamento delle azioni degli agenti (sezione 13.4)
-- ---------------------------------------------------------------------------
-- Segna come annullata una riga annullabile del registro attività. La modifica vera (ripristino
-- dell'indicatore, annullamento del compito…) la fa l'admin nella stessa transazione, con le
-- funzioni di sempre: questa funzione blocca la riga, così due admin non annullano due volte.
create or replace function public.segna_attivita_annullata(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_riga public.registro_attivita%rowtype;
begin
  if not public.e_admin() then
    raise exception 'Solo gli admin possono annullare le azioni degli agenti' using errcode = '42501';
  end if;
  update public.registro_attivita
     set annullato_il = now(), annullato_da = auth.uid()
   where id = p_id and studio_id = public.mio_studio() and annullabile and annullato_il is null
  returning * into v_riga;
  if not found then
    raise exception 'Azione non trovata, non annullabile o già annullata' using errcode = 'P0002';
  end if;
  perform public.registra_attivita('azione_annullata', v_riga.entita, v_riga.entita_id,
    jsonb_build_object('attivita_id', v_riga.id, 'azione', v_riga.azione, 'attore_id', v_riga.attore_id,
                       'attore_ruolo', v_riga.attore_ruolo));
  return jsonb_build_object('azione', v_riga.azione, 'entita', v_riga.entita, 'entita_id', v_riga.entita_id,
                            'dettagli', v_riga.dettagli, 'creato_il', v_riga.creato_il);
end $$;

-- ---------------------------------------------------------------------------
-- Coda di proposte: stessa funzione della migrazione degli agenti, con in più la modifica dei
-- campi di un compito (permesso "aggiorna_compiti") e controlli sui dati proposti.
-- ---------------------------------------------------------------------------
create or replace function public.crea_proposta_agente(p_azione text, p_dati jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_permesso text;
  v_admin uuid;
  v_etichetta text;
begin
  if not public.e_agente() then
    raise exception 'Solo gli agenti creano proposte' using errcode = '42501';
  end if;
  select permessi_agente ->> (case p_azione
      when 'crea_compito' then 'crea_compiti'
      when 'aggiorna_indicatore' then 'aggiorna_indicatori'
      when 'cambia_stato_compito' then 'aggiorna_compiti'
      when 'modifica_compito' then 'aggiorna_compiti'
      when 'commenta' then 'commenta'
      else '-' end)
    into v_permesso from public.utenti where id = auth.uid();
  if v_permesso is distinct from 'proposta' then
    raise exception 'Questa azione non è abilitata in modalità proposta' using errcode = '42501';
  end if;
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' or length(p_dati::text) > 50000 then
    raise exception 'Dati della proposta non validi' using errcode = '22023';
  end if;
  if (select count(*) from public.proposte_agente
       where agente_id = auth.uid() and stato = 'in_attesa') >= 200 then
    raise exception 'Ci sono già 200 proposte in attesa: aspetta che un admin le esamini' using errcode = 'P0001';
  end if;
  insert into public.proposte_agente (studio_id, agente_id, azione, dati)
  values (public.mio_studio(), auth.uid(), p_azione, p_dati) returning id into v_id;
  perform public.registra_attivita('proposta_creata', 'proposta', v_id, jsonb_build_object('azione', p_azione));
  v_etichetta := case p_azione
    when 'crea_compito' then 'creare un compito'
    when 'aggiorna_indicatore' then 'aggiornare un indicatore'
    when 'cambia_stato_compito' then 'cambiare lo stato di un compito'
    when 'modifica_compito' then 'modificare un compito'
    when 'commenta' then 'commentare un compito'
  end;
  for v_admin in select id from public.utenti where studio_id = public.mio_studio() and ruolo = 'admin' and attivo loop
    insert into public.notifiche (studio_id, utente_id, tipo, autore_id, testo)
    values (public.mio_studio(), v_admin, 'proposta', auth.uid(),
            public.nome_utente(auth.uid()) || ' propone di ' || v_etichetta || ': approva o rifiuta in Studio → Agenti AI e API');
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Difesa in profondità: un agente cambia stato, campi o assegnatari di un compito solo con il
-- permesso "aggiorna_compiti" = 'si', e commenta solo con "commenta" = 'si', anche sui compiti che ha
-- creato lui (per i quali le funzioni dei compiti lo considerano "chi ha creato il compito").
-- Ogni cambio e ogni commento passano da compiti_eventi.
-- ---------------------------------------------------------------------------
create or replace function public.trg_eventi_compito_agente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.e_agente() then
    if new.tipo in ('stato', 'rimandato', 'riaperto', 'annullato', 'modificato', 'assegnatari')
       and not public.agente_puo('aggiorna_compiti') then
      raise exception 'L''agente non è abilitato ad aggiornare i compiti' using errcode = '42501';
    end if;
    if new.tipo = 'commento' and not public.agente_puo('commenta') then
      raise exception 'L''agente non è abilitato a commentare i compiti' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger compiti_eventi_agente before insert on public.compiti_eventi
  for each row execute function public.trg_eventi_compito_agente();

-- ---------------------------------------------------------------------------
-- Privilegi: api_registra_uso solo per il server; le altre controllano i permessi da sé.
-- ---------------------------------------------------------------------------
revoke execute on function public.api_registra_uso(uuid, boolean, integer) from public, anon, authenticated;
revoke execute on function public.segna_attivita_annullata(uuid) from public, anon;
grant execute on function public.segna_attivita_annullata(uuid) to authenticated;
revoke execute on function public.crea_proposta_agente(text, jsonb) from public, anon;
grant execute on function public.crea_proposta_agente(text, jsonb) to authenticated;
revoke execute on function public.trg_eventi_compito_agente() from public, anon, authenticated;
