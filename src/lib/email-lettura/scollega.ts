import 'server-only'
import { comeSistema } from '@/lib/db'
import { decifra } from '@/lib/cripto'
import { PREFISSO_TOKEN_PROVA } from './gmail-prova'
import { revocaToken } from './oauth'

/**
 * Scollega la casella email di un utente: revoca il token presso Google (se possibile),
 * cancella il token cifrato e ferma i controlli. Le comunicazioni già scritte restano (sezione 16.2).
 * Usata anche quando un utente viene disattivato.
 */
export async function scollegaCasellaUtente(utenteId: string): Promise<void> {
  const token = await comeSistema((sql) => sql<{ token_cifrato: string }[]>`
    select t.token_cifrato from public.caselle_email_token t
      join public.caselle_email c on c.id = t.casella_id
     where c.utente_id = ${utenteId}`)
  for (const riga of token) {
    let valore: string | null = null
    try {
      valore = decifra(riga.token_cifrato)
    } catch {
      // chiave cambiata o dato rovinato: il token non si può più usare, basta cancellarlo
    }
    // la casella di prova non ha nulla da revocare presso Google
    if (valore && !valore.startsWith(PREFISSO_TOKEN_PROVA)) {
      const revocato = await revocaToken(valore)
      if (!revocato) console.error('Revoca del token presso Google non riuscita: il token viene comunque cancellato')
    }
  }
  await comeSistema((sql) =>
    sql.begin(async (tx) => {
      await tx`delete from public.caselle_email_token where casella_id in (select id from public.caselle_email where utente_id = ${utenteId})`
      await tx`
        update public.caselle_email
           set stato = 'non_collegata', cursore = null, ultimo_errore = null, controllo_in_corso_dal = null
         where utente_id = ${utenteId}`
      // le email in sospeso non verranno più elaborate; restano solo gli identificativi di quelle già fatte
      await tx`
        delete from public.email_elaborate
         where casella_id in (select id from public.caselle_email where utente_id = ${utenteId})
           and esito in ('in_attesa', 'da_rielaborare')`
    }),
  )
}
