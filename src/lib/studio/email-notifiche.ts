import 'server-only'
import { comeSistema, type Sql } from '@/lib/db'
import { emailConfigurata, htmlEmail, inviaEmail } from '@/lib/posta'
import { descriviScadenza, oggiISO } from '@/lib/date'
import { NOTIFICHE_CON_EMAIL, vuoleEmail } from './preferenze'
import {
  emailNovita, emailRiepilogo, eOraDelRiepilogo, type CompitoRiepilogo, type ElementoNovita, type PezziEmail,
} from './testi-email'

// Email delle notifiche (sezione 8), chiamate dal processo pianificato /api/cron/notifiche.
// Gira come "sistema" (comeSistema, senza RLS) perché lavora per tutti gli studi: non riceve
// input dagli utenti. Ogni riga viene prima "prenotata" (notifiche.email_inviata_il oppure una
// riga in email_notifiche) e poi spedita, così due esecuzioni in parallelo non mandano doppioni.
// notifiche.email_inviata_il segna la notifica come elaborata per l'email: anche quando l'email
// non parte perché la persona l'ha disattivata nelle preferenze.

export type Resoconto = {
  saltato?: string
  notificheElaborate: number
  commentiElaborati: number
  emailNovita: number
  riepiloghi: number
  errori: number
}

/** Le notifiche più vecchie di così non partono più via email (per esempio dopo un periodo senza servizio email). */
const FINESTRA_ORE = 24
/** Un invio fallito si riprova al giro successivo solo per le novità recenti. */
const RIPROVA_ORE = 2
const MAX_PER_GRUPPO = 25

type Destinatario = {
  utente_id: string
  email: string
  nome: string
  attivo: boolean
  ruolo: string
  preferenze_notifiche: Record<string, unknown>
}

type Pacco = {
  destinatario: Destinatario
  elementi: ElementoNovita[]
  notifiche: { id: string; creata_il: Date }[]
  commenti: { id: string; creato_il: Date }[]
}

const recente = (d: Date, ore: number, adesso: Date) => adesso.getTime() - new Date(d).getTime() < ore * 3600_000

async function spedisci(email: string, p: PezziEmail) {
  await inviaEmail({ a: email, oggetto: p.oggetto, testo: p.testo, html: htmlEmail(p.titolo, p.paragrafiHtml, p.pulsante, p.nota) })
}

export async function mandaEmailNotifiche(opzioni: { sito: string; adesso?: Date; forzaRiepilogo?: boolean }): Promise<Resoconto> {
  const r: Resoconto = { notificheElaborate: 0, commentiElaborati: 0, emailNovita: 0, riepiloghi: 0, errori: 0 }
  if (!emailConfigurata()) return { ...r, saltato: 'Servizio email non configurato: nessuna email inviata.' }
  const adesso = opzioni.adesso ?? new Date()
  await comeSistema(async (sql) => {
    await novita(sql, opzioni.sito, adesso, r)
    if (opzioni.forzaRiepilogo || eOraDelRiepilogo(adesso)) await riepiloghi(sql, opzioni.sito, adesso, r)
  })
  return r
}

/** Notifiche dell'app e nuovi commenti: una sola email per persona con tutte le novità. */
async function novita(sql: Sql, sito: string, adesso: Date, r: Resoconto) {
  const pacchi = new Map<string, Pacco>()
  const pacco = (d: Destinatario) => {
    let p = pacchi.get(d.utente_id)
    if (!p) pacchi.set(d.utente_id, (p = { destinatario: d, elementi: [], notifiche: [], commenti: [] }))
    return p
  }
  const personaValida = (d: Destinatario) => d.attivo && d.ruolo !== 'agente' && Boolean(d.email)

  // 1. Notifiche non ancora elaborate, create da almeno un minuto (per raccogliere quelle ravvicinate)
  const notifiche = await sql<(Destinatario & { id: string; tipo: string; compito_id: string | null; testo: string; creata_il: Date; titolo: string | null })[]>`
    with scelte as (
      select n.id from public.notifiche n
      where n.email_inviata_il is null and n.creata_il <= now() - interval '1 minute'
      order by n.creata_il
      limit 500
      for update skip locked
    ), segnate as (
      update public.notifiche n set email_inviata_il = now()
      from scelte where n.id = scelte.id
      returning n.id, n.tipo, n.compito_id, n.testo, n.creata_il, n.utente_id
    )
    select s.id, s.tipo, s.compito_id, s.testo, s.creata_il, k.titolo,
           u.id as utente_id, u.email, u.nome, u.attivo, u.ruolo, u.preferenze_notifiche
    from segnate s
    join public.utenti u on u.id = s.utente_id
    left join public.compiti k on k.id = s.compito_id`
  r.notificheElaborate = notifiche.length
  for (const n of notifiche) {
    if (!recente(n.creata_il, FINESTRA_ORE, adesso) || !personaValida(n)) continue
    if (!(NOTIFICHE_CON_EMAIL as readonly string[]).includes(n.tipo) || !vuoleEmail(n.preferenze_notifiche, n.tipo)) continue
    const p = pacco(n)
    p.elementi.push({ tipo: n.tipo as ElementoNovita['tipo'], compitoId: n.compito_id, titolo: n.titolo, frase: n.testo })
    p.notifiche.push({ id: n.id, creata_il: n.creata_il })
  }

  // 2. Nuovi commenti: a chi segue il compito (chi l'ha creato e gli assegnatari), escluso l'autore
  const commenti = await sql<(Destinatario & { prenotazione: string; compito_id: string; titolo: string; autore: string | null; autore_agente: boolean; creato_il: Date })[]>`
    with nuovi as (
      select c.id, c.compito_id, c.autore_id, c.studio_id
      from public.compiti_commenti c
      where c.creato_il > now() - make_interval(hours => ${FINESTRA_ORE}::int) and c.creato_il <= now() - interval '1 minute'
    ), destinatari as (
      select distinct n.id as commento_id, n.compito_id, n.studio_id, x.utente_id
      from nuovi n
      join lateral (
        select k.creato_da as utente_id from public.compiti k where k.id = n.compito_id
        union
        select a.utente_id from public.compiti_assegnatari a where a.compito_id = n.compito_id
      ) x on x.utente_id is not null and x.utente_id is distinct from n.autore_id
      join public.utenti u on u.id = x.utente_id and u.studio_id = n.studio_id
    ), prenotate as (
      insert into public.email_notifiche (studio_id, utente_id, tipo, riferimento, compito_id)
      select d.studio_id, d.utente_id, 'commento', d.commento_id::text, d.compito_id from destinatari d
      on conflict (utente_id, tipo, riferimento) do nothing
      returning id, utente_id, riferimento, compito_id
    )
    select p.id as prenotazione, p.compito_id, k.titolo, trim(a.nome || ' ' || a.cognome) as autore,
           coalesce(a.ruolo = 'agente', false) as autore_agente, c.creato_il,
           u.id as utente_id, u.email, u.nome, u.attivo, u.ruolo, u.preferenze_notifiche
    from prenotate p
    join public.compiti_commenti c on c.id = p.riferimento::uuid
    join public.compiti k on k.id = p.compito_id
    join public.utenti u on u.id = p.utente_id
    left join public.utenti a on a.id = c.autore_id`
  r.commentiElaborati = commenti.length
  const saltati: string[] = []
  for (const c of commenti) {
    if (!personaValida(c) || !vuoleEmail(c.preferenze_notifiche, 'commenti')) {
      saltati.push(c.prenotazione)
      continue
    }
    const chi = c.autore ? (c.autore_agente ? `L'agente ${c.autore}` : c.autore) : 'Qualcuno'
    const p = pacco(c)
    p.elementi.push({ tipo: 'commento', compitoId: c.compito_id, titolo: c.titolo, frase: `${chi} ha scritto un commento in: ${c.titolo}` })
    p.commenti.push({ id: c.prenotazione, creato_il: c.creato_il })
  }
  if (saltati.length) await sql`update public.email_notifiche set esito = 'saltata' where id = any(${saltati}::uuid[])`

  // 3. Invio: una email per persona
  for (const p of pacchi.values()) {
    const idsCommenti = p.commenti.map((c) => c.id)
    try {
      await spedisci(p.destinatario.email, emailNovita(p.destinatario.nome, p.elementi, sito))
      r.emailNovita++
      if (idsCommenti.length)
        await sql`update public.email_notifiche set esito = 'inviata', inviata_il = now() where id = any(${idsCommenti}::uuid[])`
    } catch (e) {
      r.errori++
      const messaggio = String((e as Error)?.message ?? e).slice(0, 500)
      console.error('Email di notifica non inviata:', messaggio)
      // le novità recenti si riprovano al prossimo giro, le altre restano segnate con l'errore
      const riprova = p.notifiche.filter((n) => recente(n.creata_il, RIPROVA_ORE, adesso)).map((n) => n.id)
      if (riprova.length) await sql`update public.notifiche set email_inviata_il = null where id = any(${riprova}::uuid[])`
      const daRifare = p.commenti.filter((c) => recente(c.creato_il, RIPROVA_ORE, adesso)).map((c) => c.id)
      const falliti = idsCommenti.filter((id) => !daRifare.includes(id))
      if (daRifare.length) await sql`delete from public.email_notifiche where id = any(${daRifare}::uuid[])`
      if (falliti.length)
        await sql`update public.email_notifiche set esito = 'errore', errore = ${messaggio} where id = any(${falliti}::uuid[])`
    }
  }
}

/** Riepilogo del mattino per chi ha la preferenza "scadenze" attiva (una volta al giorno). */
async function riepiloghi(sql: Sql, sito: string, adesso: Date, r: Resoconto) {
  const giorno = oggiISO(adesso)
  const domani = oggiISO(new Date(adesso.getTime() + 86400_000))
  const persone = await sql<{ id: string; studio_id: string; email: string; nome: string }[]>`
    select u.id, u.studio_id, u.email, u.nome
    from public.utenti u
    where u.attivo and u.ruolo in ('admin', 'collaboratore')
      and coalesce(u.preferenze_notifiche ->> 'scadenze', 'true') <> 'false'
      and not exists (select 1 from public.email_notifiche e
                      where e.utente_id = u.id and e.tipo = 'riepilogo_scadenze' and e.riferimento = ${giorno})`
  if (persone.length === 0) return
  const studi = [...new Set(persone.map((p) => p.studio_id))]
  const compiti = await sql<{ id: string; titolo: string; scadenza: Date; scadenza_con_orario: boolean; creato_da: string | null; assegnatari: string[]; giorno_scadenza: string }[]>`
    select k.id, k.titolo, k.scadenza, k.scadenza_con_orario, k.creato_da,
           array(select a.utente_id from public.compiti_assegnatari a where a.compito_id = k.id) as assegnatari,
           ((k.scadenza at time zone 'Europe/Rome')::date)::text as giorno_scadenza
    from public.compiti k
    where k.studio_id = any(${studi}::uuid[])
      and k.stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')
      and k.scadenza is not null
      and (k.scadenza at time zone 'Europe/Rome')::date <= ${domani}::date
      and (k.cliente_id is null or exists (select 1 from public.clienti c where c.id = k.cliente_id and c.eliminato_il is null))
    order by k.scadenza`

  for (const persona of persone) {
    const elenco: CompitoRiepilogo[] = []
    for (const k of compiti) {
      const scaduto = new Date(k.scadenza).getTime() < adesso.getTime()
      const scadenza = descriviScadenza(k.scadenza, k.scadenza_con_orario)
      if (k.assegnatari.includes(persona.id)) {
        const gruppo = scaduto ? 'scaduto' : k.giorno_scadenza === giorno ? 'oggi' : k.giorno_scadenza === domani ? 'domani' : null
        if (gruppo) elenco.push({ id: k.id, titolo: k.titolo, scadenza: `scadenza ${scadenza}`, gruppo })
      } else if (k.creato_da === persona.id && scaduto) {
        elenco.push({ id: k.id, titolo: k.titolo, scadenza: `scadenza ${scadenza}`, gruppo: 'assegnato_scaduto' })
      }
    }
    const perGruppo = new Map<string, number>()
    const limitato = elenco.filter((c) => {
      const n = (perGruppo.get(c.gruppo) ?? 0) + 1
      perGruppo.set(c.gruppo, n)
      return n <= MAX_PER_GRUPPO
    })
    const pezzi = emailRiepilogo(persona.nome, giorno, limitato, sito)
    const [prenotata] = await sql<{ id: string }[]>`
      insert into public.email_notifiche (studio_id, utente_id, tipo, riferimento, esito)
      values (${persona.studio_id}, ${persona.id}, 'riepilogo_scadenze', ${giorno}, ${pezzi ? 'in_corso' : 'saltata'})
      on conflict (utente_id, tipo, riferimento) do nothing
      returning id`
    if (!prenotata || !pezzi) continue
    try {
      await spedisci(persona.email, pezzi)
      r.riepiloghi++
      await sql`update public.email_notifiche set esito = 'inviata', inviata_il = now() where id = ${prenotata.id}`
    } catch (e) {
      r.errori++
      const messaggio = String((e as Error)?.message ?? e).slice(0, 500)
      console.error('Riepilogo scadenze non inviato:', messaggio)
      // si riprova al giro successivo (entro la finestra del mattino)
      await sql`delete from public.email_notifiche where id = ${prenotata.id}`
    }
  }
}
