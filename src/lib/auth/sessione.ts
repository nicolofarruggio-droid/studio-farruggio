import 'server-only'
import { cache } from 'react'
import { redirect, notFound } from 'next/navigation'
import { comeSistema, type Persona } from '@/lib/db'
import { supabaseServer } from '@/lib/supabase/server'

export type Ruolo = 'admin' | 'collaboratore' | 'agente'
export type Visibilita = 'solo_propri' | 'studio_lettura' | 'studio_completo'
export type CreazioneCompiti = 'solo_admin' | 'per_se' | 'tutti'

export type Utente = {
  id: string
  studio_id: string
  nome: string
  cognome: string
  email: string
  ruolo: Ruolo
  attivo: boolean
  onboarding_email_il: Date | null
  preferenze_notifiche: Record<string, boolean>
}

export type Studio = {
  id: string
  nome: string
  visibilita: Visibilita
  creazione_compiti: CreazioneCompiti
  soglia_ritardo_iva_mesi: number
  soglia_ritardo_prima_nota_mesi: number
  lettura_email_attiva: boolean
}

export type Sessione = {
  persona: Persona
  metadati: Record<string, unknown>
  utente: Utente | null
  studio: Studio | null
}

/** Utente autenticato (verificato con Supabase Auth) e il suo profilo nello studio. Una volta per richiesta. */
export const leggiSessione = cache(async (): Promise<Sessione | null> => {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return null
  const persona = { id: user.id, email: user.email.toLowerCase() }
  // Il proprio profilo si legge anche da disattivati (per mostrare "accesso sospeso"):
  // l'id arriva dal token verificato da Supabase Auth.
  const righe = await comeSistema(
    (sql) => sql<(Utente & { studio: Studio; ultimo_accesso: Date | null })[]>`
      select u.id, u.studio_id, u.nome, u.cognome, u.email, u.ruolo, u.attivo, u.onboarding_email_il,
             u.preferenze_notifiche, u.ultimo_accesso,
             json_build_object('id', s.id, 'nome', s.nome, 'visibilita', s.visibilita,
               'creazione_compiti', s.creazione_compiti, 'soglia_ritardo_iva_mesi', s.soglia_ritardo_iva_mesi,
               'soglia_ritardo_prima_nota_mesi', s.soglia_ritardo_prima_nota_mesi,
               'lettura_email_attiva', s.lettura_email_attiva) as studio
      from public.utenti u join public.studi s on s.id = u.studio_id
      where u.id = ${user.id} and u.ruolo <> 'agente'`,
  )
  const r = righe[0]
  if (r && r.attivo && (!r.ultimo_accesso || Date.now() - new Date(r.ultimo_accesso).getTime() > 10 * 60_000)) {
    comeSistema((sql) => sql`update public.utenti set ultimo_accesso = now() where id = ${user.id}`).catch(() => {})
  }
  const { studio, ultimo_accesso: _ultimo, ...utente } = r ?? ({} as never)
  return {
    persona,
    metadati: user.user_metadata ?? {},
    utente: r ? (utente as Utente) : null,
    studio: r ? studio : null,
  }
})

export type Contesto = { persona: Persona; utente: Utente; studio: Studio }

/** Per pagine e azioni riservate agli utenti di uno studio. */
export async function richiediUtente(): Promise<Contesto> {
  const s = await leggiSessione()
  if (!s) redirect('/accedi')
  if (!s.utente || !s.studio) redirect('/completa-registrazione')
  if (!s.utente.attivo) redirect('/accesso-sospeso')
  return { persona: s.persona, utente: s.utente, studio: s.studio }
}

export async function richiediAdmin(): Promise<Contesto> {
  const c = await richiediUtente()
  if (c.utente.ruolo !== 'admin') notFound()
  return c
}

export const nomeCompleto = (u: { nome: string; cognome: string }) => `${u.nome} ${u.cognome}`.trim()
