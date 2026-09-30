// Testi condivisi dell'area Studio (impostazioni, ruoli, accessi). Nessuna dipendenza dal server:
// si usano sia nelle pagine sia nei componenti client e nei test.
import type { CreazioneCompiti, Visibilita } from '@/lib/auth/sessione'

export const OPZIONI_VISIBILITA: { valore: Visibilita; titolo: string; descrizione: string }[] = [
  {
    valore: 'solo_propri',
    titolo: 'Solo i propri',
    descrizione:
      'Ogni collaboratore vede e lavora solo sui clienti assegnati a lui e sui compiti suoi (più gli spazi dei colleghi che gli hai concesso).',
  },
  {
    valore: 'studio_lettura',
    titolo: 'Tutto lo studio, in sola lettura',
    descrizione:
      'Vede clienti, compiti, aggiornamenti, comunicazioni e documenti di tutti i colleghi, ma lavora solo sui propri.',
  },
  {
    valore: 'studio_completo',
    titolo: 'Tutto lo studio, con accesso completo',
    descrizione:
      'Vede tutto e lavora su clienti e compiti di tutti: aggiorna le date, commenta, carica documenti, cambia lo stato dei compiti, aggiunge comunicazioni e indirizzi email.',
  },
]

export const OPZIONI_CREAZIONE: { valore: CreazioneCompiti; titolo: string; descrizione: string }[] = [
  { valore: 'solo_admin', titolo: 'Solo gli admin', descrizione: 'I collaboratori non creano compiti: li ricevono.' },
  {
    valore: 'per_se',
    titolo: 'Anche i collaboratori, ma solo per sé',
    descrizione: 'Un collaboratore può creare compiti assegnati a sé stesso (per ricordarsi un lavoro).',
  },
  {
    valore: 'tutti',
    titolo: 'Tutti per tutti',
    descrizione: 'Chiunque nello studio crea compiti e li assegna a chiunque, admin compresi.',
  },
]

export const etichettaVisibilita = (v: string) => OPZIONI_VISIBILITA.find((o) => o.valore === v)?.titolo ?? v
export const etichettaCreazione = (v: string) => OPZIONI_CREAZIONE.find((o) => o.valore === v)?.titolo ?? v

export const etichettaRuolo = (r: string) =>
  r === 'admin' ? 'Admin' : r === 'collaboratore' ? 'Collaboratore' : r === 'agente' ? 'Agente' : r

export const etichettaLivello = (l: string) =>
  l === 'completa' ? 'Può anche lavorarci' : l === 'lettura' ? 'Solo per vedere' : l

/** Stessa regola del database (crea_invito, clienti_email). */
export const EMAIL_VALIDA = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function emailValida(s: string): boolean {
  return EMAIL_VALIDA.test(s.trim())
}
