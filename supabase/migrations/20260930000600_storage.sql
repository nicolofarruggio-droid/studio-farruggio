-- Migrazione 6: spazio file privato per i documenti dei compiti (Supabase Storage, Francoforte).
-- Percorso: studio_id/compiti/compito_id/file_id. Il bucket è privato: i file si aprono solo con link
-- temporanei creati dal server dopo il controllo dei permessi. Le policy qui sotto sono una
-- seconda difesa: impediscono comunque l'accesso incrociato tra studi.
-- Eseguita solo dove esiste lo schema storage (Supabase); in locale e nei test viene saltata.

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    raise notice 'Schema storage assente: bucket e policy dei documenti saltati';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('documenti', 'documenti', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

  -- Lettura: solo file di compiti che l'utente può vedere.
  execute $p$
    create policy documenti_lettura on storage.objects for select to authenticated
    using (
      bucket_id = 'documenti'
      and (storage.foldername(name))[1] = public.mio_studio()::text
      and (storage.foldername(name))[2] = 'compiti'
      and public.puo_vedere_compito(((storage.foldername(name))[3])::uuid)
    )
  $p$;

  -- Caricamento: solo su compiti aperti su cui l'utente può lavorare.
  execute $p$
    create policy documenti_caricamento on storage.objects for insert to authenticated
    with check (
      bucket_id = 'documenti'
      and (storage.foldername(name))[1] = public.mio_studio()::text
      and (storage.foldername(name))[2] = 'compiti'
      and (public.puo_lavorare_compito(((storage.foldername(name))[3])::uuid)
           or public.puo_controllare_compito(((storage.foldername(name))[3])::uuid))
    )
  $p$;
  -- Nessuna policy di update o delete: i documenti non si modificano né si eliminano.
end $$;
