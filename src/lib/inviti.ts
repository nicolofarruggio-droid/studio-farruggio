import 'server-only'
import { codiceCasuale, sha256 } from '@/lib/cripto'
import { emailConfigurata, escapeHtml, htmlEmail, inviaEmail } from '@/lib/posta'

export function nuovoCodiceInvito() {
  const codice = codiceCasuale(24)
  return { codice, hash: sha256(codice) }
}

export function linkInvito(sito: string, codice: string) {
  return `${sito}/invito/${codice}`
}

/** Email di invito con i dati di accesso e il link per scegliere la password (sezione 5). */
export async function inviaEmailInvito(a: {
  email: string; nome: string; studio: string; ruolo: string; link: string; invitatoDa: string
}): Promise<{ ok: boolean; errore?: string }> {
  if (!emailConfigurata()) return { ok: false, errore: 'Servizio email non configurato' }
  const ruolo = a.ruolo === 'admin' ? 'amministratore (admin)' : 'collaboratore'
  try {
    await inviaEmail({
      a: a.email,
      oggetto: `${a.invitatoDa} ti ha invitato su BigBrotherStudio`,
      testo: `Ciao ${a.nome},\n\n${a.invitatoDa} ti ha invitato a entrare nello studio "${a.studio}" su BigBrotherStudio come ${ruolo}.\n\nIndirizzo con cui entrerai: ${a.email}\n\nApri questo link per scegliere la tua password personale (vale 7 giorni):\n${a.link}\n\nPuoi anche entrare con "Accedi con Google", usando l'account Google di questo indirizzo.`,
      html: htmlEmail(
        `Benvenuto in ${a.studio}`,
        [
          `Ciao ${escapeHtml(a.nome)},`,
          `${escapeHtml(a.invitatoDa)} ti ha invitato a entrare nello studio <strong>${escapeHtml(a.studio)}</strong> su BigBrotherStudio come <strong>${ruolo}</strong>.`,
          `Entrerai con questo indirizzo: <strong>${escapeHtml(a.email)}</strong>.`,
          'Apri il link qui sotto per scegliere la tua password personale: dopo averla salvata entri subito nel tuo spazio.',
        ],
        { testo: 'Scegli la tua password', url: a.link },
        'Il link vale 7 giorni. Puoi anche entrare con "Accedi con Google", usando l\'account Google di questo indirizzo. Se non ti aspettavi questo invito, ignora l\'email.',
      ),
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, errore: (e as Error).message }
  }
}
