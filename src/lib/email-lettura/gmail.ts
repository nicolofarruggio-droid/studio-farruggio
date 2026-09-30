import 'server-only'
import { INTESTAZIONI_LETTE, type MessaggioGmail } from './messaggi'
import {
  ErroreAutorizzazione, ErroreCursoreScaduto, ErroreGmail, ErroreNonTrovato,
  type ClienteGmail, type Profilo, type RispostaElenco, type RispostaStoria,
} from './tipi'

// Client Gmail in SOLA LETTURA (sezione 16.4, secondo livello di garanzia).
// Tutte le chiamate all'API Gmail passano da leggiDaGmail(), che fa solo richieste GET e solo
// verso i percorsi di lettura qui sotto (profilo, cronologia, elenco e lettura dei messaggi).
// Il token ha comunque solo il permesso gmail.readonly: Google rifiuterebbe qualsiasi altra operazione.

export const API_GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me/'
const PERCORSI_LETTURA = /^(profile|history|messages|messages\/[0-9a-fA-F]{1,64})$/

/** L'unica funzione che chiama l'API Gmail: GET e basta. */
export async function leggiDaGmail<T>(token: string, percorso: string, parametri: [string, string][] = []): Promise<T> {
  if (!PERCORSI_LETTURA.test(percorso)) throw new ErroreGmail(`Percorso Gmail non ammesso: ${percorso}`)
  const url = new URL(percorso, API_GMAIL)
  for (const [k, v] of parametri) url.searchParams.append(k, v)
  let r: Response
  try {
    r = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ErroreGmail('Gmail non è raggiungibile')
  }
  if (r.status === 404) throw new ErroreNonTrovato('Non trovato su Gmail', 404)
  if (r.status === 401) throw new ErroreAutorizzazione('Accesso a Gmail non autorizzato', 401)
  if (!r.ok) throw new ErroreGmail(`Gmail ha risposto con il codice ${r.status}`, r.status)
  return (await r.json()) as T
}

const CAMPI_INTESTAZIONI = 'id,threadId,labelIds,internalDate,historyId,payload/headers'

export function creaClienteGmail(token: string): ClienteGmail {
  return {
    profilo: () => leggiDaGmail<Profilo>(token, 'profile'),

    storia: async (inizio, pagina) => {
      try {
        return await leggiDaGmail<RispostaStoria>(token, 'history', [
          ['startHistoryId', inizio],
          ['historyTypes', 'messageAdded'],
          ['labelId', 'INBOX'],
          ['maxResults', '500'],
          ...(pagina ? ([['pageToken', pagina]] as [string, string][]) : []),
        ])
      } catch (e) {
        if (e instanceof ErroreNonTrovato) throw new ErroreCursoreScaduto('Cursore di Gmail scaduto', 404)
        throw e
      }
    },

    elencoMessaggi: (query, pagina) =>
      leggiDaGmail<RispostaElenco>(token, 'messages', [
        ['q', query],
        ['labelIds', 'INBOX'],
        ['maxResults', '100'],
        ...(pagina ? ([['pageToken', pagina]] as [string, string][]) : []),
      ]),

    messaggio: (id, formato) =>
      leggiDaGmail<MessaggioGmail>(
        token,
        `messages/${id}`,
        formato === 'metadata'
          ? [
              // solo le intestazioni che servono a riconoscere il cliente: niente testo, niente anteprima
              ['format', 'metadata'],
              ...INTESTAZIONI_LETTE.map((h): [string, string] => ['metadataHeaders', h]),
              ['fields', CAMPI_INTESTAZIONI],
            ]
          : [['format', 'full'], ['fields', 'id,threadId,labelIds,internalDate,historyId,payload']],
      ),
  }
}
