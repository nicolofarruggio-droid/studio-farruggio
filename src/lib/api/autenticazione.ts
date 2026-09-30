import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { comeSistema, type Persona, type Sql } from '@/lib/db'
import { sha256 } from '@/lib/cripto'
import { supabaseChiavePubblica, supabaseUrl } from '@/lib/supabase/server'
import type { Ruolo, Studio } from '@/lib/auth/sessione'
import { ErroreApi } from './errori'
import { leggiAutorizzazione } from './token'

// Chi sta chiamando l'API. Le credenziali si verificano qui; da lì in poi tutto passa da
// conUtente(persona, …), quindi da RLS e dalle funzioni SQL, come per l'interfaccia.

export type UtenteApi = {
  id: string
  studio_id: string
  nome: string
  cognome: string
  email: string
  ruolo: Ruolo
  permessi_agente: Record<string, unknown>
}

export type TokenApi = { id: string; nome: string; prefisso: string; scade_il: Date }

export type Chiamante = {
  tipo: 'agente' | 'persona'
  persona: Persona
  utente: UtenteApi
  studio: Studio
  /** Solo per gli agenti: il token usato (per i limiti di frequenza). */
  token: TokenApi | null
}

type RigaProfilo = UtenteApi & { attivo: boolean; studio: Studio }

const colonneProfilo = (sql: Sql) => sql`
  u.id, u.studio_id, u.nome, u.cognome, u.email, u.ruolo, u.attivo, u.permessi_agente,
  json_build_object('id', s.id, 'nome', s.nome, 'visibilita', s.visibilita,
    'creazione_compiti', s.creazione_compiti, 'soglia_ritardo_iva_mesi', s.soglia_ritardo_iva_mesi,
    'soglia_ritardo_prima_nota_mesi', s.soglia_ritardo_prima_nota_mesi,
    'lettura_email_attiva', s.lettura_email_attiva) as studio`

const nonAutenticato = (messaggio: string) =>
  new ErroreApi(401, 'non_autenticato', messaggio, undefined, { 'WWW-Authenticate': 'Bearer realm="BigBrotherStudio API"' })

function daProfilo(r: RigaProfilo, tipo: Chiamante['tipo'], token: TokenApi | null): Chiamante {
  const utente: UtenteApi = {
    id: r.id, studio_id: r.studio_id, nome: r.nome, cognome: r.cognome, email: r.email, ruolo: r.ruolo,
    permessi_agente: r.permessi_agente ?? {},
  }
  return { tipo, persona: { id: r.id, email: r.email.toLowerCase() }, utente, studio: r.studio, token }
}

async function autenticaAgente(token: string): Promise<Chiamante> {
  const impronta = sha256(token)
  const [r] = await comeSistema((sql) => sql<(RigaProfilo & {
    token_id: string; token_nome: string; prefisso: string; scade_il: Date; revocato_il: Date | null; token_studio: string
  })[]>`
    select t.id as token_id, t.nome as token_nome, t.prefisso, t.scade_il, t.revocato_il, t.studio_id as token_studio,
      ${colonneProfilo(sql)}
    from public.agenti_token t
    join public.utenti u on u.id = t.agente_id
    join public.studi s on s.id = u.studio_id
    where t.token_hash = ${impronta}`)
  if (!r || r.ruolo !== 'agente' || r.token_studio !== r.studio_id) {
    throw nonAutenticato('Token non valido: non corrisponde a nessun account agente.')
  }
  if (r.revocato_il) throw nonAutenticato('Questo token è stato revocato da un admin: chiedine uno nuovo.')
  if (new Date(r.scade_il).getTime() <= Date.now()) throw nonAutenticato('Questo token è scaduto: chiedine uno nuovo a un admin.')
  if (!r.attivo) throw new ErroreApi(403, 'permesso_negato', 'L\'account agente è sospeso: un admin può riattivarlo da Studio → Agenti AI e API.')
  return daProfilo(r, 'agente', { id: r.token_id, nome: r.token_nome, prefisso: r.prefisso, scade_il: r.scade_il })
}

async function autenticaPersona(token: string): Promise<Chiamante> {
  const supabase = createClient(supabaseUrl(), supabaseChiavePubblica(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw nonAutenticato('Access token non valido o scaduto: accedi di nuovo per ottenerne uno.')
  const [r] = await comeSistema((sql) => sql<RigaProfilo[]>`
    select ${colonneProfilo(sql)}
    from public.utenti u join public.studi s on s.id = u.studio_id
    where u.id = ${data.user.id} and u.ruolo <> 'agente'`)
  if (!r) throw new ErroreApi(403, 'permesso_negato', 'Questo account non appartiene ancora a uno studio.')
  if (!r.attivo) throw new ErroreApi(403, 'permesso_negato', 'Il tuo accesso allo studio è sospeso.')
  return daProfilo(r, 'persona', null)
}

/** Verifica le credenziali della richiesta (401/403 con un messaggio chiaro se non vanno bene). */
export async function autentica(richiesta: Request): Promise<Chiamante> {
  const c = leggiAutorizzazione(richiesta.headers.get('authorization'))
  if (c.tipo === 'errore') throw nonAutenticato(c.messaggio)
  return c.tipo === 'agente' ? autenticaAgente(c.token) : autenticaPersona(c.token)
}

/** Chiamante per un admin che agisce dall'interfaccia (approvazione delle proposte). */
export function chiamanteDaSessione(c: { persona: Persona; utente: Omit<UtenteApi, 'permessi_agente'>; studio: Studio }): Chiamante {
  return {
    tipo: 'persona',
    persona: c.persona,
    utente: { id: c.utente.id, studio_id: c.utente.studio_id, nome: c.utente.nome, cognome: c.utente.cognome,
      email: c.utente.email, ruolo: c.utente.ruolo, permessi_agente: {} },
    studio: c.studio,
    token: null,
  }
}
