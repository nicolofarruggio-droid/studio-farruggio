// Tipi e errori comuni del modulo di lettura email (nessuna dipendenza dal server: usabili nei test).
import type { MessaggioGmail } from './messaggi'

export type Profilo = { emailAddress: string; historyId: string; messagesTotal?: number }

export type RispostaStoria = {
  history?: {
    id: string
    messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[]
  }[]
  nextPageToken?: string
  historyId: string
}

export type RispostaElenco = {
  messages?: { id: string; threadId: string }[]
  nextPageToken?: string
  resultSizeEstimate?: number
}

/**
 * Le sole operazioni che il gestionale fa su una casella: tutte in LETTURA.
 * La implementano il client Gmail vero (gmail.ts, solo richieste GET) e la casella di prova (gmail-prova.ts).
 */
export interface ClienteGmail {
  /** users.getProfile: indirizzo e punto attuale della cronologia (historyId) */
  profilo(): Promise<Profilo>
  /** users.history.list: messaggi arrivati in INBOX dopo il cursore */
  storia(inizio: string, pagina?: string): Promise<RispostaStoria>
  /** users.messages.list: messaggi in INBOX che rispondono alla ricerca (per esempio "after:…") */
  elencoMessaggi(query: string, pagina?: string): Promise<RispostaElenco>
  /** users.messages.get: "metadata" = solo le intestazioni scelte; "full" = anche il testo */
  messaggio(id: string, formato: 'metadata' | 'full'): Promise<MessaggioGmail>
}

export class ErroreGmail extends Error {
  constructor(messaggio: string, readonly stato: number = 0) {
    super(messaggio)
  }
}
/** Il cursore (historyId) è troppo vecchio: Gmail risponde 404 a history.list. */
export class ErroreCursoreScaduto extends ErroreGmail {}
/** Il messaggio non esiste più (eliminato dall'utente prima del controllo). */
export class ErroreNonTrovato extends ErroreGmail {}
/** Token di accesso non valido. */
export class ErroreAutorizzazione extends ErroreGmail {}
/** Google ha rifiutato il token di aggiornamento (revocato o scaduto): la casella va ricollegata. */
export class ErroreTokenRevocato extends Error {}
/** Google non ha concesso esattamente il permesso di sola lettura. */
export class ErrorePermesso extends Error {}

// ---------------------------------------------------------------------------
// Email da riassumere: SOLO i campi che l'AI può ricevere (sezione 16.4)
// ---------------------------------------------------------------------------
export type EmailDaRiassumere = {
  /** identificativo locale nella richiesta: E1, E2, … */
  id: string
  mittente: string
  data: Date
  oggetto: string
  testo: string
  troncato: boolean
  citazioneOmessa: boolean
  allegati: string[]
}

export type ConversazioneDaRiassumere = {
  /** riassunti precedenti della conversazione (al massimo 3, dal più vecchio) */
  precedenti: { data: Date; riassunto: string }[]
  /** quanti messaggi della conversazione ci sono già (per "messaggio n. …") */
  giaPresenti: number
  /** email nuove della conversazione, in ordine di data */
  email: EmailDaRiassumere[]
}

export const MAX_PRECEDENTI = 3
