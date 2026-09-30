// Permessi degli account agente (sezione 13.3). Modulo puro: lo usano API, pagina di gestione,
// specifica OpenAPI e test. L'elenco delle azioni è lo stesso di public.azioni_agente() nel database.

export const AZIONI_AGENTE = ['crea_compiti', 'aggiorna_compiti', 'aggiorna_indicatori', 'commenta', 'carica_documenti'] as const
export type AzioneAgente = (typeof AZIONI_AGENTE)[number]

/** Valore salvato in utenti.permessi_agente: assente = "no". */
export type LivelloPermesso = 'no' | 'si' | 'proposta'

export const DESCRIZIONI_AZIONI: Record<AzioneAgente, { etichetta: string; aiuto: string; infinito: string }> = {
  crea_compiti: {
    etichetta: 'Creare compiti',
    aiuto: 'Crea compiti e li assegna alle persone dello studio.',
    infinito: 'creare compiti',
  },
  aggiorna_compiti: {
    etichetta: 'Aggiornare i compiti',
    aiuto: 'Cambia lo stato dei compiti (per esempio "pronto per revisione") e modifica quelli che ha creato lui.',
    infinito: 'aggiornare i compiti',
  },
  aggiorna_indicatori: {
    etichetta: 'Aggiornare gli indicatori',
    aiuto: 'Imposta le date di aggiornamento di IVA e prima nota dei clienti.',
    infinito: 'aggiornare gli indicatori IVA e prima nota',
  },
  commenta: {
    etichetta: 'Commentare i compiti',
    aiuto: 'Scrive commenti nei compiti, per esempio promemoria sulle scadenze.',
    infinito: 'commentare i compiti',
  },
  carica_documenti: {
    etichetta: 'Caricare documenti',
    aiuto: 'Carica file nei compiti aperti di tutto lo studio, tramite l\'API. Per i file non c\'è la modalità proposta.',
    infinito: 'caricare documenti',
  },
}

export const ETICHETTE_LIVELLO: Record<LivelloPermesso, string> = {
  no: 'No',
  si: 'Sì',
  proposta: 'Solo proposta da approvare',
}

/** Azioni che un agente non può mai svolgere, anche se abilitato (sezione 13.3). */
export const AZIONI_VIETATE = [
  'eliminare definitivamente dati (clienti, compiti, documenti)',
  'cambiare ruoli e permessi, compresi i propri',
  'invitare, disattivare o riattivare utenti',
  'modificare le impostazioni dello studio',
  'esportare l\'intero archivio',
] as const

/** Azioni che un agente può mettere nella coda di proposte e permesso da cui dipendono. */
export const AZIONI_PROPOSTA = {
  crea_compito: 'crea_compiti',
  modifica_compito: 'aggiorna_compiti',
  cambia_stato_compito: 'aggiorna_compiti',
  aggiorna_indicatore: 'aggiorna_indicatori',
  commenta: 'commenta',
} as const satisfies Record<string, AzioneAgente>
export type AzioneProposta = keyof typeof AZIONI_PROPOSTA

export const ETICHETTE_PROPOSTA: Record<AzioneProposta, string> = {
  crea_compito: 'Creare un compito',
  modifica_compito: 'Modificare un compito',
  cambia_stato_compito: 'Cambiare lo stato di un compito',
  aggiorna_indicatore: 'Aggiornare un indicatore',
  commenta: 'Commentare un compito',
}

/** Livello di un permesso a partire dal JSON salvato nel database (tutto ciò che non è previsto vale "no"). */
export function livello(permessi: Record<string, unknown> | null | undefined, azione: AzioneAgente): LivelloPermesso {
  const v = permessi?.[azione]
  return v === 'si' || v === 'proposta' ? v : 'no'
}

/** Tutti i permessi con il loro livello, per l'API e per la pagina di gestione. */
export function tuttiIPermessi(permessi: Record<string, unknown> | null | undefined): Record<AzioneAgente, LivelloPermesso> {
  return Object.fromEntries(AZIONI_AGENTE.map((a) => [a, livello(permessi, a)])) as Record<AzioneAgente, LivelloPermesso>
}
