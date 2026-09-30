# BigBrotherStudio — Gestionale per studi di consulenza — Specifiche (Modulo 1)

**Nome della piattaforma: BigBrotherStudio** (deciso il 30/09/2026).

Documento di riferimento del progetto, nella root del repository (`Desktop/BigBrotherStudio/SPECIFICHE.md`) e richiamato dal `CLAUDE.md`. Il piano tecnico di realizzazione è in `PIANO.md`.

**Prototipo di riferimento:** https://claude.ai/artifact/Dzf5kF5tgbZcLkoQuGe8ri — prototipo cliccabile costruito insieme a queste specifiche. Mostra schermate, testi e flussi da riprodurre. Non è il codice da cui partire: dati, AI e collegamento email sono simulati o semplificati (vedi sezione 17.1). Le modifiche fatte al prototipo sono elencate nel registro in fondo (sezione 18).

---

## 1. Contesto e obiettivo

Il primo cliente è uno studio di consulenza fiscale e contabile italiano con circa 400 clienti (aziende) e 18 collaboratori, più il titolare. Oggi il titolare non ha modo di vedere a colpo d'occhio a che punto è il lavoro su ciascun cliente, e i compiti vengono assegnati a voce o via messaggi sparsi.

Si vuole una piattaforma web dove:

1. il titolare (admin) vede tutti i collaboratori e tutti i clienti, e a che punto sono gli aggiornamenti contabili di ciascun cliente;
2. ogni collaboratore vede solo il proprio pacchetto clienti;
3. l'admin assegna compiti singoli ai collaboratori, con scadenza e documenti, e ne segue l'avanzamento;
4. nella scheda di ogni cliente c'è lo storico delle comunicazioni con il cliente: le email in arrivo dai clienti vengono riassunte in automatico dall'AI, leggendo le caselle dei collaboratori in sola lettura, e ognuno può aggiungere a mano telefonate, incontri e altri contatti (sezione 16).

**Decisione di prodotto importante:** il gestionale non è uno strumento interno di un solo studio. Deve essere **multi-studio** (multi-tenant): più studi di consulenza possono registrarsi, ognuno con un ecosistema completamente privato. Questo va progettato fin dalla prima riga di codice, non aggiunto dopo.

Il gestionale è un **sito web** accessibile da browser (vedi sezione 2).

Questo documento descrive solo il **Modulo 1**: dashboard collaboratori, clienti, compiti, comunicazioni del cliente con lettura email in sola lettura, e importazione clienti con AI. Gli altri moduli (prima nota automatica, WhatsApp e telefono nelle comunicazioni, riassunto chiamate) non vanno sviluppati ora, ma il modello dati non deve impedirli (vedi sezione 12).

---

## 2. Piattaforma e stack consigliato

**Requisito vincolante: il gestionale è un sito web (applicazione web), non un'app desktop.**

- Si usa da browser, con un indirizzo e un login per ogni utente, senza installare nulla su nessun computer.
- Funziona bene su computer, tablet e telefono (progettazione responsive).
- Tutti gli studi e gli utenti usano la stessa piattaforma centrale, con dati su server in UE; un solo aggiornamento del sito vale subito per tutti.
- Deve poter essere trasformato in seguito in app installabile (PWA) senza rifare il lavoro, ma non è richiesto ora.
- Non sviluppare versioni desktop native (Electron, Tauri o simili) né app mobile native in questa fase.
- Un agente AI come Claude Cowork deve poterlo usare tramite browser e API (vedi sezione 13).

### Stack consigliato

Sono indicazioni, da confermare o motivare se Claude Code propone di meglio.

- **Frontend e backend:** Next.js (App Router) con TypeScript.
- **Database, autenticazione e file:** Supabase (Postgres, Auth, Storage) con regione **UE (Francoforte)**. L'isolamento tra studi si fa con Row Level Security di Postgres.
- **UI:** Tailwind CSS e shadcn/ui. Interfaccia in italiano, pronta per essere tradotta in altre lingue.
- **Fuso orario:** `Europe/Rome` per la visualizzazione, date salvate in UTC.
- **Deploy:** hosting in UE, con ambienti separati di sviluppo e produzione.
- **AI:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) di Anthropic per tutte le funzioni AI, chiamato solo dal server. Il consumo di tutti gli studi lo paga la piattaforma con l'account studiofarruggio@gmail.com, tramite l'**API Anthropic diretta** (deciso il 30/09/2026, sezione 17.2).
- **Accesso:** email e password personale, scelta da ciascuno, oppure "Accedi con Google", per tutti gli utenti (decisi il 30/09/2026, sezione 5). Il permesso Gmail in sola lettura è un passaggio separato (sezione 16.2).
- **Email in uscita:** un servizio SMTP (per esempio Brevo) con un dominio proprio, per gli inviti e, configurato anche in Supabase, per conferme e recupero password.

Requisiti trasversali: responsive (usabile da tablet e telefono), accessibile, veloce anche con 400 clienti per studio.

---

## 3. Concetti e ruoli

- **Studio:** il contenitore privato. Tutti i dati appartengono a uno e un solo studio.
- **Admin:** può avere più admin per studio, senza limite di numero. Vede e gestisce tutto nello studio.
- **Collaboratore:** può averne quanti ne servono, senza limite. Cosa vede dipende dall'impostazione "visibilità tra collaboratori" dello studio (qui sotto); di base vede solo i clienti a lui assegnati e i compiti che lo riguardano.
- **Visibilità tra collaboratori (decisa il 30/09/2026):** un'impostazione dello studio che l'admin sceglie e può cambiare quando vuole:
  - **Solo i propri** (predefinita): ogni collaboratore vede e lavora solo sui clienti assegnati a lui e sui compiti suoi;
  - **Tutto lo studio, in sola lettura:** vede clienti, compiti, stato degli aggiornamenti, comunicazioni e documenti di tutti i colleghi, ma lavora solo sui propri;
  - **Tutto lo studio, con accesso completo:** vede tutto e lavora su clienti e compiti di tutti (aggiorna le date, commenta, carica documenti, cambia lo stato dei compiti, aggiunge comunicazioni e indirizzi email).
  In ogni caso restano solo agli admin: inviti, ruoli, impostazioni, creazione, archiviazione e assegnazione dei clienti. Ogni cambio dell'impostazione finisce nel registro attività con il valore prima e dopo. Qualsiasi admin dello studio può cambiarla (confermato il 30/09/2026).
- **Accessi tra colleghi (deciso il 30/09/2026):** oltre alla visibilità generale, l'admin concede permessi particolari del tipo "il collaboratore A può accedere allo spazio del collaboratore B", scegliendo **solo per vedere** oppure **può anche lavorarci**. Lo spazio di B sono i clienti assegnati a B e i compiti assegnati a B, con documenti, commenti e comunicazioni. L'accesso si concede solo a collaboratori (gli admin vedono già tutto) e si toglie quando si vuole. B vede chi ha accesso al suo spazio, gli altri colleghi no. Concessioni e revoche finiscono nel registro attività. Un utente disattivato perde anche gli accessi concessi.
- **Agente AI:** un tipo di account dedicato e limitato (per Claude Cowork o altri agenti), creato e controllato dall'admin, descritto nella sezione 13.
- Un utente appartiene a **un solo studio** (per il Modulo 1). Non esiste ancora un super-admin di piattaforma; va lasciato il posto per aggiungerlo in futuro.

### Matrice dei permessi

| Azione | Admin | Collaboratore |
|---|---|---|
| Vedere tutti i clienti dello studio | Sì | Con "tutto lo studio" (lettura o completo); con "solo i propri", solo il suo pacchetto |
| Creare, modificare, archiviare ed eliminare clienti | Sì | No |
| Assegnare clienti ai collaboratori | Sì | No |
| Aggiornare "IVA" e "prima nota" di un cliente | Sì | Sui clienti assegnati; su tutti con "accesso completo" |
| Creare e assegnare compiti | Sì, per chiunque dello studio | Secondo l'impostazione "Chi può creare compiti": no (default), solo per sé, oppure per chiunque dello studio, admin compresi |
| Chiudere un compito dopo il controllo | Sì | Sui compiti che ha creato lui |
| Vedere i compiti | Tutti | I propri; tutti con "tutto lo studio" (lettura o completo) |
| Cambiare stato del compito e caricare documenti | Sì | Sui propri compiti, finché sono aperti; su tutti con "accesso completo" |
| Consultare e scaricare i documenti di un compito | Sì, sempre (anche a compito chiuso) | Sui compiti che può vedere, sempre |
| Eliminare un documento caricato | No (decisione aperta, sezione 14) | No |
| Commentare i compiti | Sì | Sui propri compiti; su tutti con "accesso completo" |
| Vedere comunicazioni di un cliente | Sì | Sui clienti che può vedere |
| Aggiungere comunicazioni a un cliente | Sì | Sui clienti assegnati; su tutti con "accesso completo" |
| Aggiungere o rimuovere indirizzi email di un cliente | Sì | Sui clienti assegnati; su tutti con "accesso completo" |
| Scegliere la visibilità tra collaboratori | Sì | No |
| Concedere accessi tra colleghi ("A può accedere allo spazio di B") | Sì | No |

Dove la tabella dice "propri" o "assegnati", valgono anche gli spazi dei colleghi che l'admin ha concesso: in sola lettura, o con la possibilità di lavorarci.
| Collegare o scollegare una casella email | Solo la propria | Solo la propria |
| Vedere se la casella di un utente è collegata | Sì | No |
| Leggere le email di un altro utente | Mai | Mai |
| Invitare, disattivare utenti, cambiare ruoli | Sì | No |
| Modificare le impostazioni dello studio | Sì | No |
| Accedere ai dati di un altro studio | Mai | Mai |

Un admin deve poter "entrare" nella vista di qualsiasi collaboratore (vedere la dashboard come la vede lui), in sola lettura di default.

---

## 4. Isolamento tra studi (requisito critico)

- Ogni tabella con dati di business ha una colonna `studio_id` non nulla.
- L'isolamento è imposto **a livello di database** con Row Level Security. Non basta filtrare nell'interfaccia o nelle API: se il codice applicativo ha un errore, uno studio non deve comunque poter leggere i dati di un altro.
- Regole RLS per ruolo: l'admin accede a tutte le righe del proprio studio; il collaboratore ai clienti assegnati e ai compiti a lui assegnati (e ai relativi documenti, commenti e comunicazioni), oppure a tutto lo studio secondo la visibilità scelta dall'admin. Le regole usano le funzioni `vede_tutto_lo_studio()` (lettura) e `lavora_su_tutto_lo_studio()` (modifica), che leggono l'impostazione dal database: non si aggirano dall'interfaccia.
- Anche i file caricati (Storage) seguono le stesse regole: percorsi che includono `studio_id` e policy che impediscono l'accesso incrociato.
- **Test obbligatori** (automatici, eseguibili in CI):
  - un utente dello studio A non riesce a leggere, modificare o cancellare alcuna riga o file dello studio B;
  - con "solo i propri", un collaboratore non vede clienti non assegnati a lui; con "sola lettura" li vede ma non li modifica;
  - un collaboratore non può eseguire azioni riservate all'admin, nemmeno chiamando direttamente le API;
  - un utente disattivato non accede più a nulla.

---

## 5. Registrazione, accesso e gestione utenti

1. **Registrazione di uno studio:** un modulo con nome dello studio, nome, cognome, email e password personale. Supabase manda un'email per confermare l'indirizzo; aperto il link, lo studio viene creato e chi l'ha registrato diventa admin.
2. **Login con email e password (deciso il 30/09/2026):** ognuno entra con la propria email e una password personale scelta da lui (almeno 10 caratteri). "Password dimenticata?" manda un link per sceglierne una nuova. Predisporre la verifica in due passaggi (opzionale per lo studio, consigliata agli admin). Il permesso di sola lettura su Gmail è un passaggio separato, dopo il primo accesso (sezione 16.2).
   **"Accedi con Google" per tutti (deciso il 30/09/2026):** accanto a email e password c'è sempre il pulsante "Accedi con Google", in accesso, registrazione dello studio e invito. Chiede a Google solo nome ed email. Chi si registra con Google conferma nome dello studio, nome e cognome, già compilati dall'account Google. Chi è invitato può entrare con Google invece di scegliere una password, ma solo con l'account Google dell'indirizzo invitato. Se la stessa persona usa sia la password sia Google con la stessa email, l'account è uno solo.
3. **Inviti:** l'admin aggiunge altri admin e collaboratori scrivendo **nome, cognome e indirizzo email** e scegliendo il ruolo. La persona riceve un'email con i suoi dati di accesso (lo studio, il ruolo, l'indirizzo con cui entrare) e un link per **scegliere la sua password personale**; salvata la password, entra direttamente nel suo spazio. Il link vale 7 giorni. L'admin vede gli inviti in attesa, se l'email è partita, e può **rinviarla** (nuovo link, altri 7 giorni) o annullare l'invito. Se il servizio email non è ancora configurato, l'admin vede il link e lo manda lui. Se l'indirizzo ha già un account senza studio, la persona entra con la sua password e riapre il link.
4. **Gestione utenti:** l'admin vede l'elenco, può cambiare ruolo, disattivare e riattivare. Non si eliminano utenti con storico: si disattivano. Quando un collaboratore viene disattivato, l'app propone di riassegnare i suoi clienti e compiti aperti.
5. **Vincolo:** ogni studio deve avere sempre almeno un admin attivo. Il sistema impedisce di rimuovere o declassare l'ultimo admin.
6. **Impostazioni studio** (solo admin), tra cui:
   - visibilità tra collaboratori: solo i propri (default), tutto lo studio in sola lettura, tutto lo studio con accesso completo (sezione 3);
   - **chi può creare compiti (deciso il 30/09/2026):** solo gli admin (default); anche i collaboratori ma solo per sé stessi; oppure **tutti per tutti**, cioè chiunque nello studio crea compiti e li assegna a chiunque, admin compresi. La regola è nel database (`puo_creare_compito_per`);
   - soglia di "ritardo" per gli aggiornamenti contabili (vedi sezione 7, default 2 mesi);
   - dati anagrafici dello studio.

---

## 6. Clienti e assegnazioni

### Anagrafica cliente

- **Ragione sociale** (nome dell'azienda), obbligatoria.
- **Titolari:** una o più persone (nome e cognome), ad esempio i soci. Il primo è il titolare principale.
- **Indirizzi email collegati:** uno o più indirizzi del cliente, PEC comprese, in una sezione dedicata della scheda cliente (sezione 16.1). Servono all'AI per riconoscere le email che admin e collaboratori ricevono dal cliente, leggerle e scriverne il riassunto nelle Comunicazioni, quindi vanno tenuti aggiornati. Li gestiscono l'admin e i collaboratori assegnati al cliente. Un indirizzo può essere collegato a più clienti (stesso titolare con più aziende), con un avviso.
- Telefono, codice fiscale, partita IVA (facoltativi).
- **Numero di dipendenti** e **fatturato (€)** (facoltativi, aggiunti il 30/09/2026). Un solo valore di fatturato, senza anno di riferimento (vedi decisioni aperte).
- L'admin modifica l'anagrafica dalla scheda del cliente ("Modifica anagrafica"), anche per completare a mano i campi rimasti vuoti dopo l'importazione.
- Note interne libere.
- Stato: attivo o archiviato.
- **Eliminazione (richiesta il 30/09/2026):** nell'elenco clienti l'admin seleziona uno o più clienti con la casella e preme **Elimina** (pulsante rosso). Compare l'avviso "Sei sicuro di voler eliminare questo cliente?" (o "questi N clienti?"), con i nomi e cosa verrà eliminato insieme (compiti con documenti, comunicazioni, storico delle date), e i pulsanti **Annulla** (grigio) ed **ELIMINA** (rosso); lo stato attivo è su Annulla. L'eliminazione finisce nel registro attività. Decisione aperta per il gestionale vero: cancellazione subito definitiva, oppure cestino recuperabile per 30 giorni (proposta, perché con i clienti spariscono anche storico e documenti).
- **Nome di visualizzazione unico e coerente**, generato da ragione sociale e titolare (esempio: "Auto Shop — Enzo D'Agosta"). È importante: in futuro servirà per nominare i file e associare le comunicazioni, quindi vive in un campo dedicato e stabile.
- **Alias:** possibilità di registrare nomi alternativi per lo stesso cliente (per usi futuri di riconoscimento automatico). Nel Modulo 1 basta che il campo esista e sia modificabile.
- Nel caso di un titolare con più aziende, ogni azienda è un cliente distinto. Il sistema segnala (senza bloccare) quando due clienti hanno lo stesso titolare.

### Assegnazione ai collaboratori

- L'assegnazione è modellata come relazione **molti-a-molti** tra clienti e collaboratori, con un campo per marcare il **referente principale**. In pratica il caso normale è un cliente con un collaboratore, ma il modello non deve impedire più collaboratori sullo stesso cliente.
- L'admin può assegnare e riassegnare dalla scheda cliente, dalla scheda collaboratore o in blocco (selezione di più clienti e assegnazione a un collaboratore).
- Storico delle assegnazioni conservato (chi, quando).

### Importazione

- Importazione da file Excel o CSV di: elenco clienti, elenco collaboratori (come inviti) e assegnazioni cliente-collaboratore.
- **Analisi con l'AI.** Il file dei clienti non deve avere un formato preciso. L'admin carica il file (.xlsx, .xls, .csv, .ods) e l'AI legge le righe e riconosce, per ogni cliente (elenco deciso il 30/09/2026):
  - **Nome azienda** (ragione sociale);
  - **Nome cliente**, cioè la persona o le persone titolari (una cella come "Mario e Luca Rossi" diventa due persone);
  - **email**: tutte, anche più di una nella stessa cella o in colonne diverse, PEC comprese. Vanno tutte negli "Indirizzi email collegati", perché servono a riconoscere i mittenti nelle caselle di posta (sezione 16);
  - **Ultimo aggiornamento prima nota** e **Ultimo aggiornamento IVA**: diventano le date dei due indicatori (sezione 7). Date all'italiana; se c'è solo mese e anno ("ago 2026", "08/2026") vale l'ultimo giorno del mese. Le date lette da Excel si prendono come date vere, non come testo, per non confondere giorno e mese;
  - **N. dipendenti** (numero intero) e **Fatturato (€)** (importo, anche scritto "1.250.000 €" o "1.250.000,00");
  - **Collaboratore studio**, abbinato agli utenti dello studio per nome;
  - partita IVA, codice fiscale e telefono, se ci sono.
  **Se l'AI non riconosce un dato, il campo resta vuoto** e si completa a mano, nell'anteprima o dopo dalla scheda del cliente. L'AI non deve inventare dati.
- Le righe vengono inviate all'AI a blocchi (nel prototipo, 60 righe per richiesta, due blocchi alla volta) con la riga di intestazione. Durante l'analisi c'è una **barra di avanzamento con la percentuale** e il conteggio "N di M righe analizzate", che avanza anche dentro ogni blocco mentre l'AI scrive i risultati, e un pulsante per interrompere (i clienti già analizzati restano nell'anteprima). Il risultato dell'AI viene controllato dal server (struttura dei campi, formato delle email) prima di mostrarlo.
- Alternativa senza AI: riconoscimento delle colonne dai nomi dell'intestazione (ragione sociale, titolare, email, partita IVA…), utile se l'AI non è disponibile.
- Anteprima prima di confermare, modificabile riga per riga, con segnalazione di: ragione sociale mancante, email non valide, doppioni nel file, clienti già presenti nello studio (stessa ragione sociale o partita IVA), titolare o email mancanti. Si può escludere una riga e assegnare in blocco i clienti senza collaboratore. Le righe con errori non vengono importate. L'importazione deve gestire ~400 clienti in un colpo. Ogni riga segnala anche i campi "da completare" (prima nota, IVA, dipendenti, fatturato, collaboratore); le date si correggono con un selettore di data e i numeri con campi numerici. Le date importate entrano nello storico degli indicatori come valore iniziale.

---

## 7. Stato di aggiornamento contabile (funzione centrale)

Ogni cliente ha **due indicatori** che rappresentano fino a quando il lavoro è aggiornato:

1. **Aggiornamento IVA:** ultimo periodo per cui l'IVA è aggiornata.
2. **Aggiornamento prima nota:** ultimo periodo per cui la prima nota è aggiornata.

Regole:

- Il valore è una **data di fine periodo** (esempio: 31 agosto 2026), mostrata in modo leggibile ("aggiornato ad agosto 2026"). L'inserimento avviene con un selettore mese/anno che salva l'ultimo giorno del mese, ma va permessa anche una data precisa.
- **L'aggiornamento è manuale.** Il collaboratore entra nel cliente e imposta la data. Nessuna automazione in questo modulo.
- Ogni modifica viene registrata (chi, quando, valore precedente e nuovo). La scheda cliente mostra questo storico.
- **Indicatore di ritardo:** se la data di aggiornamento è più vecchia della soglia configurata rispetto a oggi, il cliente è segnato come "in ritardo" (colore e icona, non solo colore). La soglia è per studio e per tipo di aggiornamento.
- Possibilità di segnare un indicatore come "non applicabile" per un cliente (esempio: azienda senza obblighi di IVA periodica), così non finisce tra i ritardi.
- Un cliente senza alcuna data inserita mostra "da impostare".

---

## 8. Compiti

Ci sono due famiglie di lavoro, e vanno distinte nel prodotto:

- **Attività periodiche** (registrazione fatture, prima nota): sono già coperte dagli indicatori della sezione 7 e non sono compiti.
- **Compiti singoli** (attività straordinarie): esempio "preparare il contratto di affitto per il cliente X entro venerdì", "verificare le cartelle da pagare entro 60 giorni e dare risposta al cliente".

### Campi del compito

- Titolo e descrizione.
- **Cliente collegato: facoltativo** (deciso il 30/09/2026). Un compito si può assegnare a un collaboratore senza indicare un'azienda, per i lavori generali dello studio; in quel caso compare come "Senza cliente".
- **Nel modulo "Nuovo compito"** (deciso il 30/09/2026):
  - **Cliente:** un campo "Cerca per nome dell'azienda o del titolare". Il menu dei clienti è **chiuso** e si apre come tendina solo cliccando nel campo; scrivendo, l'elenco si restringe. La prima voce è **"Nessun cliente"** (compito generale), scelta di partenza. Si usa anche da tastiera (frecce, Invio per scegliere, Esc per chiudere il menu senza chiudere il modulo) e si chiude cliccando fuori. Stile coerente con il resto del sito: bordi arrotondati, ombra leggera, voce scelta evidenziata con ✓;
  - **Collaboratore:** menu a tendina con le persone a cui si può assegnare il compito, secondo "Chi può creare compiti". Quando si sceglie un cliente, si **compila da solo con il collaboratore referente** di quel cliente e resta modificabile. È obbligatorio; con "solo per sé" è fisso su chi crea il compito.
- Creato da (un admin, oppure un collaboratore se l'impostazione "Chi può creare compiti" lo consente) e **assegnato a** (una persona attiva dello studio; con "tutti per tutti" anche un admin; predisporre la possibilità di più assegnatari). Chi crea il compito lo vede sempre, anche se è assegnato ad altri, lo trova nella sua dashboard in "Compiti che hai assegnato" e può chiuderlo dopo il controllo. Il cliente del compito è uno di quelli che chi lo crea può vedere.
- **Scadenza:** data e ora (le scadenze reali sono "entro un'ora", "entro il pomeriggio", "entro venerdì", quindi serve anche l'orario, opzionale).
- Priorità: normale, alta, urgente.
- **Stato**, con questo flusso:
  1. Assegnato
  2. In lavorazione
  3. **Pronto per revisione** (il collaboratore segnala "è pronto, va controllato")
  4. Completato (l'admin o chi ha creato il compito lo chiude dopo il controllo)
  Possibilità di riaprire, e di annullare un compito con motivazione.
  **Rimandare indietro (deciso il 30/09/2026):** chi controlla un compito "pronto per revisione" (un admin o chi l'ha creato) può chiuderlo oppure **rimandarlo indietro**. Nel secondo caso scrive in un riquadro perché lo rimanda (facoltativo, ma consigliato). Il compito torna "in lavorazione"; chi l'ha fatto riceve una notifica con la spiegazione e la trova in un riquadro in cima alla scheda del compito, finché non lo segna di nuovo pronto. La spiegazione resta nella cronologia.
- **Nessuna scadenza** (deciso il 30/09/2026): nel modulo, accanto a data e ora, la casella "Nessuna scadenza". Il compito compare come "Senza scadenza" e va in fondo negli elenchi ordinati per scadenza.
- Data di completamento registrata automaticamente.

### Documenti e commenti

- Ogni compito ha una sezione **Documenti** dove **sia l'admin sia il collaboratore assegnato possono caricare file** (Word, Excel, PDF, immagini, CSV, testo, ZIP e simili), anche più file insieme. L'elenco mostra per ogni file nome, dimensione, chi lo ha caricato e quando. Ogni caricamento compare anche nella cronologia del compito.
- **I documenti restano sempre nel compito.** Si consultano e si scaricano in qualsiasi momento, anche dopo che il compito è completato o annullato, e anche dalla scheda del cliente passando dai suoi compiti chiusi. Non si eliminano (per il caricamento per errore, vedi le decisioni aperte nella sezione 14). A compito chiuso non se ne aggiungono altri; per farlo si riapre il compito.
- Anteprima nel browser per immagini e PDF, e per i file di testo e CSV; per gli altri formati, pulsante "Scarica".
- **Dove stanno i file:** nel cloud della piattaforma, in uno spazio file privato (Supabase Storage) nella regione di **Francoforte**, mai sui computer delle persone. Chi carica li manda dal browser allo spazio file; chi apre il compito, da qualsiasi computer, li scarica da lì, anche se il computer di chi li ha caricati è spento. Percorso `studio_id/compiti/compito_id/file_id`, stesse regole di accesso del compito (sezione 4, compresi visibilità e accessi tra colleghi). I file sono cifrati sul server, non hanno un indirizzo pubblico e si aprono solo con un **link temporaneo** (valido pochi minuti) che il server crea dopo aver controllato i permessi. Non passano da email o chat. Limite di dimensione per file configurabile (proposta: 25 MB) e controllo del tipo di file. Scansione antivirus se realizzabile con il servizio scelto.
- Nel prototipo i file restano nello spazio privato dello studio, fino a 2 MB ciascuno, con i formati PDF, .docx, .xlsx, immagini, CSV, testo e ZIP. Si aprono in anteprima le immagini e i file di testo e CSV; tutti gli altri si scaricano.
- **Commenti** sul compito, in ordine cronologico, tra admin e collaboratore. Sono il canale per chiarimenti ("il contratto è pronto, l'ho già visionato, ora va controllato").
- Tutto lo storico del compito (cambi di stato, scadenza modificata, file, commenti) è visibile in una cronologia.

### Notifiche

- **Campanella delle notifiche (decisa il 30/09/2026):** ogni utente ha la sua casella di notifiche in alto a destra, con l'icona di una campanella. Se non ci sono notifiche non lette non c'è nessun pallino; se ci sono, compare un **pallino rosso con il numero in bianco** delle notifiche non aperte (oltre 9: "9+"). Cliccando si apre l'elenco, dalla più recente, con tipo, ora e testo; le non lette sono evidenziate. Aprendo una notifica si apre il compito e la notifica diventa letta; c'è anche "Segna tutte come lette". Si chiude cliccando fuori o con Esc.
- **Quando arriva una notifica nell'app:**
  - ti assegnano un compito ("Nuovo compito");
  - un compito che hai assegnato è stato completato, cioè segnato pronto per revisione ("Completato");
  - qualcun altro carica documenti in un compito che hai assegnato o che è assegnato a te ("Documenti");
  - il tuo lavoro viene rimandato indietro, con la spiegazione di chi l'ha rimandato ("Rimandato indietro").
  Nessuno riceve notifiche per le proprie azioni.
- Via email (traguardo T6), le stesse notifiche più scadenze del giorno dopo e del giorno stesso, compiti scaduti e nuovi commenti.
- Ogni utente può scegliere quali email ricevere. Le email non devono contenere il contenuto sensibile dei documenti, solo il riferimento e un link.

---

## 9. Schermate

### Vista admin

1. **Dashboard generale:**
   - elenco dei collaboratori con: numero clienti, compiti aperti, compiti in scadenza, compiti scaduti, clienti in ritardo;
   - accesso rapido a un collaboratore (per "entrare" nella sua vista);
   - compiti "pronti per revisione" in evidenza;
   - riepilogo dei clienti in ritardo sugli aggiornamenti;
   - per ogni collaboratore, se la sua casella email è collegata (solo lo stato, mai il contenuto).
2. **Elenco clienti** (tutti): tabella con ragione sociale, titolare, collaboratore referente, aggiornamento IVA, aggiornamento prima nota, **N. dipendenti**, **fatturato** e compiti aperti. Ricerca, filtri (collaboratore, in ritardo, stato) e ordinamento cliccando sull'intestazione di ogni colonna (un clic crescente, il secondo decrescente). Dipendenti e fatturato si ordinano come numeri, e i clienti senza valore restano sempre in fondo. Esportazione in Excel.
3. **Scheda cliente:** anagrafica (con tutti i titolari), i due indicatori con storico, **indirizzi email collegati** e **comunicazioni** (sezione 16), collaboratori assegnati, compiti del cliente (aperti e chiusi).
4. **Elenco compiti** con filtri per collaboratore, cliente, stato, scadenza, priorità. Vista a lista e vista per scadenza (calendario o "oggi / questa settimana / in ritardo").
5. **Scheda compito** come descritto nella sezione 8, con la sezione Documenti sempre visibile, anche a compito chiuso.
6. **Gestione utenti** (inviti con nome, cognome ed email; ruoli; disattivazione), **accessi tra colleghi** e **impostazioni studio** (compresa la visibilità tra collaboratori).
7. **Importazione** (sezione 6).

### Vista collaboratore

1. **La mia dashboard:** i miei clienti con i due indicatori e i miei compiti aperti, ordinati per scadenza; cosa è in ritardo e cosa scade oggi.
2. **I miei clienti:** solo quelli assegnati, con possibilità di aggiornare i due indicatori in modo rapido, direttamente dalla lista.
3. **I miei compiti** e la scheda compito (cambio stato, upload, commenti).
4. **La mia email:** stato della casella collegata (sola lettura), ultimo e prossimo controllo, esito dell'ultimo controllo (email nuove, associate a clienti, ignorate), pulsante per scollegarla. Se non è collegata, un avviso con "Collega la tua email".

Per tutti, al **primo accesso** compare la schermata di collegamento della casella email descritta nella sezione 16.2. Ogni collaboratore vede in dashboard gli spazi dei colleghi a cui ha accesso e chi ha accesso al suo.

Requisito di usabilità: aggiornare un indicatore deve richiedere pochissimi clic, perché è l'azione più frequente. I collaboratori non sono tecnici: interfaccia chiara, testi in italiano semplice, nessun gergo.

---

## 10. Modello dati (indicativo)

Claude Code può affinarlo, ma queste entità e relazioni devono esserci. Tutte, tranne `studi`, hanno `studio_id`.

- `studi` — id, nome, impostazioni, creato il.
- `utenti` — id, studio_id, nome, cognome, email, ruolo (admin | collaboratore | agente), attivo, ultimo accesso.
- `inviti` — id, studio_id, email, nome, cognome, ruolo, codice del link, scadenza, stato, email inviata il, accettato da e il.
- `accessi_colleghi` — id, studio_id, utente_id (chi riceve l'accesso), proprietario_id (di chi è lo spazio), livello (lettura | completa), creato da e il.
- `clienti` — id, studio_id, ragione_sociale, nome_visualizzazione, telefono, codice_fiscale, partita_iva, numero_dipendenti (intero), fatturato (euro, 2 decimali), note, stato, alias (elenco).
- `clienti_titolari` — cliente_id, nome, cognome, principale (sì/no), ordine.
- `clienti_email` — cliente_id, indirizzo (minuscolo, univoco per cliente), tipo (ordinaria | PEC). Indicizzata per indirizzo, perché serve a riconoscere il mittente delle email.
- `assegnazioni` — cliente_id, utente_id, referente_principale, dal, al.
- `aggiornamenti_contabili` — cliente_id, tipo (iva | prima_nota), aggiornato_fino_al, non_applicabile. Più una tabella di storico delle modifiche.
- `compiti` — id, studio_id, cliente_id (facoltativo), titolo, descrizione, creato_da, scadenza, priorita, stato, completato_il.
- `compiti_assegnatari` — compito_id, utente_id.
- `compiti_documenti` — id, studio_id, compito_id, nome_file, tipo (MIME), dimensione, percorso nello Storage, caricato_da, caricato_il. Nessuna cancellazione dal gestionale: al massimo un campo `nascosto` con chi e quando, se si decide di permetterlo (sezione 14).
- `compiti_commenti` — compito_id, autore, testo, data.
- `notifiche` — id, studio_id, utente_id (destinatario), tipo (assegnato | pronto | documenti | rimandato, estendibile), compito_id, autore, testo, motivo (per "rimandato"), letta, creata_il. RLS: ognuno vede e segna come lette solo le proprie.
- `registro_attivita` — chi, cosa, quando, su quale entità (audit log per le operazioni sensibili).
- `comunicazioni` — id, studio_id, cliente_id, data, canale (email | telefono | incontro | whatsapp | altro), testo, fonte (manuale | email_automatica | email_incollata), autore (utente che l'ha scritta, oppure proprietario della casella), mittente, oggetto, nomi degli allegati, conversazione (thread_id di Gmail), numero del messaggio nella conversazione, message_id (per non creare doppioni), creato_il.
- `caselle_email` — id, studio_id, utente_id, fornitore (gmail; in futuro microsoft), indirizzo, stato (collegata | non_collegata | da_ricollegare), permesso concesso (deve essere solo `gmail.readonly`), token cifrato, collegata_il, ultimo_controllo, cursore di sincronizzazione (es. `historyId` di Gmail). Il token non è mai leggibile dall'interfaccia, dalle API pubbliche o dall'AI.
- `controlli_email` — casella_id, eseguito_il, email_nuove, associate, ignorate, errori. Solo numeri, nessun contenuto.
- `email_elaborate` — casella_id, message_id, esito (associata | ignorata), cliente_id se associata. Serve solo a non rielaborare la stessa email: niente testo, oggetto o mittente per le email ignorate.
- `ai_richieste` — studio_id, funzione (importazione | riassunto_email | riassunto_incollato), modello, token in ingresso e in uscita, esito, data. Senza il contenuto inviato: serve per costi e controlli.

---

## 11. Privacy, sicurezza e conformità

Il sistema tratta dati di clienti di studi professionali, quindi:

- dati e file ospitati in **UE**;
- connessioni cifrate, password gestite dal servizio di autenticazione, nessuna password in chiaro nei log;
- principio del minimo privilegio (vedi matrice dei permessi);
- registro delle attività per le operazioni sensibili (accessi, assegnazioni, esportazioni, modifiche ai permessi);
- possibilità per l'admin di esportare i dati dello studio e di richiederne la cancellazione;
- backup automatici con prova di ripristino. **Attenzione:** i backup giornalieri di Supabase (ultimi 7 giorni sul piano Pro) coprono il database ma **non i file** dello Storage, di cui salvano solo i dati descrittivi. Per i documenti serve una copia periodica in un secondo spazio in UE (decisione aperta, sezione 14);
- pagine di informativa privacy e termini di servizio, con segnaposto da far completare a un consulente privacy prima di aprire la piattaforma a studi esterni (accordo di trattamento dati incluso). Non serve per l'uso di prova interno, ma va previsto nel progetto.

- lettura automatica delle email dei collaboratori e invio di testi all'AI: requisiti e obblighi nelle sezioni 16.5 e 17.3, da chiudere prima di attivare la funzione per studi esterni.

Non fingere di aver risolto gli aspetti legali: lasciare nel codice e nella documentazione i punti in sospeso, segnati chiaramente.

---

## 12. Cosa NON fare ora, ma tenere possibile

Sono moduli futuri. Non vanno sviluppati in questa fase, ma le scelte fatte oggi non devono renderli difficili:

1. **Prima nota automatica.** In futuro il sistema leggerà, per ogni cliente, cartelle con fatture acquisti, fatture vendite ed estratti conto bancari, con file nominati in modo uniforme (nome azienda, tipo documento, data) e produrrà una proposta di prima nota da revisionare. Per questo il nome del cliente deve essere unico e stabile (`nome_visualizzazione`), e la struttura di Storage per cliente deve essere prevedibile (`studio_id/cliente_id/...`).
2. **Altri canali nelle comunicazioni.** Email (lettura in sola lettura) e inserimento manuale fanno parte del Modulo 1 (sezione 16). Restano per il futuro WhatsApp Business, le telefonate registrate, Outlook/Microsoft 365 e le email inviate dallo studio ai clienti. Sono legati a integrazioni ufficiali e a decisioni sulla privacy ancora da prendere. La tabella `comunicazioni` e il campo `alias` dei clienti devono poterli ospitare senza modifiche al nucleo.
3. **Registrazione e riassunto delle chiamate** riservato all'admin, in un'area visibile solo a lui. Il modello permessi deve poter ospitare un'area "solo admin" per cliente.
4. **Fatturazione e abbonamenti degli studi**, pannello di gestione della piattaforma (super-admin) e personalizzazioni per singolo studio. Il modello di business è deciso: un abbonamento per ogni studio, con il consumo AI pagato dalla piattaforma (account studiofarruggio@gmail.com) e compreso nel prezzo (sezione 17.2). Da sviluppare più avanti: piani, incasso degli abbonamenti, tetto di consumo AI per piano, consumo e margine per studio visibili al super-admin. Già dal Modulo 1 ogni chiamata AI registra lo studio (`ai_richieste`).

Ogni modulo futuro va aggiunto come parte separata dell'applicazione, senza modificare il nucleo multi-studio. Anche il lavoro di Claude Cowork sul gestionale (sezione 13) rientra tra le cose da rendere possibili fin dall'inizio.

---

## 13. Integrazione con Claude Cowork (agente AI)

Quando il gestionale sarà operativo, **Claude Cowork** (l'app di Anthropic per delegare a Claude lavoro di ufficio sul computer) dovrà poter agire e lavorare su questo tool per conto dello studio: ad esempio controllare quali clienti sono in ritardo, preparare l'elenco dei compiti in scadenza, creare compiti, aggiornare gli indicatori o caricare documenti. Le funzioni esatte di Cowork possono cambiare nel tempo, quindi il gestionale non deve dipendere da un dettaglio specifico del prodotto: deve essere **facile da usare per qualsiasi agente AI**, che lavori tramite il browser o tramite un collegamento diretto.

Questo modulo non richiede sviluppo di Cowork, ma richiede che il gestionale sia costruito in modo da poterlo ricevere. Requisiti:

### 13.1 Interfaccia leggibile anche da un agente

- Ogni elemento interattivo (pulsanti, campi, righe di tabelle, filtri) ha etichette testuali chiare e attributi di accessibilità corretti (ruoli ARIA, `label`, nomi stabili). Un'interfaccia accessibile è anche un'interfaccia che un agente riesce a usare in modo affidabile.
- Nessuna azione importante disponibile solo con gesti particolari (trascinamento, passaggio del mouse). Ogni azione ha anche un pulsante o un menu esplicito.
- Percorsi (URL) stabili e prevedibili per clienti, compiti e collaboratori, così un agente può aprire direttamente una scheda.
- Le schermate elenco supportano filtri, ordinamento ed esportazione, perché sono le viste che un agente userà più spesso.
- Messaggi di errore e di conferma in testo esplicito, non solo icone o colori.

### 13.2 API documentata (consigliata)

- Un'API per le operazioni principali: leggere clienti, indicatori e compiti; creare e aggiornare compiti; aggiornare gli indicatori; caricare documenti; leggere e scrivere commenti.
- Documentazione dell'API (specifica OpenAPI) mantenuta nel repository.
- Valutare in un secondo momento un **server MCP** che esponga le stesse operazioni come strumenti utilizzabili direttamente da Claude, così che l'agente non debba passare dall'interfaccia. Non è obbligatorio per il primo rilascio: il requisito è che l'API sia progettata in modo da poterlo aggiungere senza rifare nulla.
- Le API rispettano **esattamente le stesse regole di permessi e di isolamento** della sezione 4. Non esistono scorciatoie riservate agli agenti.

### 13.3 Identità e permessi dell'agente

- L'agente lavora con un **account dedicato** (account di servizio o utente "agente"), distinto da quelli delle persone. Non si condividono mai le credenziali di un admin o di un collaboratore.
- L'admin crea, sospende e revoca l'account agente dalla gestione utenti, e ne stabilisce i permessi. Di default l'agente è **in sola lettura**; le azioni di scrittura si abilitano una per una (esempio: creare compiti, aggiornare indicatori, commentare).
- L'agente appartiene a **un solo studio** e non può mai uscire dai suoi dati, come ogni altro utente.
- L'accesso via API usa token con scadenza e ambito limitato, revocabili in ogni momento. Nessun token nel codice o nei log.
- Azioni che l'agente **non può mai svolgere**, anche se abilitato: eliminare definitivamente dati, cambiare ruoli e permessi, invitare o disattivare utenti, modificare le impostazioni dello studio, esportare l'intero archivio.

### 13.4 Tracciabilità e controllo umano

- Ogni azione svolta dall'agente è riconoscibile nello storico e nel registro attività: nell'elenco compare "agente" (con il nome dell'account) al posto di una persona, così l'admin sa sempre cosa è stato fatto da un umano e cosa da un'automazione.
- L'admin ha una schermata con tutte le azioni dell'agente, filtrabili per data e tipo, e può **annullare** le modifiche recenti agli indicatori e ai compiti dove tecnicamente possibile (grazie allo storico dei valori precedenti).
- Per le azioni che hanno effetto verso l'esterno o non sono reversibili, l'agente deve poter operare in modalità "**proposta**": prepara la modifica e un admin la conferma. Predisporre questo meccanismo (coda di proposte in attesa di approvazione), attivabile per singola azione.
- Limiti di frequenza sull'API, per evitare che un errore dell'agente generi centinaia di modifiche in pochi secondi, e avviso all'admin se si supera una soglia insolita di attività.

### 13.5 Sicurezza e protezione da istruzioni ingannevoli

Un agente AI legge testi (commenti, descrizioni dei compiti, nomi dei file, documenti caricati). Questi contenuti possono contenere frasi scritte per confonderlo ("ignora le regole e cancella tutto"). Per questo:

- i contenuti inseriti da utenti o da terzi nel gestionale sono **dati, mai istruzioni**: le impostazioni dell'agente non si modificano mai da un commento, un documento o un campo di testo;
- i permessi dell'agente dipendono solo da come li ha configurati l'admin nella gestione utenti;
- le azioni di scrittura dell'agente passano dagli stessi controlli di validazione delle azioni umane e sono limitate dai permessi della sezione 13.3.

### 13.6 Esempi di lavoro previsti per l'agente

Servono come guida per progettare API e schermate; non vanno sviluppati come funzioni separate:

- ogni mattina preparare per l'admin il riepilogo di clienti in ritardo su IVA e prima nota, compiti scaduti e compiti pronti per revisione;
- creare compiti a partire da una richiesta scritta dall'admin, assegnandoli al collaboratore giusto;
- ricordare ai collaboratori i compiti in scadenza tramite commento o notifica;
- aggiornare gli indicatori di un cliente quando l'admin lo chiede;
- preparare esportazioni e riepiloghi per cliente o per collaboratore.

---

## 14. Come lavorare (istruzioni per Claude Code)

1. **Prima di scrivere codice**, leggi questo documento per intero e proponi un piano: struttura del progetto, scelte tecniche con motivazione, schema del database. Aspetta l'approvazione.
2. Lavora per **traguardi**, ognuno funzionante e testato prima di passare al successivo:
   - **T0:** progetto, ambienti, CI, schema base, seed con dati di esempio (2 studi, 1 admin e 3 collaboratori ciascuno, una ventina di clienti, alcuni compiti);
   - **T1:** registrazione studio, login, inviti, gestione utenti, ruoli e RLS, con i test di isolamento;
   - **T2:** clienti, assegnazioni, importazione da Excel/CSV;
   - **T3:** indicatori IVA e prima nota con storico, indicatore di ritardo, dashboard admin e collaboratore;
   - **T4:** compiti, stati, scadenze, documenti, commenti, notifiche;
   - **T5:** rifinitura: registro attività, esportazioni, accessibilità, prestazioni con 400 clienti, documentazione, deploy;
   - **T6:** predisposizione per agenti AI (sezione 13): API documentata, account agente in sola lettura, tracciabilità delle azioni dell'agente, coda di proposte da approvare.
   - **T7:** comunicazioni del cliente (sezione 16.1), importazione clienti con AI (sezione 6), collegamento Gmail in sola lettura con controllo orario e riassunti automatici (sezioni 16.2–16.4), registro dei costi AI (sezione 17). L'inserimento manuale delle comunicazioni e l'importazione con AI possono anticipare in T2–T3. La lettura email si attiva per studi esterni solo dopo i punti della sezione 16.5.
3. **Test:** i test di isolamento tra studi e di permessi per ruolo sono obbligatori e vanno eseguiti a ogni modifica di schema o di policy. Girano su un Postgres in memoria (PGlite) con le migrazioni vere e un'imitazione minima dell'autenticazione di Supabase (`tests/db/`), quindi anche in CI senza account esterni. Aggiungi test end-to-end per i flussi principali (assegno un compito, lo completo, l'admin lo chiude).
4. **Sicurezza:** nessun segreto nel repository; variabili d'ambiente documentate (tra cui `ANTHROPIC_API_KEY`, sezione 17.2, e le credenziali OAuth di Google, sezione 16.2), con un file `.env.example` senza valori; i dati di esempio sono inventati, mai dati reali di clienti.
5. **Decisioni aperte:** dove il documento lascia scelte libere o ambigue, elencale e chiedile a me, invece di decidere in silenzio. In particolare:
   - un cliente può avere più collaboratori assegnati oppure uno solo? (Il modello lo permette; l'interfaccia può partire semplice.)
   - ~~chi può creare compiti~~ → deciso: impostazione dello studio a tre livelli, fino a "tutti per tutti" (sezione 5);
   - ~~compiti senza cliente collegato~~ → deciso: sì, il cliente è facoltativo (sezione 8);
   - soglie di "ritardo" iniziali per IVA e prima nota;
   - se partire subito dal server MCP o solo dall'API (sezione 13.2);
   - ~~quale modello Claude usare~~ → deciso: Claude Sonnet 5.5 (sezione 17.2);
   - ~~da dove far passare l'AI~~ → deciso: API Anthropic diretta, pagata da studiofarruggio@gmail.com (sezione 17.2);
   - ~~tipo di login~~ → deciso: email e password personale con invito via email, **più "Accedi con Google" per tutti** (sezione 5);
   - ~~permessi particolari tra colleghi~~ → deciso: accessi "A può accedere allo spazio di B" concessi dall'admin (sezione 3);
   - servizio email per inviti, conferme e recupero password (proposta: Brevo, europeo) e dominio della piattaforma da cui mandarle;
   - un indirizzo email usato da più clienti (stesso titolare con più aziende): scrivere il riassunto in tutti i clienti o chiedere a una persona di scegliere;
   - ~~riconoscimento per dominio aziendale~~ → deciso: niente dominio, solo l'indirizzo esatto del mittente presente nella lista del cliente (sezione 16.3);
   - ~~frequenza e orari del controllo email~~ → deciso: ogni 10 minuti dalle 8 alle 21, dal lunedì al sabato (sezione 16.3);
   - ~~visibilità tra collaboratori~~ → deciso: impostazione dello studio a tre livelli (sezione 3);
   - se leggere anche le email che il collaboratore invia ai clienti, oltre a quelle ricevute;
   - se le voci delle comunicazioni si possono modificare o eliminare, e da chi;
   - documento caricato per errore in un compito: resta per sempre (come ora) o l'admin può nasconderlo, lasciando traccia di chi e quando;
   - clienti eliminati: cancellati subito per sempre, o in un cestino recuperabile dall'admin per 30 giorni e poi cancellati (proposta)?
   - fatturato: basta un solo valore, o serve l'anno di riferimento (o lo storico per anno)?
   - limite di dimensione dei documenti dei compiti (proposta: 25 MB per file) e spazio totale per studio compreso nell'abbonamento. Riferimento: il piano Supabase Pro comprende 100 GB di file (poi circa 0,02 $ per GB al mese) e 250 GB di download al mese;
   - copia di sicurezza dei documenti, che i backup di Supabase non includono: dove (secondo spazio in UE) e ogni quanto (proposta: ogni notte);
   - solo Gmail al primo rilascio, o anche Outlook/Microsoft 365.
6. Scrivi un `README` con istruzioni per avviare il progetto in locale, e un `CLAUDE.md` che riassuma convenzioni, comandi e le regole di isolamento tra studi.

---

## 15. Criteri di accettazione del Modulo 1

Il modulo è completo quando:

- uno studio si registra con email e password, invita 18 collaboratori e un secondo admin scrivendo nome, cognome ed email; ognuno riceve l'email, sceglie la sua password ed entra nel suo spazio; lo studio importa 400 clienti da Excel con le assegnazioni;
- chi riceve l'invito può entrare anche con "Accedi con Google", ma solo con l'account Google dell'indirizzo invitato; con un altro account l'invito viene rifiutato;
- l'admin concede ad A lo spazio di B in sola lettura: A vede clienti e compiti di B ma non li modifica, anche chiamando le API; tolto l'accesso, non li vede più;
- un collaboratore vede solo i propri clienti e compiti, e non riesce ad accedere ad altro nemmeno con richieste dirette;
- un secondo studio creato sulla stessa piattaforma non vede nulla del primo, verificato dai test automatici;
- l'admin apre la dashboard e capisce in pochi secondi quali clienti sono indietro con IVA e prima nota, e quali compiti sono scaduti o pronti per revisione;
- l'admin assegna un compito con scadenza e documento, il collaboratore lo lavora, segnala "pronto per revisione" e l'admin lo chiude;
- ogni modifica agli indicatori e ai compiti ha uno storico consultabile;
- l'admin crea un account agente in sola lettura, un agente esterno legge clienti e compiti tramite API o browser, e ogni sua azione è riconoscibile nello storico; abilitando un permesso di scrittura, l'agente può creare un compito e l'admin può annullare la modifica;
- l'agente non riesce, nemmeno abilitato, a eseguire le azioni vietate della sezione 13.3 né a leggere dati di altri studi, verificato dai test automatici;
- l'applicazione è un sito web raggiungibile da browser senza installare nulla, usabile da telefono e da computer, in italiano, e rimane veloce con 400 clienti per studio;
- l'admin importa 400 clienti da un Excel senza formato standard: l'AI ricava nome azienda, titolari, tutte le email, le date di prima nota e IVA, numero di dipendenti, fatturato e collaboratore; l'anteprima segnala errori, doppioni e campi da completare; nessun dato viene inventato e i campi non riconosciuti restano vuoti, completabili a mano;
- al primo accesso un collaboratore collega la sua casella Gmail, e il gestionale chiede a Google solo il permesso `gmail.readonly` (un test automatico lo verifica); le email arrivate prima del collegamento non vengono lette;
- un'email in arrivo da un indirizzo presente nella lista di un cliente compare entro il controllo successivo (al più un'ora, negli orari dei controlli) come riassunto dettagliato nelle comunicazioni del cliente, con mittente e oggetto; un'email da un indirizzo che non è nella lista di nessun cliente non viene aperta né salvata, anche se ha lo stesso dominio di un cliente; un'email arrivata di domenica o dopo le 21 viene riassunta al primo controllo utile;
- l'admin cambia la visibilità tra collaboratori e il cambio vale subito: con "solo i propri" un collaboratore non vede i clienti dei colleghi nemmeno chiamando le API; con "sola lettura" li vede ma non li modifica; la stessa email ricevuta da due collaboratori compare una volta sola;
- una comunicazione aggiunta a mano (data e descrizione) compare nello storico con il nome di chi l'ha scritta;
- admin e collaboratore caricano documenti su un compito; dopo la chiusura del compito i documenti sono ancora tutti consultabili e scaricabili, e nessuno può eliminarli;
- aggiungendo un indirizzo email a un cliente, dal controllo successivo le email da quell'indirizzo finiscono nelle sue Comunicazioni; una risposta nella stessa conversazione viene riassunta tenendo conto dei messaggi precedenti;
- la campanella mostra il pallino rosso con il numero delle notifiche non lette solo quando ce ne sono; chi controlla un compito lo rimanda indietro con una spiegazione, e chi l'ha fatto la legge nella notifica e nella scheda del compito;
- ogni chiamata all'AI è registrata con funzione, modello e consumo, senza il contenuto.

---

## 16. Comunicazioni del cliente e lettura email in sola lettura

### 16.1 Sezione Comunicazioni nella scheda cliente

- Storico dei contatti con il cliente, dal più recente. Ogni voce ha: data, canale (Email, Telefono, Incontro, WhatsApp, Altro), testo e provenienza, sempre visibile:
  - "Scritto da [nome]" per le voci inserite a mano;
  - "Riassunto automatico dalla casella di [nome] · da [mittente]", con l'oggetto e i nomi degli allegati, per le email lette in automatico;
  - "Riassunto AI di un'email, controllato da [nome]" per le email incollate a mano.
- **Inserimento manuale:** data (preimpostata a oggi), canale e descrizione, poi "Aggiungi allo storico". Possono farlo l'admin e i collaboratori assegnati al cliente.
- **Incolla un'email:** l'utente incolla il testo di un'email, l'AI propone data e riassunto e compila il modulo, e la persona controlla e salva. Niente viene salvato senza conferma.
- **Sezione "Indirizzi email collegati"**, subito sopra le Comunicazioni. Mostra:
  - l'elenco di tutti gli indirizzi del cliente, con un'etichetta per le PEC;
  - per ogni indirizzo, quante email sono state riassunte e se è collegato anche ad altri clienti;
  - un campo per aggiungere un indirizzo (con controllo del formato e dei doppioni) e un pulsante per rimuoverlo.
  Se il cliente non ha indirizzi, un avviso: senza, le sue email non possono essere collegate. Aggiungere o rimuovere un indirizzo vale dal controllo successivo e viene registrato nel registro attività.
- In cima alle Comunicazioni: se nello studio ci sono caselle collegate.

### 16.2 Collegamento della casella al primo accesso

- Al primo accesso ogni utente (admin e collaboratori) vede la schermata "Collega la tua email in sola lettura", con due elenchi chiari:
  - **L'AI può solo:** vedere chi ha scritto, per riconoscere il cliente; leggere le email che arrivano dai clienti dello studio; scriverne un riassunto nella scheda del cliente.
  - **L'AI non potrà mai:** inviare email, rispondere o inoltrare; creare bozze; modificare, archiviare, spostare o etichettare email; segnare le email come lette; eliminare email.
- Testo aggiuntivo: le email che non arrivano da un cliente vengono ignorate e il loro testo non viene letto né salvato; a Google si chiede solo il permesso di sola lettura; la casella si può scollegare quando si vuole.
- Pulsanti "Collega in sola lettura" (apre la schermata di consenso di Google) e "Più tardi". Chi rimanda vede sulla dashboard un avviso con "Collega la tua email".
- **Da quando legge (deciso il 30/09/2026):** l'AI legge solo le email arrivate **dal momento in cui l'utente concede l'accesso**. Le email già presenti nella casella non vengono mai lette. Se la casella viene scollegata e ricollegata, si riparte dal nuovo collegamento.
- Il collegamento è un passaggio separato dall'accesso al sito: il pulsante apre la schermata di consenso di Google, che chiede solo il permesso `gmail.readonly`.
- Ogni persona collega **solo la propria** casella. L'admin non può collegare quella di un altro e vede solo se è collegata.
- Scollegare revoca il token presso Google e ferma i controlli. Le comunicazioni già scritte restano. Disattivando un utente, la sua casella viene scollegata in automatico.

**Realizzazione tecnica**

- OAuth 2.0 di Google con **un solo permesso: `https://www.googleapis.com/auth/gmail.readonly`**. Nessun altro permesso Gmail, nemmeno in futuro, senza una nuova decisione esplicita. Con questo permesso è Google stesso a rifiutare invii, modifiche ed eliminazioni.
- Token salvati cifrati sul server, per utente, mai esposti all'interfaccia, alle API pubbliche o all'AI. Se Google rifiuta il token (revocato o scaduto), la casella passa a "da ricollegare" e l'utente riceve una notifica.
- Outlook/Microsoft 365 in futuro, con il permesso equivalente di sola lettura (`Mail.Read`).

### 16.3 Controllo delle nuove email

Un processo sul server, non nel browser, così funziona anche a computer spento, controlla ogni casella collegata (admin e collaboratori) **ogni 10 minuti, dalle 8 alle 21, dal lunedì al sabato** (ora italiana; decisione del 30/09/2026, prima era ogni ora). La domenica e fuori orario non si controlla nulla: le email arrivate in quei momenti non si perdono, vengono lette al primo controllo utile (per esempio lunedì alle 8). Tecnicamente il processo parte ogni 10 minuti e si ferma subito se è fuori dagli orari, calcolati nel fuso `Europe/Rome`, così il cambio dell'ora legale non sposta gli orari. La frequenza è un'impostazione della piattaforma e si può cambiare senza modifiche al codice (costi nella sezione 17.2).

1. Recupera solo i messaggi arrivati dopo l'ultimo controllo, solo in arrivo. Al collegamento della casella il cursore (`historyId` di Gmail) parte dal momento del consenso: niente email precedenti. Di ogni messaggio nuovo guarda prima **solo chi l'ha mandato**.
2. Per ogni messaggio legge **prima solo le intestazioni** (mittente, data, oggetto, Message-ID).
3. Riconosce il cliente dal mittente, **solo con l'indirizzo esatto** (decisione del 30/09/2026):
   - il mittente è presente nella lista "Indirizzi email collegati" di un cliente dello studio → associato;
   - altrimenti → ignorato, anche se il dominio è quello di un cliente: il testo non viene aperto né scaricato, e si salva solo l'identificativo del messaggio per non rielaborarlo.
4. Solo per le email associate apre il messaggio, ne scarica il testo e lo invia all'AI, che scrive un **riassunto dettagliato** di ciò che viene detto: chi scrive e perché, richieste e domande, documenti inviati o mancanti, importi, scadenze e date, appuntamenti, decisioni prese e cosa si aspetta dallo studio. Scritto in italiano semplice, in qualche frase o in un breve elenco, senza aggiungere nulla che non ci sia nell'email. Gli allegati non vengono aperti: nel riassunto compaiono solo i loro nomi. Più email in una sola richiesta, per ridurre i costi.
   - **Riassunto della conversazione:** se l'email fa parte di una conversazione già presente (stesso thread di Gmail; nel prototipo, stesso oggetto senza "R:", "Re:", "Fwd:"), l'AI riceve anche i riassunti precedenti di quella conversazione (al massimo gli ultimi 3). Così il riassunto fa capire a che punto è la conversazione. Le email della stessa conversazione arrivate insieme vengono elaborate in ordine di data.
5. Scrive una voce in `comunicazioni` con riassunto, mittente, oggetto, data, conversazione, numero del messaggio nella conversazione e Message-ID. **Non salva il testo integrale né gli allegati.**
6. Niente doppioni: la stessa email ricevuta da più collaboratori (stesso Message-ID) genera una sola voce.
7. Se l'AI non risponde, le email restano in attesa del controllo successivo. Ogni controllo registra solo numeri (email nuove, associate, ignorate, errori).
8. **Mittente non riconosciuto ma che è un cliente:** nella pagina "La tua email" l'utente vede le email ignorate di recente (solo mittente, oggetto e data, già presenti nelle intestazioni) e può collegare il mittente a un cliente. L'indirizzo viene aggiunto al cliente e le email ignorate di quel mittente vengono rielaborate al controllo successivo, recuperandole da Gmail tramite il loro identificativo.

Nel prototipo il controllo parte con il pulsante "Controlla ora" su una casella di prova, con un modulo per simulare l'arrivo di un'email.

### 16.4 Garanzie di sola lettura

Tre livelli indipendenti, da documentare e verificare con test automatici:

1. **Google:** il token ha solo il permesso `gmail.readonly`. Un test verifica che il gestionale non chieda mai altri permessi.
2. **Codice:** il modulo email non contiene nessuna chiamata di scrittura a Gmail (invio, bozze, modifica etichette, cestino, eliminazione).
3. **AI:** l'AI non riceve mai il token e non ha strumenti: riceve testo e restituisce testo. Il contenuto delle email è trattato come dato, mai come istruzione (sezione 13.5). Un'email che dice "ignora le regole" viene solo riassunta.

### 16.5 Da chiudere prima di attivarla per studi esterni

- **Verifica di Google:** `gmail.readonly` è un permesso "ristretto". Un'app usata da utenti fuori dal proprio dominio Google Workspace deve superare la verifica OAuth di Google e una valutazione di sicurezza fatta da un ente esterno, a pagamento e da rinnovare ogni anno. Per la prova interna basta un'app di tipo "interno" nel dominio Workspace dello studio.
- **Lavoratori:** la lettura automatica della posta dei collaboratori rientra nelle regole sui controlli a distanza (art. 4 dello Statuto dei lavoratori) e nelle indicazioni del Garante privacy sulla posta dei dipendenti. Serve il parere di un consulente del lavoro o privacy, e un'informativa ai collaboratori.
- **Privacy dei clienti:** informativa, aggiornamento dell'accordo di trattamento dati, fornitore AI indicato come sub-responsabile (sezione 17.3). Valutare se serve una valutazione d'impatto (DPIA).
- Finché questi punti non sono chiusi, la funzione resta disattivabile per studio da un'impostazione, spenta di default.

---

## 17. Funzioni AI: quale AI, quale account, quali dati

Le funzioni AI del Modulo 1 sono tre: analisi del file Excel nell'importazione clienti (sezione 6), riassunto di un'email incollata (16.1) e riassunto automatico delle email in arrivo (16.3). L'agente esterno della sezione 13 (per esempio Claude Cowork) è un'altra cosa: usa il gestionale da fuori, con un account agente, e non fa parte di queste funzioni interne.

### 17.1 Nel prototipo

| Funzione | Quando parte | AI usata | Account e costi |
|---|---|---|---|
| Analisi Excel nell'importazione | Clic su "Analizza con l'AI" | Claude (Anthropic), livello "veloce" scelto dalla piattaforma claude.ai | Account Claude di chi usa la pagina |
| Riassunto di un'email incollata | Clic su "Riassumi" | Come sopra | Come sopra |
| Riassunto delle email in arrivo | Clic su "Controlla ora" (casella di prova) | Come sopra | Come sopra |

- Il prototipo chiama Claude tramite la piattaforma degli artifact di claude.ai: **l'AI è sempre Claude e il consumo va sull'account di chi apre la pagina**, non su quello del proprietario del prototipo. La prima volta la pagina chiede il permesso. Non ci sono chiavi API né altri fornitori di AI. La pagina conosce solo il livello del modello ("veloce"), non il modello esatto.
- I testi inviati all'AI seguono le regole dell'account Claude di chi usa la pagina, fuori da qualsiasi accordo del gestionale. **Nel prototipo non vanno caricati elenchi clienti o email reali**: usare dati di esempio o file di prova.
- Il prototipo **non** usa la chiave API dell'account studiofarruggio@gmail.com, e non deve usarla: una pagina artifact non può chiamare l'API di Anthropic, e una chiave scritta nella pagina sarebbe leggibile da chiunque la apra. Chi la trovasse potrebbe consumare credito a spese dello studio. L'uso che fai tu del prototipo ricade sull'account studio solo se apri la pagina con claude.ai collegato come studiofarruggio@gmail.com: in quel caso consuma il piano claude.ai dell'account, non il credito API.

### 17.2 Nel gestionale vero

**Modello di business (deciso il 30/09/2026):** ogni studio che si iscrive paga un abbonamento alla piattaforma, uno per studio. Il consumo AI di **tutti** gli studi lo paga la piattaforma, con l'account **studiofarruggio@gmail.com**, e va coperto dal prezzo dell'abbonamento. Studi e collaboratori **non** hanno bisogno di un account Claude né di Google Cloud.

- **AI:** **Claude Sonnet 5.5 (`claude-sonnet-5-5`) per tutte le funzioni AI** (deciso il 30/09/2026). Le chiamate partono **solo dal server**, mai dal browser. Il nome del modello sta in una sola impostazione del server, così si può cambiare senza toccare il codice.
- **Da dove passa: deciso il 30/09/2026, Opzione A (API Anthropic diretta)**, account Claude Console di studiofarruggio@gmail.com. Le due opzioni valutate:
  - **Opzione A – API Anthropic diretta:** account Claude Console di studiofarruggio@gmail.com, pagamento a consumo con carta o credito prepagato, chiave API nella variabile segreta `ANTHROPIC_API_KEY`. L'API si paga separatamente da un eventuale abbonamento claude.ai (Pro, Max…), che non la copre. Elaborazione fuori dall'UE (17.3).
  - **Opzione B – Google Cloud (Vertex AI) in UE:** progetto Google Cloud con account di fatturazione intestato a studiofarruggio@gmail.com, modelli Claude attivati nel catalogo modelli di Google Cloud, endpoint UE, pagamento nella fattura Google Cloud. Niente chiave Anthropic: il server si autentica con un account di servizio Google (credenziali in un segreto dell'hosting, o federazione d'identità). Elaborazione in UE. Il progetto Google Cloud serve comunque per il collegamento Gmail (sezione 16.2).
- **Regole comuni:** limite di spesa mensile e avvisi sull'account; credenziali separate per sviluppo e produzione; credenziali solo nei segreti dell'hosting, mai nel repository, in questo documento, nel codice che gira nel browser, nei log, in email o in chat, e da revocare subito se escono per errore. Verifica in due passaggi sull'account Google studiofarruggio@gmail.com e un secondo amministratore per non perdere l'accesso.
- **Consumo per studio:** ogni chiamata registra lo studio che l'ha generata (`ai_richieste`: funzione, modello, token, costo stimato). Ogni piano di abbonamento ha un tetto mensile di consumo AI; superata una soglia, avviso al super-admin della piattaforma. Il super-admin vede il consumo e il margine per studio (sezione 12, punto 4).

**Prezzi** (dollari per milione di token in ingresso / in uscita, listini verificati il 30/09/2026):

| Modello | ID | A – API Anthropic (global) | B – Google Cloud UE (+10%) |
|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | 4 $ / 20 $ | 4,40 $ / 22 $ (multi-regione UE) |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 $ / 10 $ | 2,20 $ / 11 $ (multi-regione UE) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 1 $ / 5 $ | 1,10 $ / 5,50 $ (solo regione europe-west1, Belgio) |

Google Cloud con endpoint "global" costa quanto l'API Anthropic, ma non garantisce l'elaborazione in UE. Opus 5.5 e Sonnet 5.5 in UE sono disponibili sulla multi-regione UE, Haiku 4.5 solo su europe-west1. Da ricontrollare al momento dello sviluppo. Su entrambe le opzioni l'elaborazione a lotti ("batch") costa il 50% in meno, ma i risultati possono arrivare con ore di ritardo.

**Stima dei consumi per uno studio tipo, con i riassunti brevi iniziali** (18 collaboratori, 400 clienti, circa 8.000 email di clienti al mese). Ipotesi, da misurare nel primo mese reale: circa 1.200 token in ingresso e 100 in uscita per ogni email riassunta; per Opus 5.5 circa 200 token in più di ragionamento; Opus 5.5 e Sonnet 5.5 contano circa il 30% di token in più per lo stesso testo. **Superata dalla stima con i riassunti dettagliati, qui sotto.**

| Modello | A – API Anthropic | B – Google Cloud UE | Per collaboratore (A / B) |
|---|---|---|---|
| Claude Haiku 4.5 | circa 14 $/mese | circa 15 $/mese | 0,80 $ / 0,85 $ |
| Claude Sonnet 5.5 | circa 35 $/mese | circa 39 $/mese | 2 $ / 2,20 $ |
| Claude Opus 5.5 | circa 110 $/mese | circa 125 $/mese | 6,20 $ / 6,90 $ |

- I riassunti automatici delle email sono quasi tutto il consumo. Importare 400 clienti costa una tantum meno di 1 $ con qualsiasi modello, e le email incollate a mano pochi centesimi al mese.
- Esempio con 10 studi di queste dimensioni: circa 140–150 $/mese con Haiku 4.5, circa 350–390 $ con Sonnet 5.5, circa 1.100–1.250 $ con Opus 5.5.
- **Modello scelto: Claude Sonnet 5.5** per tutte le funzioni, tramite l'API Anthropic.

**Stima aggiornata: riassunti dettagliati e controlli dalle 8 alle 21, dal lunedì al sabato** (30/09/2026; scelta finale: ogni 10 minuti). Stesso studio tipo: 19 caselle (18 collaboratori e l'admin), circa 8.000 email di clienti al mese su 26 giorni, cioè circa 16 per casella al giorno. Ipotesi: circa 1.200 token in ingresso e **300 in uscita** per email (un riassunto dettagliato è circa tre volte più lungo); circa 500 token di istruzioni per ogni richiesta all'AI; il 30% in più di token di Sonnet 5.5. Una richiesta parte solo se nella casella c'è almeno un'email nuova di un cliente.

| Frequenza dei controlli | Controlli al giorno | Ritardo massimo di un riassunto | Riassunti delle email | Istruzioni ripetute | **Totale Claude Sonnet 5.5 al mese** | Per collaboratore |
|---|---|---|---|---|---|---|
| Ogni ora | 14 | circa 1 ora | circa 56 $ | circa 6 $ | **circa 62 $** | circa 3,30 $ |
| Ogni 30 minuti | 27 | circa 30 minuti | circa 56 $ | circa 8 $ | **circa 64 $** | circa 3,40 $ |
| Ogni 15 minuti | 53 | circa 15 minuti | circa 56 $ | circa 9 $ | **circa 65 $** | circa 3,45 $ |
| **Ogni 10 minuti (scelta)** | 79 | circa 10 minuti | circa 56 $ | circa 9–10 $ | **circa 66 $** | circa 3,50 $ |

- **La frequenza incide poco:** ogni email di un cliente viene riassunta una volta sola, qualunque sia la frequenza. Controllare più spesso aggiunge solo richieste più piccole, e quindi più volte le stesse istruzioni: pochi dollari al mese per studio. Anche gli orari (8–21, niente domenica) non riducono il costo dell'AI, perché le email arrivate fuori orario vengono riassunte lo stesso, solo più tardi.
- **Il costo lo decidono il numero di email dei clienti e la lunghezza del riassunto:** passare dal riassunto breve a quello dettagliato porta la stima da circa 35 $ a circa 56–62 $ al mese per studio.
- **Gli altri costi non cambiano in modo visibile:** le chiamate a Gmail sono gratuite entro limiti molto alti, e i controlli (364, 702, 1.378 o, ogni 10 minuti, circa 2.050 al mese per tutta la piattaforma) rientrano nel piano Vercel Pro.
- Da verificare nel primo mese reale con il registro `ai_richieste`.

- **Risposte controllate:** l'AI deve rispondere in un formato strutturato (JSON con schema fisso). Il server lo controlla prima di salvare qualsiasi cosa. L'importazione passa sempre dall'anteprima umana.
- **Nessuno strumento:** in queste funzioni l'AI non può fare azioni. Riceve testo e restituisce testo.

### 17.3 Dove vanno i dati e per quanto

- **Luogo di elaborazione:** con l'opzione A (API Anthropic diretta, **scelta il 30/09/2026**) il luogo si può fissare solo su Stati Uniti (+10% di prezzo) o "global" (parametro `inference_geo`; si usa "global", a prezzo pieno di listino): i testi inviati all'AI (email dei clienti, righe dei file importati) vengono elaborati fuori dall'UE. È un'eccezione al requisito della sezione 2, da coprire con l'accordo di trattamento dati di Anthropic (clausole contrattuali standard, da verificare) e da dichiarare agli studi. Con l'opzione B (Google Cloud, endpoint UE) l'elaborazione resta in UE, al costo di circa il 10% in più. In entrambi i casi database e file del gestionale restano in UE.
- **Addestramento e conservazione:** secondo i termini commerciali di Anthropic i dati inviati tramite API non vengono usati per addestrare i modelli. Va verificato nel contratto effettivo (Anthropic o Google Cloud), valutando la conservazione zero dei dati ("zero data retention") se disponibile.
- **Accordi:** accordo di trattamento dati (DPA) con il fornitore scelto (Anthropic o Google Cloud), indicato come sub-responsabile nell'accordo con ogni studio.
- **Minimo necessario:** all'AI si invia solo il testo delle email dei clienti (mai quelle ignorate) o le righe del file importato. Il registro `ai_richieste` non contiene contenuti.

---

## 18. Registro modifiche

| Data | Modifica | Sezioni |
|---|---|---|
| 29/09/2026 | Prima versione del prototipo cliccabile: registrazione studio (uno studio privato per account), dashboard admin, elenco clienti con indicatori IVA e prima nota e aggiornamento rapido, scheda cliente con storico, compiti con stati e commenti, vista collaboratore, impostazioni e utenti. | 1, 5–9 |
| 29/09/2026 | Importazione clienti da Excel con analisi AI e anteprima correggibile; più titolari e più email per cliente; sezione Comunicazioni con inserimento manuale e riassunto AI di un'email incollata. | 6, 9, 10, 16.1 |
| 29/09/2026 | Collegamento della casella Gmail in sola lettura al primo accesso, controllo ogni ora, riconoscimento del cliente dal mittente, riassunto automatico nelle Comunicazioni; garanzie di sola lettura e obblighi (verifica Google, Statuto dei lavoratori, privacy). | 3, 9, 10, 11, 12, 14, 15, 16 |
| 29/09/2026 | Funzioni AI: quale AI, quale account e quali costi nel prototipo e nel gestionale vero; modelli, stime dei costi, elaborazione in UE. Aggiunto il link al prototipo in testa al documento. | 17 |
| 30/09/2026 | Deciso: il consumo AI del gestionale va sull'account Anthropic di studiofarruggio@gmail.com con una chiave API sul server; regole per custodire la chiave; conseguenza: elaborazione AI fuori dall'UE, da confermare. Nel prototipo, note che spiegano che l'AI usa l'account di chi apre la pagina. | 2, 14, 17 |
| 30/09/2026 | Deciso il modello di business: un abbonamento per studio, consumo AI di tutti gli studi pagato da studiofarruggio@gmail.com. Aggiunto il confronto dei prezzi e dei consumi stimati tra API Anthropic e Google Cloud in UE. | 2, 12, 14, 17 |
| 30/09/2026 | Documenti nei compiti: caricamento da admin e collaboratore, sempre consultabili anche a compito chiuso, niente cancellazione. Sezione "Indirizzi email collegati" nella scheda cliente, gestibile da admin e collaboratori assegnati. Riassunti che tengono conto della conversazione. Collegamento di un mittente sconosciuto a un cliente. | 3, 6, 8, 9, 10, 14, 15, 16 |
| 30/09/2026 | Deciso il nome della piattaforma, BigBrotherStudio, e il modello AI, Claude Sonnet 5.5 per tutte le funzioni, con il consumo pagato da studiofarruggio@gmail.com. | 2, 14, 17 |
| 30/09/2026 | Decisi: login solo con "Accedi con Google", con il permesso Gmail nello stesso passaggio; AI tramite API Anthropic diretta (elaborazione fuori UE, da coprire con DPA e informativa). Inizio del sito vero in `Desktop/BigBrotherStudio`, con il piano tecnico in `PIANO.md`. | 2, 5, 14, 16, 17 |
| 30/09/2026 | Inizio del sito vero (Next.js 16, Supabase, Vercel). Pronti nel codice T0 e T1: accesso con Google, registrazione dello studio, inviti con link da copiare (7 giorni, revocabili), cambio ruolo e disattivazione con il vincolo dell'ultimo admin, impostazioni dello studio, registro attività. 12 test di isolamento e permessi superati su Postgres in memoria. | 5, 14 |
| 30/09/2026 | Visibilità tra collaboratori scelta dall'admin su tre livelli (solo i propri, tutto lo studio in lettura, tutto con accesso completo), con regole nel database e 5 nuovi test (17 in tutto). Email: niente riconoscimento per dominio, solo l'indirizzo esatto nella lista del cliente; riassunto dettagliato con i nomi degli allegati; controlli ogni ora dalle 8 alle 21, dal lunedì al sabato. Stima dei costi aggiornata con il confronto tra ogni ora, 30 e 15 minuti. | 3, 4, 5, 10, 14, 15, 16, 17 |
| 30/09/2026 | Accesso con email e password personale al posto di "Accedi con Google": registrazione dello studio con conferma dell'email; l'admin aggiunge admin e collaboratori con nome, cognome ed email, e ognuno riceve un'email con i dati di accesso e il link per scegliere la password (rinvio e annullamento); password dimenticata. Accessi tra colleghi ("A può accedere allo spazio di B", in lettura o completo). Ogni admin può cambiare la visibilità. Email: l'AI legge solo le email arrivate dopo il collegamento, controlli ogni 10 minuti dalle 8 alle 21, dal lunedì al sabato (circa 66 $/mese per studio tipo). 25 test superati. | 2, 3, 5, 9, 10, 14, 15, 16, 17 |
| 30/09/2026 | Aggiunto "Accedi con Google" per tutti gli utenti, accanto a email e password: in accesso, registrazione dello studio e invito (solo con l'account dell'indirizzo invitato). | 2, 5, 14, 15 |
| 30/09/2026 | Chiarito dove stanno i documenti dei compiti: spazio file privato nel cloud a Francoforte, apertura solo con link temporanei dopo il controllo dei permessi. Segnalato che i backup di Supabase non includono i file: da decidere una copia periodica. | 8, 11, 14 |
| 30/09/2026 | Deciso di andare subito con la versione online per più studi (valutata e scartata una versione scaricabile di prova). Percorso passo per passo in PIANO.md, sezione 8. | — |
| 30/09/2026 | Importazione da Excel: l'AI riconosce Nome azienda, Nome cliente, tutte le email, Ultimo aggiornamento prima nota e IVA, N. dipendenti, Fatturato (€) e Collaboratore studio; i campi non riconosciuti restano vuoti e si completano a mano. Nuovi campi del cliente: dipendenti e fatturato; "Modifica anagrafica" per l'admin. Aggiornato anche il prototipo. | 6, 10, 14, 15 |
| 30/09/2026 | Importazione con l'AI: barra di avanzamento con percentuale e righe analizzate, due blocchi alla volta. Solo nel prototipo: pulsante "Elimina tutti i clienti" in Studio e utenti per rifare le prove (nel gestionale vero i clienti con storico si archiviano). | 6 |
| 30/09/2026 | Eliminazione dei clienti selezionati: pulsante rosso "Elimina" nella barra della selezione e avviso di conferma con Annulla (grigio) ed ELIMINA (rosso). Nel prototipo la cancellazione è definitiva; per il gestionale vero è proposto un cestino di 30 giorni. | 3, 6, 14 |
| 30/09/2026 | Elenco clienti: colonne N. dipendenti e Fatturato, ordinabili come numeri, con i valori mancanti sempre in fondo. | 9 |
| 30/09/2026 | "Chi può creare compiti" a tre livelli: solo admin, collaboratori solo per sé, tutti per tutti. Chi crea un compito lo vede, lo segue in dashboard e lo chiude dopo il controllo. Nel sito: impostazione e regola nel database con 4 nuovi test (29 in tutto); nel prototipo: tutto il percorso. | 3, 5, 8, 14 |
| 30/09/2026 | Nuovo compito: cliente facoltativo ("-" come prima voce), ricerca del cliente per nome, collaboratore in un menu a tendina compilato da solo con il referente del cliente scelto. Aggiornato il prototipo. | 8, 10, 14 |
| 30/09/2026 | Nuovo compito: opzione "Nessuna scadenza"; menu dei clienti chiuso che si apre solo cliccando nella ricerca, con lo stile del sito e l'uso da tastiera. Aggiornato il prototipo. | 8 |
| 30/09/2026 | Campanella delle notifiche per ogni utente (pallino rosso con numero bianco solo se ci sono non lette): compiti assegnati, compiti assegnati da te completati o con nuovi documenti, lavoro rimandato indietro. "Rimanda indietro" con la spiegazione per chi ha fatto il compito. Aggiornato il prototipo. | 8, 10, 15 |
