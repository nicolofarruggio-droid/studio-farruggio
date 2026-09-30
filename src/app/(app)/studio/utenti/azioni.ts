'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { nomeCompleto, richiediAdmin, type Contesto } from '@/lib/auth/sessione'
import { ErroreUtente, messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { inviaEmailInvito, linkInvito, nuovoCodiceInvito } from '@/lib/inviti'
import { emailConfigurata } from '@/lib/posta'
import { urlSito } from '@/lib/sito'
import { scollegaCasellaUtente } from '@/lib/email-lettura/scollega'
import { supabaseServizio } from '@/lib/supabase/server'
import { EMAIL_VALIDA } from '@/lib/studio/testi'

/** Esito di un invito: se l'email non è partita l'admin riceve il link da mandare lui (sezione 5). */
export type EsitoInvito = { email: string; emailInviata: boolean; link?: string; motivo?: string }

const schemaInvito = z.object({
  nome: z.string().trim().min(1, 'Scrivi il nome').max(100, 'Nome troppo lungo'),
  cognome: z.string().trim().min(1, 'Scrivi il cognome').max(100, 'Cognome troppo lungo'),
  email: z.string().trim().toLowerCase().regex(EMAIL_VALIDA, 'Indirizzo email non valido').max(254),
  ruolo: z.enum(['admin', 'collaboratore'], { message: 'Scegli il ruolo' }),
})
type DatiInvito = z.infer<typeof schemaInvito>

function campiErrore(e: z.ZodError) {
  const campi: Record<string, string> = {}
  for (const i of e.issues) campi[String(i.path[0])] ??= i.message
  return campi
}

async function spedisciInvito(ctx: Contesto, id: string, d: DatiInvito, link: string, azione: string): Promise<EsitoAzione<EsitoInvito>> {
  const invio = await inviaEmailInvito({
    email: d.email, nome: d.nome, studio: ctx.studio.nome, ruolo: d.ruolo, link, invitatoDa: nomeCompleto(ctx.utente),
  })
  try {
    await conUtente(ctx.persona, (tx) => tx`select public.segna_invio_invito(${id}, ${invio.ok}, ${invio.errore ?? null})`)
  } catch (e) {
    console.error('segna_invio_invito', e)
  }
  if (invio.ok) {
    return { ok: true, messaggio: `${azione}: abbiamo mandato l'email a ${d.email}.`, dati: { email: d.email, emailInviata: true } }
  }
  const motivo = emailConfigurata()
    ? 'L\'email non è partita per un errore del servizio email.'
    : 'Il servizio email non è ancora configurato, quindi l\'email non è partita.'
  return {
    ok: true,
    messaggio: `${azione}, ma l'email non è partita: copia il link e mandalo tu a ${d.email}.`,
    dati: { email: d.email, emailInviata: false, link, motivo },
  }
}

async function creaInvito(ctx: Contesto, d: DatiInvito): Promise<EsitoAzione<EsitoInvito>> {
  const { codice, hash } = nuovoCodiceInvito()
  let id: string
  try {
    const [r] = await conUtente(ctx.persona, (tx) =>
      tx<{ id: string }[]>`select public.crea_invito(${d.email}, ${d.nome}, ${d.cognome}, ${d.ruolo}, ${hash}) as id`)
    id = r.id
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  const esito = await spedisciInvito(ctx, id, d, linkInvito(await urlSito(), codice), 'Invito creato')
  revalidatePath('/studio/utenti')
  return esito
}

/** Modulo "Invita una persona". */
export async function invita(_: unknown, fd: FormData): Promise<EsitoAzione<EsitoInvito>> {
  const ctx = await richiediAdmin()
  const d = schemaInvito.safeParse(Object.fromEntries(fd))
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(d.error) }
  return creaInvito(ctx, d.data)
}

/** Una riga dell'importazione collaboratori (chiamata una per volta, per riportare l'esito riga per riga). */
export async function invitaRiga(input: { nome: string; cognome: string; email: string; ruolo: string }): Promise<EsitoAzione<EsitoInvito>> {
  const ctx = await richiediAdmin()
  const d = schemaInvito.safeParse(input)
  if (!d.success) return { ok: false, errore: Object.values(campiErrore(d.error)).join('. ') }
  return creaInvito(ctx, d.data)
}

/** "Rinvia": nuovo link (il vecchio smette di funzionare), altri 7 giorni, nuova email. */
export async function rinviaInvito(id: string): Promise<EsitoAzione<EsitoInvito>> {
  const ctx = await richiediAdmin()
  if (!z.uuid().safeParse(id).success) return { ok: false, errore: 'Invito non trovato.' }
  const { codice, hash } = nuovoCodiceInvito()
  let invito: DatiInvito
  try {
    invito = await conUtente(ctx.persona, async (tx) => {
      const [i] = await tx<DatiInvito[]>`
        select email, nome, cognome, ruolo from public.inviti where id = ${id} and stato = 'in_attesa'`
      if (!i) throw new ErroreUtente('Invito non trovato o già usato.')
      await tx`select public.rinnova_invito(${id}, ${hash})`
      return i
    })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  const esito = await spedisciInvito(ctx, id, invito, linkInvito(await urlSito(), codice), 'Invito rinnovato per altri 7 giorni')
  revalidatePath('/studio/utenti')
  return esito
}

export async function annullaInvito(id: string): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  if (!z.uuid().safeParse(id).success) return { ok: false, errore: 'Invito non trovato.' }
  try {
    await conUtente(persona, (tx) => tx`select public.annulla_invito(${id})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/studio/utenti')
  return { ok: true, messaggio: 'Invito annullato: il link non funziona più.' }
}

export async function cambiaRuolo(utente: string, ruolo: string): Promise<EsitoAzione> {
  const ctx = await richiediAdmin()
  const d = z.object({ utente: z.uuid(), ruolo: z.enum(['admin', 'collaboratore']) }).safeParse({ utente, ruolo })
  if (!d.success) return { ok: false, errore: 'Dati non validi.' }
  // anche il proprio ruolo si può cambiare: il database impedisce di lasciare lo studio senza admin attivi
  try {
    await conUtente(ctx.persona, (tx) => tx`select public.cambia_ruolo_utente(${d.data.utente}, ${d.data.ruolo})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  if (d.data.utente === ctx.utente.id && d.data.ruolo !== 'admin') redirect('/dashboard')
  return { ok: true, messaggio: d.data.ruolo === 'admin' ? 'Ora è admin.' : 'Ora è collaboratore.' }
}

const schemaDisattiva = z.object({
  utente: z.uuid(),
  nuovo: z.uuid().nullable(),
  clienti: z.boolean(),
  compiti: z.boolean(),
})

/**
 * Disattiva una persona. Se richiesto, prima passa i suoi clienti (referente e collaboratore aggiuntivo)
 * e i suoi compiti aperti a un'altra persona scelta dall'admin, tutto nella stessa transazione:
 * se qualcosa non va (per esempio è l'ultimo admin) non cambia nulla. Poi scollega la sua casella email.
 */
export async function disattivaPersona(input: z.infer<typeof schemaDisattiva>): Promise<EsitoAzione> {
  const ctx = await richiediAdmin()
  const d = schemaDisattiva.safeParse(input)
  if (!d.success) return { ok: false, errore: 'Dati non validi.' }
  const { utente, nuovo } = d.data
  if (nuovo === utente) return { ok: false, errore: 'Scegli un\'altra persona a cui passare il lavoro.' }

  let messaggio: string
  try {
    messaggio = await conUtente(ctx.persona, async (tx) => {
      const [p] = await tx<{ nome: string; cognome: string; attivo: boolean }[]>`
        select nome, cognome, attivo from public.utenti where id = ${utente} and ruolo in ('admin', 'collaboratore')`
      if (!p) throw new ErroreUtente('Persona non trovata.')
      if (!p.attivo) throw new ErroreUtente('Questa persona è già disattivata.')
      let nClienti = 0
      let nCompiti = 0
      let nomeNuovo = ''
      if (nuovo && (d.data.clienti || d.data.compiti)) {
        const [n] = await tx<{ nome: string; cognome: string }[]>`
          select nome, cognome from public.utenti where id = ${nuovo} and attivo and ruolo in ('admin', 'collaboratore')`
        if (!n) throw new ErroreUtente('Scegli una persona attiva a cui passare il lavoro.')
        nomeNuovo = nomeCompleto(n)
        if (d.data.clienti) {
          const referente = await tx<{ id: string }[]>`
            select a.cliente_id as id from public.assegnazioni a join public.clienti c on c.id = a.cliente_id
            where a.utente_id = ${utente} and a.al is null and a.referente_principale`
          if (referente.length) {
            await tx`select public.assegna_referente(${referente.map((c) => c.id)}::uuid[], ${nuovo})`
            nClienti += referente.length
          }
          const aggiuntivi = await tx<{ id: string }[]>`
            select a.cliente_id as id from public.assegnazioni a join public.clienti c on c.id = a.cliente_id
            where a.utente_id = ${utente} and a.al is null and not a.referente_principale`
          for (const c of aggiuntivi) {
            await tx`select public.imposta_collaboratore_aggiuntivo(${c.id}, ${nuovo}, true)`
            await tx`select public.imposta_collaboratore_aggiuntivo(${c.id}, ${utente}, false)`
            nClienti++
          }
        }
        if (d.data.compiti) {
          const compiti = await tx<{ id: string; altri: string[] }[]>`
            select k.id,
              array(select a.utente_id from public.compiti_assegnatari a join public.utenti u on u.id = a.utente_id
                    where a.compito_id = k.id and a.utente_id <> ${utente} and u.attivo) as altri
            from public.compiti k
            where k.stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')
              and exists (select 1 from public.compiti_assegnatari a where a.compito_id = k.id and a.utente_id = ${utente})`
          for (const k of compiti) {
            const assegnatari = [...new Set([...k.altri, nuovo])]
            await tx`select public.riassegna_compito(${k.id}, ${assegnatari}::uuid[])`
            nCompiti++
          }
        }
      }
      await tx`select public.imposta_utente_attivo(${utente}, false)`
      const passati = [
        nClienti ? `${nClienti} ${nClienti === 1 ? 'cliente' : 'clienti'}` : '',
        nCompiti ? `${nCompiti} ${nCompiti === 1 ? 'compito aperto' : 'compiti aperti'}` : '',
      ].filter(Boolean).join(' e ')
      return `${nomeCompleto(p)} è stato disattivato.${passati ? ` ${passati} ${nClienti + nCompiti === 1 ? 'è passato' : 'sono passati'} a ${nomeNuovo}.` : ''}`
    })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  // la casella di un utente disattivato viene scollegata (sezione 16.2)
  try {
    await scollegaCasellaUtente(utente)
  } catch (e) {
    console.error('Scollegamento casella non riuscito', e)
  }
  revalidatePath('/', 'layout')
  if (utente === ctx.utente.id) redirect('/accesso-sospeso')
  return { ok: true, messaggio }
}

export async function riattivaPersona(utente: string): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  if (!z.uuid().safeParse(utente).success) return { ok: false, errore: 'Persona non trovata.' }
  try {
    await conUtente(persona, (tx) => tx`select public.imposta_utente_attivo(${utente}, true)`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Riattivato: può di nuovo entrare con la sua email e password.' }
}

/**
 * Chi ha perso il telefono non riesce più a entrare: un admin può togliergli la verifica in due passaggi.
 * I fattori si gestiscono con la chiave di servizio di Supabase Auth, dopo il controllo che la persona
 * sia dello stesso studio (letta con RLS). Registrato nel registro attività.
 */
export async function togliDuePassaggi(utente: string): Promise<EsitoAzione> {
  const ctx = await richiediAdmin()
  if (!z.uuid().safeParse(utente).success) return { ok: false, errore: 'Persona non trovata.' }
  if (utente === ctx.utente.id) return { ok: false, errore: 'La tua verifica in due passaggi la gestisci dal tuo profilo.' }
  try {
    const [p] = await conUtente(ctx.persona, (tx) =>
      tx<{ id: string }[]>`select id from public.utenti where id = ${utente} and ruolo in ('admin', 'collaboratore')`)
    if (!p) return { ok: false, errore: 'Persona non trovata.' }
    const servizio = supabaseServizio()
    const { data, error } = await servizio.auth.admin.mfa.listFactors({ userId: utente })
    if (error) throw error
    for (const f of data?.factors ?? []) {
      const { error: e } = await servizio.auth.admin.mfa.deleteFactor({ id: f.id, userId: utente })
      if (e) throw e
    }
    await conUtente(ctx.persona, (tx) => tx`select public.registra_attivita('due_passaggi_tolta', 'utente', ${utente})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Non è stato possibile togliere la verifica in due passaggi.') }
  }
  revalidatePath('/studio/utenti')
  return { ok: true, messaggio: 'Verifica in due passaggi tolta: ora entra solo con la password e può riattivarla dal suo profilo.' }
}
