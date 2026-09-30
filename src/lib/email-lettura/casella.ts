import 'server-only'
import { comeSistema } from '@/lib/db'
import { cifra, decifra } from '@/lib/cripto'
import { creaClienteGmail } from './gmail'
import { casellaDiProva, gmailSimulato, PREFISSO_TOKEN_PROVA } from './gmail-prova'
import { PERMESSO_GMAIL, permessoSoloLettura, revocaToken, tokenDiAccesso } from './oauth'
import { ErroreTokenRevocato, type ClienteGmail } from './tipi'

// Operazioni sulle caselle fatte dal server. Il token (cifrato con AES-256-GCM) si legge solo qui,
// da caselle_email_token, che non ha alcun privilegio per gli utenti: mai verso interfaccia, API o AI.

export type Casella = {
  id: string
  studio_id: string
  utente_id: string
  indirizzo: string | null
  stato: 'collegata' | 'non_collegata' | 'da_ricollegare'
  collegata_il: Date | null
  ultimo_controllo: Date | null
  ultimo_errore: string | null
}

/**
 * Client Gmail (solo lettura) per una casella: dal token di aggiornamento un token di accesso nuovo.
 * Se Google rifiuta il token lancia ErroreTokenRevocato.
 */
export async function clientePerCasella(casellaId: string): Promise<ClienteGmail> {
  const [riga] = await comeSistema((sql) => sql<{ token_cifrato: string }[]>`
    select token_cifrato from public.caselle_email_token where casella_id = ${casellaId}`)
  if (!riga) throw new ErroreTokenRevocato('Token della casella mancante')
  let token: string
  try {
    token = decifra(riga.token_cifrato)
  } catch {
    throw new ErroreTokenRevocato('Token della casella non leggibile')
  }
  if (token.startsWith(PREFISSO_TOKEN_PROVA)) {
    if (!gmailSimulato()) throw new Error('Casella di prova: la modalità di prova non è attiva')
    return casellaDiProva(token.slice(PREFISSO_TOKEN_PROVA.length))
  }
  const { accessToken, scope } = await tokenDiAccesso(token)
  if (scope !== null && !permessoSoloLettura(scope)) {
    // il token deve avere solo gmail.readonly: altrimenti non si usa, si revoca e si chiede di ricollegare
    await revocaToken(token)
    throw new ErroreTokenRevocato('Il token ha permessi diversi dalla sola lettura')
  }
  return creaClienteGmail(accessToken)
}

/** Salva (o aggiorna) la casella collegata e il token cifrato. Il cursore parte dal momento del consenso. */
export async function salvaCasellaCollegata(p: {
  studioId: string
  utenteId: string
  indirizzo: string
  historyId: string
  token: string
}): Promise<string> {
  return comeSistema((sql) =>
    sql.begin(async (tx) => {
      const [c] = await tx<{ id: string }[]>`
        insert into public.caselle_email (studio_id, utente_id, fornitore, indirizzo, stato, permesso, collegata_il,
          ultimo_controllo, cursore, ultimo_errore)
        values (${p.studioId}, ${p.utenteId}, 'gmail', ${p.indirizzo.toLowerCase()}, 'collegata', ${PERMESSO_GMAIL}, now(),
          null, ${p.historyId}, null)
        on conflict (utente_id) do update set
          studio_id = excluded.studio_id, fornitore = 'gmail', indirizzo = excluded.indirizzo, stato = 'collegata',
          permesso = excluded.permesso, collegata_il = now(), ultimo_controllo = null, cursore = excluded.cursore,
          ultimo_errore = null, controllo_in_corso_dal = null
        returning id`
      await tx`
        insert into public.caselle_email_token (casella_id, token_cifrato) values (${c.id}, ${cifra(p.token)})
        on conflict (casella_id) do update set token_cifrato = excluded.token_cifrato, aggiornato_il = now()`
      // si riparte dal nuovo collegamento: niente email rimaste in sospeso da prima (sezione 16.2)
      await tx`delete from public.email_elaborate where casella_id = ${c.id} and esito in ('in_attesa', 'da_rielaborare')`
      return c.id
    }),
  )
}

/** La stessa casella Gmail collegata da un'altra persona? (ognuno collega solo la propria) */
export async function casellaGiaUsata(indirizzo: string, utenteId: string): Promise<boolean> {
  const r = await comeSistema((sql) => sql`
    select 1 from public.caselle_email
    where lower(indirizzo) = ${indirizzo.toLowerCase()} and utente_id <> ${utenteId} and stato <> 'non_collegata'
    limit 1`)
  return r.length > 0
}

/**
 * Google ha rifiutato il token: la casella passa a "da ricollegare", il token si cancella e l'utente
 * riceve una notifica (una volta sola, al passaggio di stato).
 */
export async function segnaDaRicollegare(casellaId: string): Promise<void> {
  await comeSistema((sql) =>
    sql.begin(async (tx) => {
      const [c] = await tx<{ studio_id: string; utente_id: string }[]>`
        update public.caselle_email
           set stato = 'da_ricollegare', cursore = null, controllo_in_corso_dal = null,
               ultimo_errore = 'Google ha revocato l''accesso alla casella: va ricollegata.'
         where id = ${casellaId} and stato = 'collegata'
        returning studio_id, utente_id`
      await tx`delete from public.caselle_email_token where casella_id = ${casellaId}`
      if (c) {
        await tx`
          insert into public.notifiche (studio_id, utente_id, tipo, testo)
          values (${c.studio_id}, ${c.utente_id}, 'casella',
            'Google ha revocato l''accesso alla tua casella email: ricollegala da "La mia email" perché le email dei clienti tornino nelle Comunicazioni.')`
      }
    }),
  )
}

/** Nuovo token cifrato per una casella di prova (modalità GMAIL_SIMULATO). */
export const tokenDiProva = (indirizzo: string) => `${PREFISSO_TOKEN_PROVA}${indirizzo.toLowerCase()}`
