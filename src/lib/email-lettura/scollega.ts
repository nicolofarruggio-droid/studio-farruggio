import 'server-only'
import { comeSistema } from '@/lib/db'

/**
 * Scollega la casella email di un utente: revoca il token presso Google (se possibile),
 * cancella il token cifrato e ferma i controlli. Le comunicazioni già scritte restano (sezione 16.2).
 * Usata anche quando un utente viene disattivato.
 */
export async function scollegaCasellaUtente(utenteId: string): Promise<void> {
  // TODO(modulo email): revocare il token presso Google prima di cancellarlo
  await comeSistema(async (sql) => {
    await sql`delete from public.caselle_email_token where casella_id in (select id from public.caselle_email where utente_id = ${utenteId})`
    await sql`update public.caselle_email set stato = 'non_collegata', cursore = null where utente_id = ${utenteId}`
  })
}
