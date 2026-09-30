'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { supabaseServer } from '@/lib/supabase/server'
import { CHIAVI_PREFERENZE } from '@/lib/studio/preferenze'

function campiErrore(e: z.ZodError) {
  const campi: Record<string, string> = {}
  for (const i of e.issues) campi[String(i.path[0])] ??= i.message
  return campi
}

/** Nome e cognome: le colonne modificabili dall'utente sono già limitate nel database. */
export async function salvaDatiPersonali(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona } = await richiediUtente()
  const d = z
    .object({
      nome: z.string().trim().min(1, 'Scrivi il tuo nome').max(100, 'Al massimo 100 caratteri'),
      cognome: z.string().trim().max(100, 'Al massimo 100 caratteri'),
    })
    .safeParse(Object.fromEntries(fd))
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(d.error) }
  try {
    await conUtente(persona, (tx) =>
      tx`update public.utenti set nome = ${d.data.nome}, cognome = ${d.data.cognome} where id = ${persona.id}`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Dati salvati.' }
}

export async function cambiaPassword(_: unknown, fd: FormData): Promise<EsitoAzione> {
  await richiediUtente()
  const d = z
    .object({
      password: z.string().min(10, 'La password deve avere almeno 10 caratteri').max(72, 'Password troppo lunga'),
      conferma: z.string(),
    })
    .refine((x) => x.password === x.conferma, { message: 'Le due password non coincidono', path: ['conferma'] })
    .safeParse(Object.fromEntries(fd))
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(d.error) }
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.updateUser({ password: d.data.password })
  if (error) {
    if (error.code === 'same_password') return { ok: false, errore: 'Scegli una password diversa da quella attuale.' }
    if (error.code === 'weak_password') return { ok: false, errore: 'La password è troppo semplice: scegline una più lunga o meno prevedibile.' }
    if (error.code === 'reauthentication_needed' || error.code === 'insufficient_aal')
      return { ok: false, errore: 'Per sicurezza esci, rientra e riprova subito dopo.' }
    return { ok: false, errore: 'Non è stato possibile cambiare la password. Riprova.' }
  }
  return { ok: true, messaggio: 'Password cambiata. Dalla prossima volta entri con quella nuova.' }
}

/** Quali email di notifica ricevere (sezione 8): una casella per tipo, tutte attive di default. */
export async function salvaPreferenze(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona } = await richiediUtente()
  const preferenze = Object.fromEntries(CHIAVI_PREFERENZE.map((k) => [k, fd.get(k) === 'on']))
  try {
    await conUtente(persona, (tx) =>
      tx`update public.utenti set preferenze_notifiche = ${tx.json(preferenze)} where id = ${persona.id}`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/profilo')
  return { ok: true, messaggio: 'Preferenze delle email salvate.' }
}

// ---------------------------------------------------------------------------
// Verifica in due passaggi (TOTP di Supabase Auth, sezione 5)
// ---------------------------------------------------------------------------
export type NuovoFattore = { id: string; qr: string; segreto: string; uri: string }

/** Prepara un nuovo fattore TOTP: restituisce il QR da inquadrare e il codice segreto da scrivere a mano. */
export async function avviaDuePassaggi(): Promise<EsitoAzione<NuovoFattore>> {
  await richiediUtente()
  const supabase = await supabaseServer()
  // i tentativi lasciati a metà (fattori non verificati) si tolgono prima di ricominciare
  const { data: elenco } = await supabase.auth.mfa.listFactors()
  for (const f of elenco?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'BigBrotherStudio',
    friendlyName: `App di autenticazione ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  })
  if (error || !data || data.type !== 'totp') {
    return { ok: false, errore: 'Non è stato possibile avviare la verifica in due passaggi. Riprova tra poco.' }
  }
  // il QR arriva come SVG in un data URI non codificato: lo codifico perché funzioni in ogni browser
  const svg = data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, '')
  return {
    ok: true,
    dati: {
      id: data.id,
      qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      segreto: data.totp.secret,
      uri: data.totp.uri,
    },
  }
}

export async function confermaDuePassaggi(fattore: string, codice: string): Promise<EsitoAzione> {
  const { persona, utente } = await richiediUtente()
  const d = z.object({ fattore: z.string().min(1), codice: z.string().trim().regex(/^\d{6}$/) }).safeParse({ fattore, codice })
  if (!d.success) return { ok: false, errore: 'Scrivi il codice di 6 cifre che vedi nell\'app.' }
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: d.data.fattore, code: d.data.codice })
  if (error) return { ok: false, errore: 'Codice non corretto o scaduto: scrivi quello che vedi adesso nell\'app.' }
  try {
    await conUtente(persona, (tx) => tx`select public.registra_attivita('due_passaggi_attivata', 'utente', ${utente.id})`)
  } catch {
    // il registro è per gli admin; per un collaboratore basta che la verifica sia attiva
  }
  revalidatePath('/profilo')
  return { ok: true, messaggio: 'Verifica in due passaggi attiva: da ora, dopo la password, ti chiederemo il codice dell\'app.' }
}

export async function rimuoviDuePassaggi(fattore: string): Promise<EsitoAzione> {
  const { persona, utente } = await richiediUtente()
  if (!fattore) return { ok: false, errore: 'Fattore non trovato.' }
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fattore })
  if (error) return { ok: false, errore: 'Non è stato possibile disattivarla. Esci, rientra con il codice e riprova.' }
  try {
    await conUtente(persona, (tx) => tx`select public.registra_attivita('due_passaggi_disattivata', 'utente', ${utente.id})`)
  } catch {
    // come sopra
  }
  revalidatePath('/profilo')
  return { ok: true, messaggio: 'Verifica in due passaggi disattivata: da ora entri solo con la password.' }
}
