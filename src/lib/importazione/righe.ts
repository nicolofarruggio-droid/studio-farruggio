// Righe dell'anteprima di importazione: costruzione dalle colonne, doppioni, clienti già presenti,
// abbinamento dei collaboratori e segnalazioni per riga (sezione 6). Funzioni pure.
import { ragioneBreve } from '@/lib/clienti/nome'
import type { Mappatura } from './intestazioni'
import {
  chiavePartitaIva, chiaveTesto, dividiTitolari, estraiEmail, normalizzaCodiceFiscale, normalizzaData, normalizzaImporto,
  normalizzaIntero, normalizzaPartitaIva, normalizzaTelefono, pulisci, unisciEmail, type EmailImport, type Titolare,
} from './normalizza'

/** Una riga del file, come arriva dal browser: numero di riga nel foglio e celle in testo. */
export type RigaFile = { numero: number; celle: string[] }

/** Un cliente riconosciuto, modificabile nell'anteprima. */
export type RigaImport = {
  riga: number
  nome_azienda: string
  titolari: Titolare[]
  email: EmailImport[]
  /** Pezzi del file che sembrano email ma non sono validi: errore finché non si correggono. */
  email_non_valide: string[]
  prima_nota: string | null
  iva: string | null
  numero_dipendenti: number | null
  fatturato: number | null
  /** Collaboratore come scritto nel file; l'abbinamento a un utente è in collaboratore_id. */
  collaboratore_testo: string | null
  collaboratore_id: string | null
  partita_iva: string | null
  codice_fiscale: string | null
  telefono: string | null
  /** Dati proposti dall'AI e scartati dal controllo del server (non presenti nel file o malformati). */
  scartati: string[]
}

export function rigaVuota(riga: number): RigaImport {
  return {
    riga, nome_azienda: '', titolari: [], email: [], email_non_valide: [], prima_nota: null, iva: null,
    numero_dipendenti: null, fatturato: null, collaboratore_testo: null, collaboratore_id: null,
    partita_iva: null, codice_fiscale: null, telefono: null, scartati: [],
  }
}

/** Una riga senza nessun dato utile (riga vuota, di titolo o di totale): non entra nell'anteprima. */
export function rigaSenzaDati(r: RigaImport): boolean {
  return !r.nome_azienda && !r.titolari.length && !r.email.length && !r.email_non_valide.length && !r.partita_iva && !r.codice_fiscale
}

const TOTALE = /^(totale|totali|tot\.?|subtotale|somma)\b/i

/** Cliente da una riga del file secondo la mappatura delle colonne (senza AI). Null per righe senza dati. */
export function rigaDaMappatura(r: RigaFile, mappatura: Mappatura): RigaImport | null {
  const out = rigaVuota(r.numero)
  const valori = (campo: string) => mappatura.flatMap((c, i) => (c === campo && pulisci(r.celle[i]) ? [pulisci(r.celle[i])] : []))
  const primo = (campo: string) => valori(campo)[0] ?? null

  out.nome_azienda = valori('nome_azienda').join(' ')
  if (TOTALE.test(out.nome_azienda)) return null
  const titolari: Titolare[] = [
    ...valori('titolari').flatMap((v) => dividiTitolari(v)),
    ...valori('titolari_cognome_nome').flatMap((v) => dividiTitolari(v, 'cognome_nome')),
  ]
  const nome = primo('nome_titolare')
  const cognome = primo('cognome_titolare')
  if (nome || cognome) titolari.unshift(...dividiTitolari(`${nome ?? ''} ${cognome ?? ''}`))
  out.titolari = dedupTitolari(titolari)

  const email = mappatura.flatMap((c, i) => (c === 'email' || c === 'pec' ? [estraiEmail(r.celle[i], c === 'pec')] : []))
  out.email = unisciEmail(...email.map((e) => e.valide))
  out.email_non_valide = [...new Set(email.flatMap((e) => e.nonValide))]
  out.prima_nota = normalizzaData(primo('prima_nota'))
  out.iva = normalizzaData(primo('iva'))
  out.numero_dipendenti = normalizzaIntero(primo('numero_dipendenti'))
  out.fatturato = normalizzaImporto(primo('fatturato'))
  out.collaboratore_testo = primo('collaboratore')
  out.partita_iva = normalizzaPartitaIva(primo('partita_iva'))
  out.codice_fiscale = normalizzaCodiceFiscale(primo('codice_fiscale'))
  out.telefono = normalizzaTelefono(valori('telefono').join(' / ') || null)
  return rigaSenzaDati(out) ? null : out
}

export function dedupTitolari(t: Titolare[]): Titolare[] {
  const visti = new Set<string>()
  return t.filter((x) => {
    const k = chiaveTesto(`${x.nome} ${x.cognome}`)
    if (!k || visti.has(k)) return false
    visti.add(k)
    return true
  })
}

// ---------------------------------------------------------------------------
// Collaboratori
// ---------------------------------------------------------------------------

export type Persona = { id: string; nome: string; cognome: string }

/**
 * Abbina il collaboratore scritto nel file a un utente dello studio: "Giulia Verdi", "Verdi Giulia",
 * "VERDI", "G. Verdi", "giulia.verdi@…". Insensibile a maiuscole e accenti. Null se non trovato o ambiguo.
 */
export function abbinaCollaboratore(testo: string | null | undefined, persone: Persona[]): string | null {
  let t = (testo ?? '').trim()
  if (!t) return null
  if (t.includes('@')) t = t.slice(0, t.indexOf('@'))
  const k = chiaveTesto(t)
  if (!k) return null
  const parole = k.split(' ')
  const unico = (lista: Persona[]) => (lista.length === 1 ? lista[0].id : null)
  const chiavi = persone.map((p) => ({ p, nome: chiaveTesto(p.nome), cognome: chiaveTesto(p.cognome) }))
  // nome e cognome in qualsiasi ordine
  const completo = chiavi.filter((c) => k === `${c.nome} ${c.cognome}` || k === `${c.cognome} ${c.nome}`)
  if (completo.length) return unico(completo.map((c) => c.p))
  const stesseParole = chiavi.filter((c) => {
    const tutte = `${c.nome} ${c.cognome}`.split(' ')
    return tutte.length === parole.length && tutte.every((w) => parole.includes(w))
  })
  if (stesseParole.length) return unico(stesseParole.map((c) => c.p))
  // solo cognome
  const cognome = chiavi.filter((c) => k === c.cognome)
  if (cognome.length) return unico(cognome.map((c) => c.p))
  // iniziale del nome e cognome: "G. Verdi", "Verdi G."
  if (parole.length === 2) {
    const [a, b] = parole
    const iniziale = chiavi.filter(
      (c) => (a.length === 1 && b === c.cognome && c.nome.startsWith(a)) || (b.length === 1 && a === c.cognome && c.nome.startsWith(b)),
    )
    if (iniziale.length) return unico(iniziale.map((c) => c.p))
  }
  // solo nome, se nello studio è unico
  return unico(chiavi.filter((c) => k === c.nome).map((c) => c.p))
}

// ---------------------------------------------------------------------------
// Doppioni e clienti già presenti
// ---------------------------------------------------------------------------

/** Chiave della ragione sociale: senza forma societaria, maiuscole, accenti e punteggiatura. */
export function chiaveRagione(ragioneSociale: string | null | undefined): string {
  const r = pulisci(ragioneSociale)
  return r ? chiaveTesto(ragioneBreve(r)) : ''
}

/** Doppioni nel file (stessa ragione sociale o stessa partita IVA): per ogni riga, le altre righe uguali. */
export function trovaDoppioni(righe: Pick<RigaImport, 'riga' | 'nome_azienda' | 'partita_iva'>[]): Map<number, number[]> {
  const gruppi = new Map<string, number[]>()
  for (const r of righe) {
    const chiavi = [chiaveRagione(r.nome_azienda) && `rs:${chiaveRagione(r.nome_azienda)}`, chiavePartitaIva(r.partita_iva) && `iva:${chiavePartitaIva(r.partita_iva)}`]
    for (const k of chiavi) if (k) gruppi.set(k, [...(gruppi.get(k) ?? []), r.riga])
  }
  const out = new Map<number, number[]>()
  for (const numeri of gruppi.values()) {
    if (numeri.length < 2) continue
    for (const n of numeri) out.set(n, [...new Set([...(out.get(n) ?? []), ...numeri.filter((x) => x !== n)])].sort((a, b) => a - b))
  }
  return out
}

export type ClienteEsistente = { id: string; ragione_sociale: string; nome_visualizzazione: string; partita_iva: string | null }

export type IndiceEsistenti = { ragione: Map<string, ClienteEsistente>; partitaIva: Map<string, ClienteEsistente> }

export function indiceEsistenti(clienti: ClienteEsistente[]): IndiceEsistenti {
  const ragione = new Map<string, ClienteEsistente>()
  const partitaIva = new Map<string, ClienteEsistente>()
  for (const c of clienti) {
    const k = chiaveRagione(c.ragione_sociale)
    if (k && !ragione.has(k)) ragione.set(k, c)
    const p = chiavePartitaIva(c.partita_iva)
    if (p && !partitaIva.has(p)) partitaIva.set(p, c)
  }
  return { ragione, partitaIva }
}

/** Cliente già presente nello studio con la stessa ragione sociale o partita IVA. */
export function giaPresente(r: Pick<RigaImport, 'nome_azienda' | 'partita_iva'>, indice: IndiceEsistenti): ClienteEsistente | null {
  const p = chiavePartitaIva(r.partita_iva)
  if (p && indice.partitaIva.has(p)) return indice.partitaIva.get(p)!
  const k = chiaveRagione(r.nome_azienda)
  return (k && indice.ragione.get(k)) || null
}

// ---------------------------------------------------------------------------
// Segnalazioni
// ---------------------------------------------------------------------------

export type Segnalazione = { livello: 'errore' | 'avviso'; testo: string }

export const CAMPI_DA_COMPLETARE = {
  prima_nota: 'prima nota',
  iva: 'IVA',
  numero_dipendenti: 'dipendenti',
  fatturato: 'fatturato',
  collaboratore_id: 'collaboratore',
} as const

export type EsameRiga = { segnalazioni: Segnalazione[]; daCompletare: string[]; errori: number; avvisi: number }

/** Controlli di una riga dell'anteprima. Le righe con errori non si importano. */
export function esaminaRiga(
  r: RigaImport,
  contesto: { doppioni?: Map<number, number[]>; esistenti?: IndiceEsistenti; collaboratoreNonTrovato?: boolean } = {},
): EsameRiga {
  const s: Segnalazione[] = []
  const ragione = pulisci(r.nome_azienda)
  if (!ragione) s.push({ livello: 'errore', testo: 'Ragione sociale mancante' })
  else if (ragione.length > 300) s.push({ livello: 'errore', testo: 'Ragione sociale troppo lunga (massimo 300 caratteri)' })
  for (const e of r.email_non_valide) s.push({ livello: 'errore', testo: `Email non valida: ${e}` })
  const doppi = contesto.doppioni?.get(r.riga)
  if (doppi?.length) s.push({ livello: 'avviso', testo: `Doppione nel file: ${doppi.length === 1 ? 'riga' : 'righe'} ${doppi.join(', ')}` })
  const esistente = contesto.esistenti ? giaPresente(r, contesto.esistenti) : null
  if (esistente) s.push({ livello: 'avviso', testo: `Già presente nello studio: ${esistente.nome_visualizzazione}` })
  if (!r.titolari.length) s.push({ livello: 'avviso', testo: 'Titolare mancante' })
  if (!r.email.length && !r.email_non_valide.length) s.push({ livello: 'avviso', testo: 'Email mancante' })
  if (contesto.collaboratoreNonTrovato && r.collaboratore_testo && !r.collaboratore_id)
    s.push({ livello: 'avviso', testo: `Collaboratore "${r.collaboratore_testo}" non trovato tra gli utenti dello studio` })
  if (r.scartati.length) s.push({ livello: 'avviso', testo: `Dati dell'AI scartati perché non presenti nel file: ${r.scartati.join(', ')}` })
  const daCompletare = (Object.keys(CAMPI_DA_COMPLETARE) as (keyof typeof CAMPI_DA_COMPLETARE)[])
    .filter((k) => r[k] == null)
    .map((k) => CAMPI_DA_COMPLETARE[k])
  return {
    segnalazioni: s,
    daCompletare,
    errori: s.filter((x) => x.livello === 'errore').length,
    avvisi: s.filter((x) => x.livello === 'avviso').length,
  }
}
