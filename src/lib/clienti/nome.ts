// Nome di visualizzazione unico e stabile di un cliente (sezione 6): "Ragione sociale — Titolare".
// Serve per nominare i file e associare le comunicazioni nei moduli futuri: si genera alla
// creazione e poi non cambia da solo (l'admin può modificarlo dalla scheda del cliente).

const FORME = /[\s,]+(s\.?\s?r\.?\s?l\.?\s?s?\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?c\.?\s?a\.?\s?r\.?\s?l\.?|soc\.?\s+coop\.?)\s*$/i

export function pulisciSpazi(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Ragione sociale senza la forma societaria finale (S.r.l., S.p.A., …). */
export function ragioneBreve(ragioneSociale: string): string {
  const r = pulisciSpazi(ragioneSociale)
  const breve = r.replace(FORME, '').trim()
  return breve || r
}

export function nomeVisualizzazione(ragioneSociale: string, titolare?: { nome?: string | null; cognome?: string | null } | null): string {
  const base = ragioneBreve(ragioneSociale)
  const t = pulisciSpazi(`${titolare?.nome ?? ''} ${titolare?.cognome ?? ''}`)
  return t && !base.toLowerCase().includes(t.toLowerCase()) ? `${base} — ${t}` : base
}

/** Rende unico un nome rispetto a quelli già usati nello studio (confronto senza maiuscole): "Nome (2)". */
export function nomeUnico(nome: string, usati: Set<string>): string {
  let candidato = nome
  let n = 2
  while (usati.has(candidato.toLowerCase())) candidato = `${nome} (${n++})`
  usati.add(candidato.toLowerCase())
  return candidato
}
