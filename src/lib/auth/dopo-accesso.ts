import 'server-only'
import { comeSistema, conUtente } from '@/lib/db'
import { sha256 } from '@/lib/cripto'
import { percorsoSicuro } from '@/lib/sito'
import type { User } from '@supabase/supabase-js'

/**
 * Dopo la conferma dell'email o il ritorno da Google decide dove mandare l'utente.
 * Chi si è appena registrato con email e password ha nome dello studio, nome e cognome nei
 * metadati: lo studio viene creato qui e la persona diventa admin (sezione 5, punto 1).
 */
export async function destinazioneDopoConferma(user: User, next: string | null): Promise<string> {
  const persona = { id: user.id, email: (user.email ?? '').toLowerCase() }
  const n = percorsoSicuro(next)
  const [profilo] = await comeSistema((sql) => sql<{ attivo: boolean; onboarding_email_il: Date | null }[]>`
    select attivo, onboarding_email_il from public.utenti where id = ${user.id}`)
  if (profilo) {
    if (!profilo.attivo) return '/accesso-sospeso'
    if (n === '/reimposta-password') return n
    return profilo.onboarding_email_il ? n : '/email/collega?primo=1'
  }
  if (n === '/reimposta-password') return n

  // Invito: chi arriva da Google o dalla conferma dell'indirizzo entra subito nello studio.
  // Chi ha confermato l'indirizzo con il link dell'invito (senza password) sceglie poi la sua password.
  const m = user.user_metadata ?? {}
  const daInvito = typeof m.invito === 'string' && /^[A-Za-z0-9_-]{16,200}$/.test(m.invito) ? m.invito : null
  const codice = n.startsWith('/invito/') ? n.slice('/invito/'.length) : daInvito
  if (codice) {
    try {
      await conUtente(persona, (tx) => tx`select public.accetta_invito(${sha256(codice)})`)
      return codice === daInvito ? '/reimposta-password?primo=1' : '/email/collega?primo=1'
    } catch {
      return `/invito/${encodeURIComponent(codice)}`
    }
  }

  // La registrazione ne ha sostituita una non confermata con lo stesso indirizzo (src/app/(pubblico)/azioni.ts):
  // la password potrebbe averla scelta un altro, quindi chi ha confermato la sceglie ora e poi completa i dati.
  if (m.sostituisce === true) return '/reimposta-password?primo=1'

  if (typeof m.nome_studio === 'string' && m.nome_studio.trim() && typeof m.nome === 'string') {
    try {
      await conUtente(persona, (tx) => tx`select public.registra_studio(${m.nome_studio}, ${m.nome}, ${m.cognome ?? ''})`)
      return '/email/collega?primo=1'
    } catch {
      // per esempio: indirizzo già usato in uno studio. Si completa a mano.
    }
  }
  return '/completa-registrazione'
}
