# BigBrotherStudio

Gestionale web per studi di consulenza fiscale e contabile: il titolare vede a colpo d'occhio a che punto
sono IVA e prima nota di ogni cliente, assegna compiti con scadenze e documenti, e trova nella scheda di ogni
cliente lo storico delle comunicazioni (anche i riassunti automatici delle email, letti in sola lettura).

Piattaforma **multi-studio**: ogni studio ha uno spazio completamente privato, garantito dal database
(Row Level Security di Postgres).

- Specifiche: [`docs/SPECIFICHE.md`](docs/SPECIFICHE.md)
- Piano tecnico, messa online e decisioni aperte: [`docs/PIANO.md`](docs/PIANO.md)
- API per agenti AI e integrazioni: [`docs/API.md`](docs/API.md)
- Regole per chi sviluppa: [`CLAUDE.md`](CLAUDE.md)

## Avvio in locale

Servono Node.js 22 e uno di questi due ambienti:

### A. Con Docker (Supabase CLI)

```bash
npm ci
npx supabase start                  # Postgres, Auth, Storage e Inbucket in locale
cp .env.example .env.local          # poi inserisci URL e chiavi stampate da `supabase start`
                                    # DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
npx supabase db reset               # applica le migrazioni
npm run seed                        # dati di esempio inventati
npm run dev                         # http://localhost:3000
```

### B. Senza Docker (Postgres installato sulla macchina)

Lo script `scripts/locale/avvia.sh` avvia GoTrue (il servizio di autenticazione di Supabase), Mailpit
(email di prova su http://127.0.0.1:8025) e un piccolo gateway su http://127.0.0.1:54321. Serve Postgres 16
in ascolto su 127.0.0.1:5432 con utente `postgres`/`postgres` e i binari `auth` (GoTrue) e `mailpit`
(variabili `GOTRUE_BIN` e `MAILPIT_BIN`, vedi il workflow di CI per come scaricarli).

```bash
npm ci
bash scripts/locale/env-ci.sh > .env.local   # variabili per lo stack locale (nessun segreto reale)
npm run locale:reset                          # database nuovo + migrazioni + dati di esempio
npm run dev
```

In locale i documenti dei compiti stanno in `.dati-locali/` (`STORAGE_DRIVER=locale`), l'AI è simulata
(`AI_SIMULATA=1`) e Gmail è sostituito da una casella di prova (`GMAIL_SIMULATO=1`).

### Utenti di esempio

Password di tutti: `Prova-BigBrother-2026`

| Studio | Admin | Collaboratori |
|---|---|---|
| Studio Farruggio (demo) | nicolo.farruggio@studio-demo.it | giulia.verdi@, marco.russo@, sofia.romano@studio-demo.it |
| Studio Bianchi (demo) | paola.bianchi@bianchi-demo.it | luca.testa@, anna.deluca@, pietro.longo@bianchi-demo.it |

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | sito in sviluppo |
| `npm test` | test unitari e di isolamento/permessi su Postgres in memoria (PGlite) |
| `npm run test:db` | solo i test del database |
| `npm run test:e2e` | test end-to-end Playwright (stack locale acceso) |
| `npm run typecheck` / `npm run lint` | controlli statici |
| `npm run build` | build di produzione |
| `npm run db:migra` | applica le migrazioni nuove a `DATABASE_URL` (o `DATABASE_URL_MIGRAZIONI`) |
| `npm run seed` | dati di esempio |

## Variabili d'ambiente

Tutte documentate, senza valori, in [`.env.example`](.env.example). Nessun segreto va nel repository.
