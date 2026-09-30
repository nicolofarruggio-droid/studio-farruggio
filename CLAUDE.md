@AGENTS.md

# BigBrotherStudio — istruzioni per chi sviluppa (persone e agenti)

Gestionale web multi-studio per studi di consulenza fiscale e contabile. Le specifiche sono in
`docs/SPECIFICHE.md` (riferimento principale), il piano tecnico in `docs/PIANO.md`.
Interfaccia, testi, nomi di tabelle, funzioni e variabili: **in italiano**.

## Comandi

```bash
npm run locale:avvia     # Postgres locale + GoTrue + Mailpit + gateway (senza Docker) e migrazioni
npm run locale:reset     # ricrea il database locale e carica i dati di esempio
npm run dev              # sito su http://localhost:3000 (usa .env.local)
npm run test             # test unitari e di database (PGlite, niente servizi esterni)
npm run test:db          # solo test di isolamento e permessi (obbligatori a ogni modifica di schema/policy)
npm run test:e2e         # test end-to-end Playwright (serve lo stack locale acceso)
npm run typecheck && npm run lint
npm run db:migra         # applica le migrazioni nuove a DATABASE_URL
```

Utenti di esempio (password `Prova-BigBrother-2026`): `nicolo.farruggio@studio-demo.it` (admin),
`giulia.verdi@studio-demo.it`, `marco.russo@studio-demo.it`, `sofia.romano@studio-demo.it` (collaboratori);
secondo studio: `paola.bianchi@bianchi-demo.it` e colleghi. Email di prova: Mailpit su http://127.0.0.1:8025.

## Architettura

- Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind 4, componenti in stile shadcn/ui
  scritti a mano in `src/components/ui` (Radix per dialog, menu, popover).
- Supabase: **Auth** (email+password, Google) tramite `@supabase/ssr`; **Postgres** letto e scritto dal server con
  `postgres` (postgres.js); **Storage** per i documenti dei compiti.
- `proxy.ts` (ex middleware) aggiorna i cookie di sessione e manda al login chi non è autenticato.

## Regole di isolamento tra studi (critiche)

1. Ogni tabella di business ha `studio_id not null` e **Row Level Security** attiva.
2. Tutto ciò che si fa per conto di un utente passa da `conUtente(persona, tx => …)` (`src/lib/db.ts`):
   la transazione gira con ruolo `authenticated` e i claims dell'utente, quindi valgono le policy RLS.
   Non filtrare "a mano" per studio pensando che basti: il filtro vero è nel database.
3. `comeSistema()` salta RLS: solo per processi del server (cron email, pagina pubblica dell'invito,
   profilo proprio in `leggiSessione`). Mai con input dell'utente non verificato.
4. Le operazioni con effetti su più righe o su altri utenti (compiti, inviti, ruoli, assegnazioni, accessi,
   indicatori) sono **funzioni SQL** `security definer` che controllano i permessi con `auth.uid()`:
   interfaccia e API passano dalle stesse funzioni. Funzioni di permesso: `mio_studio()`, `e_admin()`,
   `vede_tutto_lo_studio()`, `lavora_su_tutto_lo_studio()`, `spazi_visibili()`, `spazi_lavorabili()`,
   `puo_vedere_cliente()`, `puo_lavorare_cliente()`, `puo_vedere_compito()`, `puo_lavorare_compito()`,
   `puo_controllare_compito()`, `puo_creare_compito_per()`, `agente_puo()`.
5. Nuove tabelle: `studio_id`, RLS attiva, `revoke all … from anon, authenticated` e poi solo i grant necessari.
   Nelle policy usa `(select funzione())` per le funzioni senza argomenti. Una policy di select non deve
   rileggere la stessa tabella (romperebbe `insert … returning`).
6. Ogni modifica di schema o policy: **nuovo file** in `supabase/migrations/` (mai modificare quelli già
   rilasciati) e test in `tests/db/` che provano sia il caso permesso sia quello vietato.
7. I token delle caselle email stanno in `caselle_email_token` senza alcun grant: mai leggibili da interfaccia,
   API o AI. Il modulo email non fa mai chiamate di scrittura a Gmail (solo GET, permesso `gmail.readonly`).

## Convenzioni del codice

- Pagine server: `const { persona, utente, studio } = await richiediUtente()` (o `richiediAdmin()`), poi query
  con `conUtente`. Query riutilizzabili in `src/lib/dati/*`.
- Server Actions in file `azioni*.ts` con `'use server'`: validano con zod, ricontrollano l'utente, restituiscono
  `EsitoAzione` (`src/lib/errori.ts`) con messaggi in italiano semplice; errori del DB con `messaggioErrore(e)`.
  Dopo le modifiche `revalidatePath(...)`.
- Moduli client con `useActionState` + `PulsanteInvio` + `MessaggioEsito`; campi con `Campo` (etichetta, aiuto,
  errore collegati con aria).
- Date: salvate in UTC, mostrate in `Europe/Rome` con `src/lib/date.ts`. Le date senza ora sono stringhe `AAAA-MM-GG`.
- Accessibilità e agenti (sezione 13.1): ogni azione ha un pulsante o link con testo chiaro; niente azioni solo
  al passaggio del mouse o col trascinamento; stato mai solo col colore (icona + testo); URL stabili
  (`/clienti/[id]`, `/compiti/[id]`, `/collaboratori/[id]`); filtri e ordinamento negli URL (`?q=&ordina=`).
- AI: solo tramite `src/lib/ai/claude.ts` (`jsonDaClaude`, `flussoJsonDaClaude`), mai dal browser. Risposte a
  schema fisso validate con zod; `AI_SIMULATA=1` solo in sviluppo e test.
- Nessun segreto nel repository; nuove variabili d'ambiente documentate in `.env.example`.
- Dati di esempio sempre inventati.

## Decisioni aperte

Elencate in `docs/PIANO.md` → "Decisioni aperte": dove il codice adotta una proposta provvisoria è segnato con
`DECISIONE APERTA` nei commenti. Non decidere in silenzio: chiedere al titolare.
