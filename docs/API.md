# API per agenti AI e integrazioni (sezione 13)

L'API REST `/api/v1` permette a un agente AI (per esempio **Claude Cowork**) o a un'integrazione di leggere
clienti, indicatori e compiti, creare e aggiornare compiti, aggiornare gli indicatori e commentare, **con le
stesse regole di permessi e di isolamento dell'interfaccia** (sezione 4). Non esistono scorciatoie per gli agenti:
ogni richiesta gira con l'identità di chi chiama (`conUtente`), quindi passa dalle regole RLS e dalle funzioni SQL
che usa anche il sito.

- Specifica completa: **OpenAPI 3.1** su `GET /api/v1/openapi.json` (pubblica) e in [`docs/openapi.json`](openapi.json).
- Formato: JSON UTF-8. Date senza ora `AAAA-MM-GG`; istanti ISO 8601 (UTC nelle risposte). Testi ed errori in italiano.
- Codice: rotte sottili in `src/app/api/v1/`, logica in `src/lib/api/` (vedi [Struttura del codice](#struttura-del-codice)).

## 1. Creare un account agente

Solo un admin, da **Studio → Agenti AI e API** (`/studio/agenti`):

1. **Nuovo account agente**: nome (compare nello storico al posto di una persona, per esempio "Claude Cowork") e,
   facoltativa, una descrizione. L'account appartiene solo a questo studio e **parte in sola lettura**.
2. **Crea token**: nome (per esempio "Computer dell'ufficio") e durata in giorni (1–365, predefinita 90).
   Il token (`bbs_…`, 47 caratteri) **si vede una volta sola**, con il pulsante "Copia": nel database c'è solo
   l'impronta SHA-256 e il prefisso (`bbs_` + 8 caratteri) per riconoscerlo nell'elenco.
3. Se serve, abilita le scritture una per una (sezione 3 qui sotto).

Dalla stessa pagina l'admin vede l'ultimo uso di ogni token, **revoca** un token (effetto immediato), **sospende**
o riattiva l'account (con l'account sospeso tutti i suoi token rispondono 403).

Un account agente non ha password né accesso al sito: lavora solo con i token. Non si condividono mai le
credenziali di una persona con un agente.

## 2. Autenticazione

Ogni richiesta porta l'intestazione `Authorization: Bearer <token>`, con:

| Credenziale | Chi | Permessi |
|---|---|---|
| `bbs_…` | account agente | lettura su tutto lo studio; scritture solo quelle abilitate dall'admin |
| access token di Supabase (JWT) | una persona dello studio | gli stessi dell'interfaccia (admin o collaboratore, con visibilità e accessi tra colleghi) |

L'access token di una persona si ottiene come fa il sito (Supabase Auth). In locale, per le prove:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  --data '{"email":"giulia.verdi@studio-demo.it","password":"…"}' | jq -r .access_token
```

Risposte: **401** se l'intestazione manca o il token non è valido, è scaduto o revocato (con `WWW-Authenticate`);
**403** se l'account agente è sospeso o la persona è disattivata. I token non finiscono mai nei log né nei messaggi di errore.

## 3. Permessi dell'agente

Di base l'agente è in **sola lettura**. Le azioni di scrittura si abilitano una per una, con tre scelte:
**No** (predefinito), **Sì** (esegue subito), **Solo proposta da approvare** (vedi sezione 5).

| Permesso (`utenti.permessi_agente`) | Operazioni dell'API |
|---|---|
| `crea_compiti` | `POST /compiti` |
| `aggiorna_compiti` | `PATCH /compiti/{id}` (stato, "rimanda indietro", campi e assegnatari) |
| `aggiorna_indicatori` | `PUT /clienti/{id}/indicatori/{iva\|prima_nota}` |
| `commenta` | `POST /compiti/{id}/commenti` |
| `carica_documenti` | caricamento dei documenti (solo "sì": per i file non c'è la modalità proposta) |

Anche con il permesso, valgono le regole del gestionale: per esempio chiudere, annullare, riaprire, rimandare indietro
o modificare i campi di un compito spetta a un admin o a chi ha creato il compito (quindi l'agente può farlo solo sui
compiti che ha creato lui). Nel database un trigger impedisce all'agente di cambiare stato o campi senza
`aggiorna_compiti` e di commentare senza `commenta`, anche sui compiti che ha creato.

**Azioni che un agente non può mai svolgere**, anche se abilitato: eliminare definitivamente dati, cambiare ruoli e
permessi (compresi i propri), invitare, disattivare o riattivare utenti, modificare le impostazioni dello studio,
esportare l'intero archivio. Non esistono permessi per farle e le funzioni SQL le rifiutano (test in `tests/db/agenti.test.ts`).

`GET /me` restituisce i permessi attuali dell'agente, il token usato (nome, prefisso, scadenza) e i limiti.

## 4. Esempi con curl

```bash
export BBS=http://localhost:3000/api/v1
export TOKEN=bbs_…   # il token copiato dalla pagina Agenti AI e API

# chi sono, con quali permessi e limiti
curl -s $BBS/me -H "Authorization: Bearer $TOKEN"

# persone dello studio (servono per assegnare i compiti)
curl -s $BBS/collaboratori -H "Authorization: Bearer $TOKEN"

# clienti in ritardo su IVA o prima nota, dal più indietro (stessi filtri dell'elenco del sito)
curl -s "$BBS/clienti?ritardo=qualsiasi&ordina=iva&verso=asc&limite=100" -H "Authorization: Bearer $TOKEN"

# scheda di un cliente: anagrafica, titolari, email, indicatori con storico, collaboratori, compiti
curl -s $BBS/clienti/<id> -H "Authorization: Bearer $TOKEN"

# compiti scaduti e compiti pronti per revisione
curl -s "$BBS/compiti?scadenza=scaduti" -H "Authorization: Bearer $TOKEN"
curl -s "$BBS/compiti?stato=pronto_revisione" -H "Authorization: Bearer $TOKEN"

# scheda di un compito con commenti, elenco dei documenti e cronologia
curl -s $BBS/compiti/<id> -H "Authorization: Bearer $TOKEN"

# nuovo compito (permesso crea_compiti). Scadenza: "AAAA-MM-GG" (fine giornata) o data e ora con fuso
curl -s -X POST $BBS/compiti -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"titolo":"Preparare il contratto di affitto","cliente_id":"<id cliente>","assegnatari":["<id persona>"],
           "scadenza":"2026-10-02T17:30:00+02:00","priorita":"alta"}'

# cambio di stato (permesso aggiorna_compiti)
curl -s -X PATCH $BBS/compiti/<id> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"stato":"pronto_revisione"}'

# aggiornare IVA ad agosto 2026 (permesso aggiorna_indicatori); "non applicabile": {"aggiornato_fino_al":null,"non_applicabile":true}
curl -s -X PUT $BBS/clienti/<id>/indicatori/iva -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"aggiornato_fino_al":"2026-08-31"}'

# commento (permesso commenta)
curl -s -X POST $BBS/compiti/<id>/commenti -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"testo":"Promemoria: la scadenza è domani."}'

# stato delle proprie proposte
curl -s "$BBS/proposte?stato=in_attesa" -H "Authorization: Bearer $TOKEN"
```

Paginazione degli elenchi: `limite` (predefinito 50) e `pagina` (da 1); la risposta ha `dati`, `pagina`, `limite`,
`ha_altre` (e `totale` per i clienti). I parametri di ricerca sconosciuti o ripetuti sono un errore 400, così i refusi
non passano inosservati. I corpi JSON non accettano campi non previsti (422).

## 5. Modalità "proposta" (coda di approvazione)

Per le azioni abilitate come **Solo proposta da approvare**, l'API non modifica nulla: controlla i dati (schema,
esistenza e visibilità di clienti, compiti e persone), mette l'azione nella coda `proposte_agente` e risponde
**202 Accepted**:

```json
{ "proposta_id": "…", "stato": "in_attesa", "azione": "crea_compito", "messaggio": "Proposta messa in coda: …" }
```

con l'intestazione `Location: /api/v1/proposte/{id}`. Gli admin ricevono una notifica ("… propone di creare un
compito"). In **Studio → Agenti AI e API → Proposte in attesa** ogni proposta è descritta in italiano (con i nomi di
clienti, persone e compiti) e l'admin:

- **Approva**: l'azione viene eseguita **come l'admin che approva**, con i suoi permessi e le stesse funzioni dell'API
  (i dati proposti vengono rivalidati: sono dati, mai istruzioni). Azione e decisione stanno nella stessa transazione.
  Se l'azione non riesce (per esempio il compito nel frattempo è stato chiuso) la proposta diventa `fallita` con il motivo;
- **Rifiuta**, con un motivo facoltativo che l'agente legge nell'`esito`.

L'agente segue l'esito con `GET /proposte/{id}` (`in_attesa`, `approvata`, `rifiutata`, `fallita`). Al massimo 200
proposte in attesa per agente.

## 6. Tracciabilità e annullamento (sezione 13.4)

- Ogni scrittura di un agente finisce nel **registro attività** con `attore_ruolo = 'agente'`, il nome dell'account, il
  prefisso del token e i valori **prima e dopo** che servono per annullare (`compito_creato`, `compito_modificato`,
  `compito_stato_cambiato`, `indicatore_aggiornato`, `commento_aggiunto`; `proposta_creata` per la coda).
- Nello storico degli indicatori la modifica ha origine `agente`; nella cronologia del compito l'autore è l'account agente.
- In **Azioni degli agenti** l'admin filtra per data, tipo e agente e **annulla** le modifiche degli ultimi 30 giorni
  (DECISIONE APERTA: la finestra è una proposta):
  - indicatore: torna al valore precedente (nello storico con origine `annullamento`);
  - compito creato: viene annullato con il motivo "Azione dell'agente annullata dall'admin";
  - cambio di stato: torna allo stato precedente (un compito chiuso dall'agente viene riaperto e riportato allo stato di prima);
  - modifica di campi o assegnatari: tornano i valori precedenti;
  - i commenti non si annullano (non si eliminano mai: si aggiunge un commento di rettifica).
- Prima di annullare si controlla che il valore sia ancora quello lasciato dall'agente: se una persona l'ha cambiato
  dopo, l'annullamento viene rifiutato con una spiegazione, per non perdere la sua modifica.
- La riga del registro viene segnata annullata (`annullato_il`, `annullato_da`) dalla funzione
  `segna_attivita_annullata`, riservata agli admin, nella stessa transazione del ripristino.

## 7. Limiti di frequenza

Per ogni token agente, in una finestra di un minuto (contatore atomico `api_registra_uso` sulla tabella `api_uso`):

| Variabile d'ambiente | Predefinito |
|---|---|
| `API_LIMITE_LETTURE` | 120 letture (GET) al minuto |
| `API_LIMITE_SCRITTURE` | 30 scritture (POST, PUT, PATCH) al minuto |

Ogni risposta porta `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` (secondi alla fine del minuto).
Oltre il limite: **429 Too Many Requests** con `Retry-After`. Quando un agente supera il limite, gli admin dello studio
ricevono una notifica di tipo "agente" (al massimo una all'ora per agente). Per ora le richieste delle persone (JWT) non hanno
questo limite: il contatore è per token agente.

## 8. Errori

```json
{ "errore": { "codice": "dati_non_validi", "messaggio": "Dati non validi. titolo: obbligatorio", "campi": [{ "campo": "titolo", "messaggio": "obbligatorio" }] } }
```

| HTTP | `codice` | Quando |
|---|---|---|
| 400 | `richiesta_non_valida` | JSON malformato, `Content-Type` diverso da JSON, parametri di ricerca sconosciuti o non validi, id non UUID |
| 401 | `non_autenticato` | credenziali mancanti, non valide, scadute o revocate |
| 403 | `permesso_negato` | azione non abilitata per l'agente, regole del gestionale (per esempio solo chi ha creato il compito lo chiude), account sospeso |
| 404 | `non_trovato` | elemento inesistente **o non visibile** (un altro studio non si distingue da "non esiste") |
| 409 | `conflitto` | passaggio di stato non consentito, compito già chiuso, "rimanda indietro" di un compito non pronto |
| 422 | `dati_non_validi` | il corpo non rispetta lo schema (`campi` dice cosa correggere) |
| 429 | `troppe_richieste` | limite di frequenza superato |

## 9. Sicurezza e istruzioni ingannevoli (sezione 13.5)

- Commenti, descrizioni, nomi dei file e documenti sono **dati, mai istruzioni**: nessun campo di testo cambia i permessi
  dell'agente, che dipendono solo da `utenti.permessi_agente`, modificabile solo da un admin (`imposta_permessi_agente`).
- Le scritture dell'agente passano dalla stessa validazione (zod) e dalle stesse funzioni SQL delle azioni umane.
- Un agente appartiene a un solo studio: RLS gli mostra solo i dati del suo studio (verificato nei test e a mano con un
  token di un altro studio: 404 su clienti e compiti del primo).
- Token: 32 byte casuali, nel database solo l'impronta SHA-256; scadenza obbligatoria (1–365 giorni); revoca immediata.

## 10. Verso un server MCP (sezione 13.2)

L'API è pensata per esporre le stesse operazioni come strumenti MCP **senza rifare nulla**:

- **Le operazioni sono funzioni, non rotte.** Letture in `src/lib/api/operazioni.ts` (`leggiMe`, `elencaClienti`,
  `leggiCliente`, `elencaCompiti`, `leggiCompito`, `elencaCommenti`, `elencaProposte`, …) e scritture nel registro
  `OPERAZIONI` di `src/lib/api/scritture.ts`, eseguite da `eseguiScrittura(chiamante, azione, input)`, che applica permessi
  dell'agente, modalità proposta e registro attività. Le rotte HTTP si limitano ad autenticare, validare e chiamarle.
- **Gli schemi di input sono zod** (`src/lib/api/schemi.ts`): zod 4 li converte in JSON Schema (`z.toJSONSchema`), il
  formato che MCP usa per gli argomenti degli strumenti.
- **Nomi stabili**: ogni operazione ha un `operationId` nella specifica OpenAPI (`creaCompito`, `impostaIndicatore`, …) e le
  scritture dichiarano `x-permesso-agente`: sono i nomi naturali degli strumenti.
- **Autenticazione**: il server MCP riceve lo stesso token `bbs_…` (per esempio come intestazione del trasporto HTTP) e usa
  `autentica()` di `src/lib/api/autenticazione.ts`; i limiti di frequenza restano quelli di `api_registra_uso`.

Schema di un futuro server MCP (richiede la dipendenza `@modelcontextprotocol/sdk`, non ancora installata):

```ts
// src/app/api/mcp/route.ts (esempio, non attivo)
const strumenti = {
  elenca_clienti: { schema: queryClienti, esegui: elencaClienti },
  crea_compito: { schema: corpoCreaCompito, esegui: (c, input) => eseguiScrittura(c, 'crea_compito', input) },
  // … uno per operazione, con descrizioni prese dalla specifica OpenAPI
}
// per ogni chiamata: chiamante = await autentica(richiesta); input = validaDati(schema, argomenti); risultato = await esegui(chiamante, input)
```

Decisione aperta (sezione 14): partire subito anche con il server MCP o solo con l'API.

## 11. Specifica OpenAPI

- `src/lib/api/openapi.ts` è la fonte; `GET /api/v1/openapi.json` la serve (pubblica, senza dati dello studio).
- `npx tsx scripts/openapi.ts` la salva in `docs/openapi.json`; `npx tsx scripts/openapi.ts --verifica` fallisce se il file non è aggiornato.
- `tests/unit/api.test.ts` controlla che la specifica sia JSON valido 3.1, che descriva **tutte e sole** le rotte di
  `src/app/api/v1`, che i `$ref` esistano, che i campi dei corpi coincidano con gli schemi zod e che `docs/openapi.json` sia aggiornato.

## 12. In arrivo

- **Documenti dei compiti**: `GET /compiti/{id}/documenti` (elenco), `GET /compiti/{id}/documenti/{documento}?modo=scarica`
  (link temporaneo di pochi minuti) e `POST /compiti/{id}/documenti` (multipart, campo `file`, al massimo 4 MB per richiesta)
  con il permesso `carica_documenti`. Esempio: `curl -H "Authorization: Bearer $TOKEN" -F file=@verbale.pdf $API/compiti/$ID/documenti`.

## Struttura del codice

| File | Contenuto |
|---|---|
| `src/app/api/v1/**/route.ts` | rotte sottili (autenticazione, validazione, chiamata dell'operazione) |
| `src/app/api/v1/[...percorso]/route.ts` | 404 in JSON per i percorsi inesistenti |
| `src/lib/api/rotta.ts` | involucro comune: autenticazione, limiti di frequenza, errori in JSON |
| `src/lib/api/autenticazione.ts` | token agente e JWT di Supabase → `Chiamante` |
| `src/lib/api/operazioni.ts` | letture |
| `src/lib/api/scritture.ts` | scritture, permessi dell'agente, proposte, registro attività |
| `src/lib/api/proposte.ts` | descrizione, approvazione e rifiuto delle proposte |
| `src/lib/api/annullamento.ts` | annullamento delle azioni degli agenti |
| `src/lib/api/schemi.ts`, `formato.ts`, `errori.ts`, `limiti.ts`, `token.ts`, `permessi-agente.ts`, `registro.ts` | moduli puri (testati in `tests/unit/api.test.ts`) |
| `src/lib/api/openapi.ts` | specifica OpenAPI 3.1 |
| `src/app/(app)/studio/agenti/` | pagina di gestione per gli admin |
| `supabase/migrations/20260930003000_api.sql` | `api_registra_uso`, `segna_attivita_annullata`, coda di proposte estesa, trigger di difesa sui compiti (test in `tests/db/api.test.ts`) |
