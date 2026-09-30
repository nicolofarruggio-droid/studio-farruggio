// Preferenze delle email di notifica (sezione 8), salvate in utenti.preferenze_notifiche.
// Una chiave assente vale "attiva": di default si ricevono tutte le email.

export const CHIAVI_PREFERENZE = ['assegnato', 'pronto', 'documenti', 'rimandato', 'commenti', 'scadenze'] as const
export type ChiavePreferenza = (typeof CHIAVI_PREFERENZE)[number]
export type Preferenze = Record<ChiavePreferenza, boolean>

export const TESTI_PREFERENZE: Record<ChiavePreferenza, { titolo: string; descrizione: string }> = {
  assegnato: { titolo: 'Nuovo compito', descrizione: 'Quando qualcuno ti assegna un compito.' },
  pronto: {
    titolo: 'Compito pronto per revisione',
    descrizione: 'Quando un compito che hai assegnato viene segnato pronto da controllare.',
  },
  documenti: {
    titolo: 'Documenti caricati',
    descrizione: 'Quando qualcun altro carica documenti in un compito tuo o che hai assegnato.',
  },
  rimandato: {
    titolo: 'Lavoro rimandato indietro',
    descrizione: 'Quando chi controlla rimanda indietro un tuo compito.',
  },
  commenti: {
    titolo: 'Nuovi commenti',
    descrizione: 'Quando qualcuno commenta un compito che hai creato o che ti è assegnato.',
  },
  scadenze: {
    titolo: 'Riepilogo delle scadenze',
    descrizione: 'Ogni mattina verso le 7: i compiti che scadono oggi e domani e quelli già scaduti.',
  },
}

export function preferenzeComplete(p: Record<string, unknown> | null | undefined): Preferenze {
  const r = {} as Preferenze
  for (const k of CHIAVI_PREFERENZE) r[k] = p?.[k] !== false
  return r
}

export function vuoleEmail(p: Record<string, unknown> | null | undefined, chiave: string): boolean {
  if (!(CHIAVI_PREFERENZE as readonly string[]).includes(chiave)) return false
  return p?.[chiave] !== false
}

/** Tipi di notifica dell'app che hanno anche un'email (le altre restano solo nella campanella). */
export const NOTIFICHE_CON_EMAIL = ['assegnato', 'pronto', 'documenti', 'rimandato'] as const
