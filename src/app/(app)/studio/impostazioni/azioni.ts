'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente, type Persona } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { ErroreUtente, messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { EMAIL_VALIDA, etichettaCreazione, etichettaVisibilita } from '@/lib/studio/testi'

// Impostazioni dello studio (sezione 5.6): UPDATE diretto su public.studi con i permessi dell'admin.
// Colonne e righe modificabili sono già limitate nel database (grant + policy studi_modifica_admin);
// il trigger trg_studi_impostazioni scrive nel registro attività il valore prima e dopo.

type Campi = Partial<{
  nome: string
  ragione_sociale: string | null
  partita_iva: string | null
  codice_fiscale: string | null
  indirizzo: string | null
  telefono: string | null
  email: string | null
  pec: string | null
  visibilita: string
  creazione_compiti: string
  soglia_ritardo_iva_mesi: number
  soglia_ritardo_prima_nota_mesi: number
  lettura_email_attiva: boolean
}>

async function aggiorna(persona: Persona, campi: Campi) {
  const colonne = Object.keys(campi) as (keyof Campi)[]
  await conUtente(persona, async (tx) => {
    const r = await tx`update public.studi set ${tx(campi, ...colonne)} where id = public.mio_studio() returning id`
    if (r.length === 0) throw new ErroreUtente('Non hai i permessi per cambiare le impostazioni dello studio.')
  })
  revalidatePath('/', 'layout')
}

function campiErrore(e: z.ZodError) {
  const campi: Record<string, string> = {}
  for (const i of e.issues) campi[String(i.path[0])] ??= i.message
  return campi
}

const facoltativo = (max: number) =>
  z.string().trim().max(max, `Al massimo ${max} caratteri`).transform((s) => (s === '' ? null : s))

const schemaAnagrafica = z.object({
  nome: z.string().trim().min(1, 'Scrivi il nome dello studio').max(200, 'Al massimo 200 caratteri'),
  ragione_sociale: facoltativo(300),
  partita_iva: z
    .string()
    .transform((s) => s.replace(/\s+/g, '').toUpperCase())
    .refine((s) => s === '' || /^(IT)?\d{11}$/.test(s), 'La partita IVA ha 11 cifre')
    .transform((s) => (s === '' ? null : s.replace(/^IT/, ''))),
  codice_fiscale: z
    .string()
    .transform((s) => s.replace(/\s+/g, '').toUpperCase())
    .refine((s) => s === '' || /^[A-Z0-9]{16}$/.test(s) || /^\d{11}$/.test(s), 'Il codice fiscale ha 16 caratteri (o 11 cifre per le società)')
    .transform((s) => (s === '' ? null : s)),
  indirizzo: facoltativo(300),
  telefono: facoltativo(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((s) => s === '' || EMAIL_VALIDA.test(s), 'Indirizzo email non valido')
    .transform((s) => (s === '' ? null : s)),
  pec: z
    .string()
    .trim()
    .toLowerCase()
    .refine((s) => s === '' || EMAIL_VALIDA.test(s), 'Indirizzo PEC non valido')
    .transform((s) => (s === '' ? null : s)),
})

export async function salvaAnagrafica(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  const d = schemaAnagrafica.safeParse(Object.fromEntries(fd))
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(d.error) }
  try {
    await aggiorna(persona, d.data)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  return { ok: true, messaggio: 'Dati dello studio salvati.' }
}

export async function salvaVisibilita(valore: string): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  const d = z.enum(['solo_propri', 'studio_lettura', 'studio_completo']).safeParse(valore)
  if (!d.success) return { ok: false, errore: 'Scegli una delle tre opzioni.' }
  try {
    await aggiorna(persona, { visibilita: d.data })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  return { ok: true, messaggio: `Visibilità tra collaboratori: ${etichettaVisibilita(d.data)}. Vale da subito.` }
}

export async function salvaCreazioneCompiti(valore: string): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  const d = z.enum(['solo_admin', 'per_se', 'tutti']).safeParse(valore)
  if (!d.success) return { ok: false, errore: 'Scegli una delle tre opzioni.' }
  try {
    await aggiorna(persona, { creazione_compiti: d.data })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  return { ok: true, messaggio: `Chi può creare compiti: ${etichettaCreazione(d.data)}.` }
}

const mesi = z.coerce
  .number({ message: 'Scrivi un numero di mesi' })
  .int('Scrivi un numero intero di mesi')
  .min(0, 'Da 0 a 36 mesi')
  .max(36, 'Da 0 a 36 mesi')

export async function salvaSoglie(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  const d = z
    .object({ soglia_ritardo_iva_mesi: mesi, soglia_ritardo_prima_nota_mesi: mesi })
    .safeParse(Object.fromEntries(fd))
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: campiErrore(d.error) }
  try {
    await aggiorna(persona, d.data)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  return { ok: true, messaggio: 'Soglie di ritardo salvate: gli elenchi dei clienti in ritardo si aggiornano subito.' }
}

export async function salvaLetturaEmail(attiva: boolean): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  if (typeof attiva !== 'boolean') return { ok: false, errore: 'Valore non valido.' }
  try {
    await aggiorna(persona, { lettura_email_attiva: attiva })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  return {
    ok: true,
    messaggio: attiva
      ? 'Lettura automatica delle email attivata per lo studio.'
      : 'Lettura automatica delle email spenta: le caselle non vengono più controllate.',
  }
}
