// Dimensioni dei blocchi dell'importazione (sezione 6): 60 righe per richiesta all'AI, due richieste
// alla volta; alla conferma, un blocco di ~100 clienti per transazione.
export const RIGHE_PER_BLOCCO = 60
export const BLOCCHI_IN_PARALLELO = 2
export const RIGHE_PER_CONFERMA = 100
/** Colonne lette da un foglio (le successive si ignorano). */
export const COLONNE_MASSIME = 60
