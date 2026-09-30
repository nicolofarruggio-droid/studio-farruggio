import 'server-only'
import { comeSistema } from '@/lib/db'
import { archivioDb } from './archivio-db'
import { clientePerCasella, segnaDaRicollegare } from './casella'
import { eseguiControllo, type CasellaInControllo, type EsitoControllo } from './motore'
import { configControlli, eOrarioDiControllo, margineControlloMinuti } from './orari'
import { riassumiEmail } from './riassunto'
import { scollegaCasellaUtente } from './scollega'
import { ErroreTokenRevocato } from './tipi'

// Controllo delle nuove email (sezione 16.3), eseguito dal server per ogni casella collegata degli studi
// con la lettura automatica attiva (sezione 16.5). Registra solo numeri in controlli_email.

/** Tempo massimo di un'esecuzione del processo pianificato (la route ha maxDuration = 300 secondi). */
export const LIMITE_ESECUZIONE_MS = 240_000
const CASELLE_IN_PARALLELO = 4

export type EsitoCasella = EsitoControllo & { saltata?: 'in_corso_o_non_attiva' }

async function registraControllo(c: CasellaInControllo, e: EsitoControllo) {
  await comeSistema((sql) =>
    sql.begin(async (tx) => {
      await tx`
        insert into public.controlli_email (studio_id, casella_id, email_nuove, associate, ignorate, errori)
        values (${c.studioId}, ${c.id}, ${e.nuove}, ${e.associate}, ${e.ignorate}, ${e.errori})`
      await tx`
        update public.caselle_email
           set ultimo_controllo = now(), ultimo_errore = ${e.errore ?? null}, controllo_in_corso_dal = null
         where id = ${c.id}`
      // i numeri dei controlli servono per poco: si tengono 30 giorni
      await tx`delete from public.controlli_email where casella_id = ${c.id} and eseguito_il < now() - interval '30 days'`
    }),
  )
}

/**
 * Controlla subito una casella (processo pianificato o "Controlla ora" nella modalità di prova).
 * Non fa nulla se la casella non è collegata, se lo studio non ha attivato la lettura automatica,
 * se l'utente è disattivato o se un altro controllo della stessa casella è in corso.
 */
export async function controllaCasella(casellaId: string, opzioni: { scadenza?: number } = {}): Promise<EsitoCasella> {
  const [riga] = await comeSistema((sql) => sql<{
    id: string; studio_id: string; utente_id: string; collegata_il: Date; ultimo_controllo: Date | null; cursore: string | null
  }[]>`
    update public.caselle_email c set controllo_in_corso_dal = now()
      from public.studi s, public.utenti u
     where c.id = ${casellaId} and s.id = c.studio_id and u.id = c.utente_id
       and c.stato = 'collegata' and s.lettura_email_attiva and u.attivo and c.collegata_il is not null
       and (c.controllo_in_corso_dal is null or c.controllo_in_corso_dal < now() - interval '15 minutes')
    returning c.id, c.studio_id, c.utente_id, c.collegata_il, c.ultimo_controllo, c.cursore`)
  if (!riga) return { nuove: 0, associate: 0, ignorate: 0, errori: 0, rimandate: 0, saltata: 'in_corso_o_non_attiva' }

  const casella: CasellaInControllo = {
    id: riga.id,
    studioId: riga.studio_id,
    utenteId: riga.utente_id,
    collegataIl: new Date(riga.collegata_il),
    ultimoControllo: riga.ultimo_controllo ? new Date(riga.ultimo_controllo) : null,
    cursore: riga.cursore,
  }
  let esito: EsitoControllo = { nuove: 0, associate: 0, ignorate: 0, errori: 0, rimandate: 0 }
  try {
    const gmail = await clientePerCasella(casella.id)
    esito = await eseguiControllo({
      casella,
      gmail,
      archivio: archivioDb,
      // l'AI riceve solo mittente, data, oggetto, testo e nomi degli allegati: mai il token
      riassumi: (conversazioni) => riassumiEmail(conversazioni, { studioId: casella.studioId, utenteId: casella.utenteId }),
      scadenza: opzioni.scadenza,
    })
  } catch (e) {
    esito.errori++
    if (e instanceof ErroreTokenRevocato) {
      // la casella passa a "da ricollegare", il token si cancella e l'utente riceve una notifica
      await segnaDaRicollegare(casella.id)
      esito.errore = 'Google ha revocato l\'accesso alla casella: va ricollegata.'
    } else {
      console.error('Controllo della casella non riuscito', casella.id, e instanceof Error ? e.message : e)
      esito.errore = 'Il controllo non è riuscito: riproveremo al prossimo controllo.'
    }
  }
  try {
    await registraControllo(casella, esito)
  } catch (e) {
    console.error('Controllo non registrato', casella.id, e instanceof Error ? e.message : e)
    await comeSistema((sql) => sql`update public.caselle_email set controllo_in_corso_dal = null where id = ${casella.id}`).catch(() => {})
  }
  return esito
}

/** Disattivando un utente la sua casella viene scollegata in automatico (sezione 16.2). */
async function scollegaCaselleUtentiDisattivati(): Promise<number> {
  const r = await comeSistema((sql) => sql<{ utente_id: string }[]>`
    select c.utente_id from public.caselle_email c join public.utenti u on u.id = c.utente_id
    where not u.attivo
      and (c.stato <> 'non_collegata' or exists (select 1 from public.caselle_email_token t where t.casella_id = c.id))`)
  for (const x of r) await scollegaCasellaUtente(x.utente_id)
  return r.length
}

export type RiepilogoControlli = {
  inOrario: boolean
  daControllare: number
  controllate: number
  nuove: number
  associate: number
  ignorate: number
  errori: number
  rimandate: number
  scollegateUtentiDisattivati: number
}

/**
 * Processo pianificato (ogni 10 minuti): esce subito fuori orario; altrimenti controlla le caselle il cui
 * ultimo controllo è più vecchio dell'intervallo, fino al limite di tempo dell'esecuzione.
 */
export async function eseguiControlliPianificati(adesso = new Date()): Promise<RiepilogoControlli> {
  const riepilogo: RiepilogoControlli = {
    inOrario: false, daControllare: 0, controllate: 0, nuove: 0, associate: 0, ignorate: 0, errori: 0, rimandate: 0,
    scollegateUtentiDisattivati: 0,
  }
  riepilogo.scollegateUtentiDisattivati = await scollegaCaselleUtentiDisattivati()
  const cfg = configControlli()
  if (!eOrarioDiControllo(adesso, cfg)) return riepilogo
  riepilogo.inOrario = true
  const scadenza = Date.now() + LIMITE_ESECUZIONE_MS
  const caselle = await comeSistema((sql) => sql<{ id: string }[]>`
    select c.id from public.caselle_email c
      join public.studi s on s.id = c.studio_id
      join public.utenti u on u.id = c.utente_id
    where c.stato = 'collegata' and s.lettura_email_attiva and u.attivo
      and (c.ultimo_controllo is null or c.ultimo_controllo < now() - make_interval(mins => ${margineControlloMinuti(cfg)}))
    order by c.ultimo_controllo asc nulls first
    limit 2000`)
  riepilogo.daControllare = caselle.length
  let i = 0
  const lavoratore = async () => {
    while (i < caselle.length && Date.now() < scadenza) {
      const id = caselle[i++].id
      try {
        const e = await controllaCasella(id, { scadenza })
        if (e.saltata) continue
        riepilogo.controllate++
        riepilogo.nuove += e.nuove
        riepilogo.associate += e.associate
        riepilogo.ignorate += e.ignorate
        riepilogo.errori += e.errori
        riepilogo.rimandate += e.rimandate
      } catch (e) {
        riepilogo.errori++
        console.error('Controllo email non riuscito', id, e instanceof Error ? e.message : e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CASELLE_IN_PARALLELO, caselle.length) }, lavoratore))
  return riepilogo
}
