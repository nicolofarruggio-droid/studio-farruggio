// Tipi condivisi tra server e browser per il caricamento dei documenti.

/** Dove il browser manda un file: URL firmato di Supabase Storage oppure link locale firmato. */
export type Destinazione =
  | { driver: 'supabase'; bucket: string; percorso: string; token: string; tipo: string }
  | { driver: 'locale'; percorso: string; url: string }

/** Un file pronto per il caricamento, restituito da preparaCaricamento. */
export type FilePreparato = {
  /** posizione nell'elenco inviato dal browser */
  indice: number
  file_id: string
  nome: string
  tipo: string
  destinazione: Destinazione
}

/** Un file caricato da registrare nel compito (confermaCaricamento). */
export type FileCaricato = { file_id: string; nome: string; tipo: string }
