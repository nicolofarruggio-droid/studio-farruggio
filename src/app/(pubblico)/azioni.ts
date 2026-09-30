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

export async function registraStudio(_: unknown, fd: FormData): Promise<EsitoAzione<{ email: string }>> {
  const dati = schemaRegistrazione.safeParse(Object.fromEntries(fd))
  if (!dati.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(dati.error) }
  const { nome_studio, nome, cognome } = dati.data
  const supabase = await supabaseServer()
  const sito = await urlSito()
  const { error } = await supabase.auth.signUp({
    email: dati.data.email,
    password: dati.data.password,
    options: { emailRedirectTo: `${sito}/auth/callback`, data: { nome_studio, nome, cognome } },
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
  if (error) {
    if (error.code === 'same_password') return { ok: false, errore: 'Scegli una password diversa da quella attuale.' }
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

/** Accetta l'invito scegliendo la password personale (chi non ha ancora un account). */
export async function accettaInvitoConPassword(codice: string, _: unknown, fd: FormData): Promise<EsitoAzione> {
  const dati = z
    .object({ password, conferma: z.string() })
    .refine((d) => d.password === d.conferma, { message: 'Le due password non coincidono', path: ['conferma'] })
    .safeParse(Object.fromEntries(fd))
  if (!dati.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(dati.error) }

  const hash = sha256(codice)
  const [invito] = await comeSistema((sql) => sql<{ email: string; nome: string; cognome: string; stato: string; scaduto: boolean }[]>`
    select email, nome, cognome, stato, scaduto from public.info_invito(${hash})`)
  if (!invito || invito.stato !== 'in_attesa') return { ok: false, errore: 'Invito non valido o già usato.' }
  if (invito.scaduto) return { ok: false, errore: 'Il link di invito è scaduto: chiedi all\'admin di rinviarlo.' }

  const [esistente] = await comeSistema((sql) => sql`select id from auth.users where lower(email) = ${invito.email}`)
  if (esistente) {
    return { ok: false, errore: 'Questo indirizzo ha già un account: accedi con la tua password e riapri il link dell\'invito.' }
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
    await conUtente({ id: creato.user.id, email: invito.email }, (tx) => tx`select public.accetta_invito(${hash})`)
  } catch (e) {
    await servizio.auth.admin.deleteUser(creato.user.id)
    return { ok: false, errore: messaggioErrore(e) }
  }
  const supabase = await supabaseServer()
  await supabase.auth.signInWithPassword({ email: invito.email, password: dati.data.password })
  redirect('/email/collega?primo=1')
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
