-- Più azioni nella stessa transazione (per esempio "inizia", commento e "pronto" di un agente o di un'importazione)
-- avevano lo stesso orario e la cronologia poteva apparire in ordine sbagliato: si usa l'ora effettiva di ogni riga.
alter table public.compiti_eventi alter column creato_il set default clock_timestamp();
alter table public.compiti_commenti alter column creato_il set default clock_timestamp();
alter table public.notifiche alter column creata_il set default clock_timestamp();
alter table public.registro_attivita alter column creato_il set default clock_timestamp();
alter table public.aggiornamenti_storico alter column modificato_il set default clock_timestamp();
alter table public.comunicazioni alter column creato_il set default clock_timestamp();
