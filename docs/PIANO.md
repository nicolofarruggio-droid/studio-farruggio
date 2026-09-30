# BigBrotherStudio — Piano tecnico (Modulo 1)

Documento tecnico di accompagnamento a `docs/SPECIFICHE.md`. Descrive le scelte fatte, lo stato dei
traguardi, come mettere online il sito e le **decisioni ancora aperte** da chiudere con il titolare.

## 1. Scelte tecniche

| Area | Scelta | Motivo |
|---|---|---|
| Sito | Next.js 16 (App Router, Server Components, Server Actions), TypeScript | Un solo progetto per pagine e API, rendering sul server (niente dati sensibili nel browser), pronto per diventare PWA |
| Interfaccia | Tailwind CSS 4, componenti in stile shadcn/ui (Radix per dialog, menu, popover) | Accessibile, controlli nativi dove possibile (utili anche agli agenti AI), responsive |
| Database | Postgres di Supabase (UE, Francoforte) con **Row Level Security** | L'isolamento tra studi è imposto dal database, non dal codice |
| Accesso ai dati | `postgres` (postgres.js) dal server, con ruolo `authenticated` e claims dell'utente in ogni transazione | Le stesse policy RLS di Supabase valgono per ogni query; query SQL complete per dashboard e filtri; transazioni vere |
| Autenticazione | Supabase Auth: email + password personale, "Accedi con Google", verifica in due passaggi (TOTP) | Richiesto dalle specifiche (sezione 5) |
| File | Supabase Storage, bucket privato `documenti`, link temporanei creati dal server dopo il controllo dei permessi | Sezione 8 |
| AI | Claude Sonnet 5.5 (`claude-sonnet-5-5`) via API Anthropic diretta, solo dal server, risposte JSON a schema fisso validate con zod, registro dei consumi | Sezioni 2 e 17 |
| Email in uscita | SMTP (proposta Brevo) con nodemailer per inviti e notifiche; lo stesso SMTP in Supabase Auth per conferme e recupero | Sezione 2 |
| Lettura email | OAuth Google con il solo permesso `gmail.readonly`, token cifrati AES-256-GCM, controllo pianificato ogni 10 minuti | Sezione 16 |
| Hosting | Vercel, regione `fra1` (Francoforte), Vercel Cron per i processi pianificati | UE, deploy semplice, ambienti separati (Preview/Production) |
| Test | Vitest + **PGlite** (Postgres in memoria con le migrazioni vere e un'imitazione di Supabase Auth) per isolamento e permessi; Playwright per i flussi end-to-end | Sezione 14.3: girano in CI senza account esterni |

### Struttura del progetto

```
supabase/migrations/     migrazioni SQL (schema, RLS, funzioni di permesso e di business)
supabase/templates/      email di conferma e recupero password di Supabase Auth
src/proxy.ts             sessione e redirect al login (ex middleware)
src/lib/db.ts            conUtente() / comeSistema()
src/lib/auth/            sessione, primo accesso
src/lib/dati/            query riutilizzabili (clienti, compiti, dashboard, scheda cliente)
src/lib/ai/claude.ts     unico punto di accesso all'AI
src/lib/email-lettura/   lettura Gmail in sola lettura
src/lib/documenti/       spazio file (Supabase Storage o disco locale)
src/lib/api/             API v1 per agenti e integrazioni
src/app/(pubblico)/      accesso, registrazione, inviti, password, privacy
src/app/(app)/           dashboard, clienti, compiti, email, studio, profilo
src/app/api/             API v1, esportazioni, documenti, cron
tests/db/                test di isolamento e permessi (PGlite)
tests/unit/              test unitari
tests/e2e/               test end-to-end (Playwright)
scripts/locale/          stack locale senza Docker (Postgres + GoTrue + Mailpit + gateway)
```

### Modello di sicurezza

1. Ogni tabella di business ha `studio_id` e RLS attiva; `anon` non ha privilegi.
2. Le funzioni di permesso (`mio_studio`, `e_admin`, `vede_tutto_lo_studio`, `lavora_su_tutto_lo_studio`,
   `spazi_visibili`, `spazi_lavorabili`, `puo_vedere_cliente`, `puo_lavorare_cliente`, `puo_vedere_compito`,
   `puo_lavorare_compito`, `puo_controllare_compito`, `puo_creare_compito_per`, `agente_puo`) leggono
   impostazioni e ruoli dal database.
3. Le operazioni con effetti su più righe o su altri utenti sono funzioni SQL `security definer` che
   ricontrollano i permessi: interfaccia e API passano dalle stesse regole.
4. I token Gmail sono in una tabella senza alcun privilegio per gli utenti; il codice email fa solo GET.
5. Il registro attività traccia inviti, ruoli, accessi, impostazioni (prima/dopo), assegnazioni,
   esportazioni, eliminazioni, indirizzi email dei clienti e tutte le azioni degli agenti.
6. Solo il server del sito agisce per conto degli utenti: ogni transazione del server imposta
   `app.canale = 'server'`; senza, il database non riconosce alcun utente e una policy restrittiva su ogni
   tabella esclude tutto. La Data API di Supabase (REST, GraphQL, Realtime) resta quindi inutile anche con
   un JWT valido, e la verifica in due passaggi (controllata dal server) non si aggira.
7. Spazio file senza policy per gli utenti: si passa solo da link firmati creati dal server dopo il controllo
   dei permessi. Nome, tipo (anche quello salvato nello spazio file) e dimensione si ricontrollano alla conferma;
   il database rifiuta comunque nomi con caratteri nascosti e tipi non ammessi.
8. Inviti: se il link non è partito per email (l'admin l'ha copiato), chi lo apre deve confermare l'indirizzo
   con un'email prima che l'account esista, e sceglie poi la password: chi ha visto il link non può creare un
   account a nome di altri. Al massimo 100 inviti al giorno per studio.
   Registrazioni: Supabase Auth, con due registrazioni non confermate dello stesso indirizzo, terrebbe la password
   della prima. Il sito elimina la registrazione non confermata precedente e chi conferma sceglie di nuovo la
   password (e i dati dello studio), così nessuno può "preparare" un account a nome di altri.
9. Un'email letta da una casella si associa solo ai clienti che il proprietario della casella vede.

## 2. Stato dei traguardi

| Traguardo | Stato |
|---|---|
| T0 progetto, CI, schema, dati di esempio | fatto |
| T1 registrazione, login, inviti, utenti, ruoli, RLS con test di isolamento | fatto |
| T2 clienti, assegnazioni, importazione Excel/CSV | fatto |
| T3 indicatori con storico, ritardi, dashboard admin e collaboratore | fatto |
| T4 compiti, stati, scadenze, documenti, commenti, notifiche | fatto |
| T5 registro attività, esportazioni, accessibilità, documentazione, deploy | fatto (deploy da eseguire con gli account reali, sezione 3) |
| T6 API documentata, account agente, tracciabilità, coda di proposte | fatto |
| T7 comunicazioni, importazione con AI, Gmail in sola lettura, registro costi AI | fatto (lettura email spenta finché non si chiudono i punti della sezione 16.5) |

## 3. Messa online passo per passo

1. **Supabase**: nuovo progetto in regione *Central EU (Frankfurt)*, piano Pro (backup giornalieri).
   - Auth → Providers: Email (conferma attiva, password minima 10), Google (client OAuth, vedi punto 4).
   - Auth → URL Configuration: Site URL = indirizzo del sito; Redirect URLs = `https://<sito>/**`.
   - Auth → Email Templates: copiare `supabase/templates/conferma.html` e `recupero.html`.
   - Auth → SMTP: lo stesso SMTP del punto 5. Auth → MFA: TOTP attivo.
   - Database: applicare le migrazioni con `supabase db push` oppure `DATABASE_URL_MIGRAZIONI=<connessione diretta> npm run db:migra`.
     La migrazione dello storage crea il bucket privato `documenti` (senza accesso diretto per gli utenti).
   - Project Settings → Data API: disattivarla (il sito non la usa; il database la rende comunque inutile).
     Realtime non serve.
2. **Vercel**: importare il repository, regione `fra1`, variabili d'ambiente da `.env.example`
   (separate per Preview e Production). `DATABASE_URL` = connessione del pooler (porta 6543, modalità transaction).
   `NEXT_PUBLIC_SITE_URL` = indirizzo pubblico del sito (serve per i link nelle email). Non impostare in produzione
   `AI_SIMULATA`, `GMAIL_SIMULATO`, `CONSENTI_MODALITA_PROVA`, `STORAGE_DRIVER`.
   I processi pianificati sono in `vercel.json` (email ogni 10 minuti, notifiche ogni 5 minuti, pulizia notturna del cestino)
   e usano `CRON_SECRET`.
3. **Anthropic**: account Claude Console di studiofarruggio@gmail.com, chiave API in `ANTHROPIC_API_KEY`
   (solo nei segreti di Vercel), limite di spesa mensile e avvisi, chiavi separate per sviluppo e produzione.
4. **Google Cloud** (progetto intestato a studiofarruggio@gmail.com): schermata di consenso OAuth; un client
   OAuth "Applicazione web" con URI di reindirizzamento `https://<progetto>.supabase.co/auth/v1/callback`
   (Accedi con Google) e `https://<sito>/api/gmail/callback` (collegamento Gmail). Abilitare la Gmail API.
   Per la prova interna: app di tipo "Interno" nel dominio Workspace dello studio. Per studi esterni serve
   la verifica di Google per lo scope ristretto `gmail.readonly` (sezione 16.5).
5. **Email in uscita**: account Brevo (o altro SMTP europeo) con il dominio della piattaforma verificato
   (SPF, DKIM); variabili `SMTP_*` ed `EMAIL_MITTENTE`.
6. **Prima prova**: registrare lo studio, invitare un collaboratore, importare i clienti, attivare la lettura
   email in Impostazioni solo dopo i punti della sezione 16.5.

## 4. Decisioni aperte

Dove il codice ha dovuto scegliere, ha adottato la proposta delle specifiche o l'opzione più prudente, ed è
segnato con `DECISIONE APERTA`. Da confermare con il titolare:

| # | Decisione | Scelta provvisoria nel codice |
|---|---|---|
| 1 | Un cliente con più collaboratori o uno solo? | Il modello permette più collaboratori; l'interfaccia ha un referente principale più eventuali collaboratori aggiuntivi |
| 2 | Soglie iniziali di "ritardo" per IVA e prima nota | 2 mesi per entrambe, modificabili in Impostazioni |
| 3 | Server MCP subito o solo API? | Solo API REST documentata (OpenAPI) in questo rilascio; l'MCP si aggiunge sopra le stesse funzioni |
| 4 | Servizio email e dominio per inviti, conferme e recupero | SMTP generico (proposta Brevo); dominio da scegliere. Senza SMTP l'admin copia il link dell'invito |
| 5 | Indirizzo email usato da più clienti | Il riassunto viene scritto in tutti i clienti collegati, con avviso nella scheda |
| 6 | Leggere anche le email inviate dal collaboratore ai clienti? | No: solo quelle in arrivo |
| 7 | Le comunicazioni si possono modificare o eliminare, e da chi? | No, per nessuno (storico immutabile) |
| 8 | Documento caricato per errore in un compito | Resta per sempre; il campo `nascosto` (con chi e quando) esiste ma non è usato |
| 9 | Clienti eliminati: subito o cestino di 30 giorni? | Cestino di 30 giorni (proposta), con ripristino ed eliminazione definitiva manuale |
| 10 | Fatturato: un valore o per anno? | Un solo valore |
| 11 | Limite dei documenti e spazio per studio | 25 MB per file (`DOCUMENTI_MAX_MB`); nessun limite di spazio per studio per ora |
| 12 | Copia di sicurezza dei documenti (i backup di Supabase non includono i file) | Da decidere: proposta copia notturna in un secondo spazio in UE |
| 13 | Solo Gmail o anche Outlook/Microsoft 365? | Solo Gmail; il modello dati prevede `fornitore = microsoft` |
| 14 | Elaborazione AI fuori UE (API Anthropic diretta) | Accettata nelle specifiche; da coprire con DPA e informativa |
| 15 | Aspetti legali (informativa, termini, DPA, Statuto dei lavoratori, verifica Google) | Pagine segnaposto; lettura email spenta di default per studio |
| 16 | Se Sonnet 5.5 rifiuta un testo, riprovare con un modello di riserva scelto da Anthropic? | No (le specifiche chiedono Sonnet 5.5 per tutto): si mostra l'errore. Si accende con `AI_MODELLO_RISERVA=si` |
| 17 | Indirizzi email aggiunti da un collaboratore ai propri clienti | Usati subito per associare le email, ma solo dalle caselle di chi vede quel cliente (quindi anche da quelle degli admin); ogni aggiunta è nel registro attività. Alternativa più prudente: gli indirizzi aggiunti dai collaboratori valgono per le caselle degli admin solo dopo l'approvazione di un admin |
| 18 | Limite di richieste per l'API usata da una persona con il proprio access token | Nessun limite per ora (i limiti `API_LIMITE_*` valgono per i token agente). Proposta: stessi limiti, contati per persona |
