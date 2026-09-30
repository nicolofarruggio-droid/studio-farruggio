'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { comeSistema, conUtente } from '@/lib/db'
import { sha256 } from '@/lib/cripto'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { leggiSessione } from '@/lib/auth/sessione'
import { supabaseServer, supabaseServizio } from '@/lib/supabase/server'
import { percorsoSicuro, urlSito } from '@/lib/sito'

const email = z.string().trim().toLowerCase().email('Indirizzo email non valido')
const password = z.string().min(10, 'La password deve avere almeno 10 caratteri').max(72, 'Password troppo lunga')

function campiErrore(e: z.ZodError) {
  const campi: Record<string, string> = {}
  for (const i of e.issues) campi[String(i.path[0])] ??= i.message
  return campi
}

/** Dove andare dopo l'accesso: registrazione da completare, collegamento email al primo accesso, oppure next. */
async function destinazioneDopoAccesso(next?: string | null): Promise<string> {
  const s = await leggiSessione()
  if (!s) return '/accedi'
  const n = percorsoSicuro(next)
  if (!s.utente) return n.startsWith('/invito/') ? n : '/completa-registrazione'
  if (!s.utente.attivo) return '/accesso-sospeso'
  if (!s.utente.onboarding_email_il) return '/email/collega?primo=1'
  return n
}

export async function accedi(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const dati = z.object({ email, password: z.string().min(1, 'Scrivi la password') }).safeParse({
    email: fd.get('email'), password: fd.get('password'),
  })
  if (!dati.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(dati.error) }
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword(dati.data)
  if (error) {
    if (error.code === 'email_not_confirmed')
      return { ok: false, errore: 'Devi ancora confermare il tuo indirizzo email: apri il link che ti abbiamo mandato.' }
    return { ok: false, errore: 'Email o password non corretti.' }
  }
  redirect(await destinazioneDopoAccesso(fd.get('next') as string | null))
}

export async function accediConGoogle(fd: FormData) {
  const next = percorsoSicuro(fd.get('next') as string | null, '')
  const sito = await urlSito()
  const supabase = await supabaseServer()
  const ritorno = new URL('/auth/callback', sito)
  if (next) ritorno.searchParams.set('next', next)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    // "Accedi con Google" chiede solo nome ed email; il permesso Gmail è un passaggio separato (16.2)
    options: { redirectTo: ritorno.toString(), scopes: 'openid email profile', queryParams: { prompt: 'select_account' } },
  })
  if (error || !data.url) redirect('/accedi?errore=google')
  redirect(data.url)
}

const schemaRegistrazione = z
  .object({
    nome_studio: z.string().trim().min(1, 'Scrivi il nome dello studio').max(200),
    nome: z.string().trim().min(1, 'Scrivi il tuo nome').max(100),
    cognome: z.string().trim().min(1, 'Scrivi il tuo cognome').max(100),
    email,
    password,
    conferma: z.string(),
    termini: z.literal('on', { message: 'Serve il consenso per proseguire' }),
  })
  .refine((d) => d.password === d.conferma, { message: 'Le due password non coincidono', path: ['conferma'] })

/**
 * Supabase Auth, se ci si registra con un indirizzo che ha già un account non confermato, rimanda la conferma
 * ma tiene la password e i dati della PRIMA registrazione: chiunque potrebbe registrarsi prima del vero
 * proprietario con una password sua. Per questo un account mai confermato (senza profilo nel gestionale)
 * si elimina prima di crearne uno nuovo. Restituisce se l'indirizzo ha un account confermato o un profilo,
 * e se è stato eliminato un account non confermato.
 */
async function liberaIndirizzo(email: string): Promise<{ confermato: boolean; sostituito: boolean }> {
  const [profilo] = await comeSistema((sql) => sql`select 1 from public.utenti where lower(email) = ${email} and ruolo <> 'agente'`)
  if (profilo) return { confermato: true, sostituito: false }
  const [u] = await comeSistema((sql) => sql<{ id: string; confermato: boolean }[]>`
    select id, email_confirmed_at is not null as confermato from auth.users where lower(email) = ${email}`)
  if (!u) return { confermato: false, sostituito: false }
  if (u.confermato) return { confermato: true, sostituito: false }
  const { error } = await supabaseServizio().auth.admin.deleteUser(u.id)
  if (error) throw new Error('Non è stato possibile preparare l\'account: riprova.')
  return { confermato: false, sostituito: true }
}

export async function registraStudio(_: unknown, fd: FormData): Promise<EsitoAzione<{ email: string }>> {
  const dati = schemaRegistrazione.safeParse(Object.fromEntries(fd))
  if (!dati.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(dati.error) }
  const { nome_studio, nome, cognome } = dati.data
  let sostituito = false
  try {
    // un account già confermato resta com'è: Supabase risponde come sempre, senza rivelare che esiste
    sostituito = (await liberaIndirizzo(dati.data.email)).sostituito
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  const supabase = await supabaseServer()
  const sito = await urlSito()
  const { error } = await supabase.auth.signUp({
    email: dati.data.email,
    password: dati.data.password,
    // se c'era una registrazione non confermata, chi conferma sceglierà di nuovo la password (dopo-accesso.ts)
    options: { emailRedirectTo: `${sito}/auth/callback`, data: { nome_studio, nome, cognome, ...(sostituito ? { sostituisce: true } : {}) } },
  })
  if (error) {
    if (error.code === 'weak_password') return { ok: false, errore: 'La password è troppo semplice: scegline una più lunga.' }
    if (error.code === 'over_email_send_rate_limit') return { ok: false, errore: 'Troppe richieste: riprova tra qualche minuto.' }
    return { ok: false, errore: messaggioErrore(error, 'Registrazione non riuscita. Riprova.') }
  }
  return { ok: true, dati: { email: dati.data.email } }
}

export async function passwordDimenticata(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const dati = email.safeParse(fd.get('email'))
  if (!dati.success) return { ok: false, errore: 'Indirizzo email non valido', campi: { email: 'Indirizzo email non valido' } }
  const supabase = await supabaseServer()
  const sito = await urlSito()
  await supabase.auth.resetPasswordForEmail(dati.data, { redirectTo: `${sito}/auth/callback?next=/reimposta-password` })
  // stesso messaggio in ogni caso, per non rivelare quali indirizzi hanno un account
  return { ok: true, messaggio: 'Se l\'indirizzo ha un account, ti abbiamo mandato un\'email con il link per scegliere una nuova password.' }
}

export async function reimpostaPassword(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const dati = z
    .object({ password, conferma: z.string() })
    .refine((d) => d.password === d.conferma, { message: 'Le due password non coincidono', path: ['conferma'] })
    .safeParse(Object.fromEntries(fd))
  if (!dati.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(dati.error) }
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.updateUser({ password: dati.data.password })
  // stessa password di prima: va bene, è comunque quella appena scritta da chi ha la sessione
  if (error && error.code !== 'same_password') {
    return { ok: false, errore: 'Il link è scaduto o non è valido: chiedine uno nuovo da "Password dimenticata?".' }
  }
  redirect(await destinazioneDopoAccesso('/dashboard'))
}

export async function completaRegistrazione(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const s = await leggiSessione()
  if (!s) redirect('/accedi')
  if (s.utente) redirect('/dashboard')
  const dati = z
    .object({
      nome_studio: z.string().trim().min(1, 'Scrivi il nome dello studio').max(200),
      nome: z.string().trim().min(1, 'Scrivi il tuo nome').max(100),
      cognome: z.string().trim().min(1, 'Scrivi il tuo cognome').max(100),
      termini: z.literal('on', { message: 'Serve il consenso per proseguire' }),
    })
    .safeParse(Object.fromEntries(fd))
  if (!dati.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(dati.error) }
  try {
    await conUtente(s.persona, (tx) => tx`select public.registra_studio(${dati.data.nome_studio}, ${dati.data.nome}, ${dati.data.cognome})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  redirect('/email/collega?primo=1')
}

type InfoInvito = { email: string; nome: string; cognome: string; stato: string; scaduto: boolean; email_inviata: boolean }

async function invitoValido(codice: string): Promise<InfoInvito | { errore: string }> {
  const [invito] = await comeSistema((sql) => sql<InfoInvito[]>`
    select email, nome, cognome, stato, scaduto, email_inviata from public.info_invito(${sha256(codice)})`)
  if (!invito || invito.stato !== 'in_attesa') return { errore: 'Invito non valido o già usato.' }
  if (invito.scaduto) return { errore: 'Il link di invito è scaduto: chiedi all\'admin di rinviarlo.' }
  return invito
}

const GIA_REGISTRATO = 'Questo indirizzo ha già un account: accedi con la tua password e riapri il link dell\'invito.'

/**
 * Accetta l'invito scegliendo la password personale (chi non ha ancora un account).
 * Vale solo per i link arrivati per email: l'indirizzo è confermato dal link stesso.
 */
export async function accettaInvitoConPassword(codice: string, _: unknown, fd: FormData): Promise<EsitoAzione> {
  const dati = z
    .object({ password, conferma: z.string() })
    .refine((d) => d.password === d.conferma, { message: 'Le due password non coincidono', path: ['conferma'] })
    .safeParse(Object.fromEntries(fd))
  if (!dati.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(dati.error) }

  const invito = await invitoValido(codice)
  if ('errore' in invito) return { ok: false, errore: invito.errore }
  if (!invito.email_inviata) return { ok: false, errore: 'Per questo invito serve prima confermare l\'indirizzo email: ricarica la pagina.' }

  try {
    if ((await liberaIndirizzo(invito.email)).confermato) return { ok: false, errore: GIA_REGISTRATO }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  const servizio = supabaseServizio()
  const { data: creato, error } = await servizio.auth.admin.createUser({
    email: invito.email,
    password: dati.data.password,
    email_confirm: true, // l'indirizzo è confermato dal link ricevuto via email
    user_metadata: { nome: invito.nome, cognome: invito.cognome },
  })
  if (error || !creato.user) return { ok: false, errore: messaggioErrore(error, 'Non è stato possibile creare l\'account.') }

  try {
    await conUtente({ id: creato.user.id, email: invito.email }, (tx) => tx`select public.accetta_invito(${sha256(codice)})`)
  } catch (e) {
    await servizio.auth.admin.deleteUser(creato.user.id)
    return { ok: false, errore: messaggioErrore(e) }
  }
  const supabase = await supabaseServer()
  await supabase.auth.signInWithPassword({ email: invito.email, password: dati.data.password })
  redirect('/email/collega?primo=1')
}

/**
 * Invito il cui link non è partito per email (l'admin l'ha copiato e mandato a mano): chi apre il link
 * conferma di essere il proprietario dell'indirizzo con un'email di Supabase Auth. Solo dopo la conferma
 * l'account esiste davvero, l'invito viene accettato e la persona sceglie la sua password
 * (src/lib/auth/dopo-accesso.ts). Così chi ha visto il link non può creare un account a nome di altri.
 */
export async function confermaIndirizzoInvito(codice: string): Promise<EsitoAzione> {
  const invito = await invitoValido(codice)
  if ('errore' in invito) return { ok: false, errore: invito.errore }
  try {
    // se si chiede di nuovo il link, l'account non confermato di prima si rifà: vale solo l'ultima email
    if ((await liberaIndirizzo(invito.email)).confermato) return { ok: false, errore: GIA_REGISTRATO }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  const sito = await urlSito()
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithOtp({
    email: invito.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${sito}/auth/callback?next=${encodeURIComponent(`/invito/${codice}`)}`,
      data: { nome: invito.nome, cognome: invito.cognome, invito: codice },
    },
  })
  if (error) {
    if (error.code === 'over_email_send_rate_limit') return { ok: false, errore: 'Troppe richieste: riprova tra qualche minuto.' }
    return { ok: false, errore: messaggioErrore(error, 'Non è stato possibile mandare l\'email di conferma.') }
  }
  return {
    ok: true,
    messaggio: `Ti abbiamo mandato un'email a ${invito.email}: apri il link per confermare l'indirizzo. Poi sceglierai la tua password. Se chiedi un altro link, vale solo l'ultimo.`,
  }
}

/** Accetta l'invito con l'account con cui si è già entrati (password o Google). */
export async function accettaInvito(codice: string): Promise<EsitoAzione> {
  const s = await leggiSessione()
  if (!s) redirect(`/accedi?next=/invito/${codice}`)
  try {
    await conUtente(s.persona, (tx) => tx`select public.accetta_invito(${sha256(codice)})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  redirect('/email/collega?primo=1')
}

export async function esci() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/accedi')
}
