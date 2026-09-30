'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { leggiSessione } from '@/lib/auth/sessione'
import { supabaseServer } from '@/lib/supabase/server'
import { percorsoSicuro } from '@/lib/sito'
import type { EsitoAzione } from '@/lib/errori'

/** Secondo passaggio dell'accesso: codice di 6 cifre dell'app di autenticazione (TOTP di Supabase Auth). */
export async function verificaCodice(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const s = await leggiSessione()
  if (!s) redirect('/accedi')
  const codice = z.string().trim().regex(/^\d{6}$/).safeParse(String(fd.get('codice') ?? '').replace(/\s/g, ''))
  if (!codice.success) {
    return { ok: false, errore: 'Scrivi il codice di 6 cifre che vedi nell\'app.', campi: { codice: 'Servono 6 cifre' } }
  }
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.mfa.listFactors()
  const fattori = data?.totp ?? []
  if (fattori.length === 0) redirect('/dashboard')
  // con più app registrate provo il codice su ognuna
  let riuscito = false
  for (const f of fattori) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: codice.data })
    if (!error) {
      riuscito = true
      break
    }
  }
  if (!riuscito) return { ok: false, errore: 'Codice non corretto o scaduto: scrivi quello che vedi adesso nell\'app.' }
  const next = percorsoSicuro(fd.get('next') as string | null)
  redirect(s.utente && !s.utente.onboarding_email_il ? '/email/collega?primo=1' : next)
}
