// Lettura del JSON man mano che l'AI lo scrive: estrae gli oggetti completi dell'elenco
// {"righe":[{…},{…}]} per contare le righe già analizzate (barra di avanzamento) e controllarle subito.

export class EstrattoreOggetti {
  private profondita = 0
  private inStringa = false
  private escape = false
  private corrente = ''
  private completati = 0

  /** Righe complete viste finora. */
  get numero(): number {
    return this.completati
  }

  /** Aggiunge un pezzo di testo; restituisce il testo degli oggetti di riga completati in questo pezzo. */
  aggiungi(pezzo: string): string[] {
    const fatti: string[] = []
    for (const ch of pezzo) {
      const dentro = this.profondita >= 3 // oggetto radice (1) → elenco "righe" (2) → riga (3)
      if (this.inStringa) {
        if (dentro) this.corrente += ch
        if (this.escape) this.escape = false
        else if (ch === '\\') this.escape = true
        else if (ch === '"') this.inStringa = false
        continue
      }
      if (ch === '"') {
        this.inStringa = true
        if (dentro) this.corrente += ch
      } else if (ch === '{' || ch === '[') {
        this.profondita++
        if (this.profondita === 3) this.corrente = ''
        if (this.profondita >= 3) this.corrente += ch
      } else if (ch === '}' || ch === ']') {
        if (this.profondita >= 3) this.corrente += ch
        if (this.profondita === 3 && ch === '}') {
          fatti.push(this.corrente)
          this.completati++
          this.corrente = ''
        }
        this.profondita = Math.max(0, this.profondita - 1)
      } else if (dentro) this.corrente += ch
    }
    return fatti
  }
}
