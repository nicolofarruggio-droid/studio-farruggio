// Importazione dei collaboratori da un file Excel, CSV o ODS (area Studio).
// Solo logica pura: la lettura del file avviene nel browser, la creazione degli inviti sul server.
import { EMAIL_VALIDA } from './testi'

export type Ruolo = 'admin' | 'collaboratore'

export type Colonne = {
  email?: number
  nome?: number
  cognome?: number
  /** una colonna con nome e cognome insieme */
  nomeCompleto?: number
  /** la colonna unica è "Cognome e nome": prima il cognome */
  cognomePrima?: boolean
  ruolo?: number
}

export type RigaImport = {
  /** chiave stabile per l'interfaccia */
  chiave: string
  /** numero della riga nel file (1 = prima riga del foglio) */
  riga: number
  nome: string
  cognome: string
  email: string
  ruolo: Ruolo
  /** il valore della colonna ruolo non era riconoscibile: si usa "collaboratore" */
  ruoloDubbio?: boolean
}

export type Problema = 'email_mancante' | 'email_non_valida' | 'nome_mancante' | 'doppione' | 'gia_presente' | 'gia_invitato'

export const TESTI_PROBLEMI: Record<Problema, string> = {
  email_mancante: 'Manca l\'indirizzo email',
  email_non_valida: 'Indirizzo email non valido',
  nome_mancante: 'Manca il nome',
  doppione: 'Indirizzo già presente in una riga precedente del file',
  gia_presente: 'Questa persona è già nello studio',
  gia_invitato: 'C\'è già un invito in attesa per questo indirizzo',
}

/** Minuscole, senza accenti né punteggiatura: "E-mail " → "e mail". */
export function normalizza(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const NOMI_EMAIL = ['email', 'e mail', 'mail', 'indirizzo email', 'indirizzo e mail', 'posta elettronica', 'email aziendale', 'e mail aziendale', 'email lavoro', 'indirizzo mail']
const NOMI_NOME = ['nome', 'first name', 'firstname', 'nome proprio', 'given name']
const NOMI_COGNOME = ['cognome', 'last name', 'lastname', 'surname', 'family name']
const NOMI_COMPLETO = ['nome e cognome', 'nome cognome', 'nominativo', 'nome completo', 'collaboratore', 'persona', 'dipendente', 'full name', 'name', 'utente']
const NOMI_COGNOME_NOME = ['cognome e nome', 'cognome nome']
const NOMI_RUOLO = ['ruolo', 'profilo', 'tipo utente', 'tipo', 'qualifica', 'permessi', 'role']

/** Riconosce le colonne dai nomi dell'intestazione (senza distinguere maiuscole, accenti, trattini). */
export function riconosciColonne(intestazione: unknown[]): Colonne {
  const c: Colonne = {}
  intestazione.forEach((cella, i) => {
    const n = normalizza(cella)
    if (!n) return
    if (c.email === undefined && (NOMI_EMAIL.includes(n) || /^e ?mail\b/.test(n))) c.email = i
    else if (c.nomeCompleto === undefined && NOMI_COGNOME_NOME.includes(n)) {
      c.nomeCompleto = i
      c.cognomePrima = true
    } else if (c.nomeCompleto === undefined && NOMI_COMPLETO.includes(n)) c.nomeCompleto = i
    else if (c.nome === undefined && NOMI_NOME.includes(n)) c.nome = i
    else if (c.cognome === undefined && NOMI_COGNOME.includes(n)) c.cognome = i
    else if (c.ruolo === undefined && NOMI_RUOLO.includes(n)) c.ruolo = i
  })
  // con nome e cognome separati la colonna "completa" non serve
  if (c.nome !== undefined && c.cognome !== undefined) {
    delete c.nomeCompleto
    delete c.cognomePrima
  }
  // solo "Nome", senza cognome: spesso contiene nome e cognome insieme
  if (c.nome !== undefined && c.cognome === undefined && c.nomeCompleto === undefined) {
    c.nomeCompleto = c.nome
    delete c.nome
  }
  return c
}

const PARTICELLE = new Set(['de', 'di', 'da', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'dal', 'dalla', 'la', 'lo', 'li', 'van', 'von', 'mc', 'mac', 'san', 'santo', 'd', 'dall', 'dell'])

/**
 * "Mario Rossi" → Mario / Rossi; "Maria Grazia De Luca" → Maria Grazia / De Luca;
 * "Rossi, Mario" → Mario / Rossi; con cognomePrima "Rossi Mario" → Mario / Rossi.
 */
export function dividiNomeCompleto(testo: string, cognomePrima = false): { nome: string; cognome: string } {
  const pulito = testo.replace(/\s+/g, ' ').trim()
  if (!pulito) return { nome: '', cognome: '' }
  if (pulito.includes(',')) {
    const [prima, ...resto] = pulito.split(',')
    return { cognome: prima.trim(), nome: resto.join(' ').trim() }
  }
  const parti = pulito.split(' ')
  if (parti.length === 1) return { nome: parti[0], cognome: '' }
  const particella = (p: string) => PARTICELLE.has(normalizza(p).replace(/ /g, ''))
  if (cognomePrima) {
    // il cognome è la prima parola, più la successiva se la prima è una particella ("De Luca Anna")
    const n = particella(parti[0]) && parti.length > 2 ? 2 : 1
    return { cognome: parti.slice(0, n).join(' '), nome: parti.slice(n).join(' ') }
  }
  // il cognome è l'ultima parola, con le particelle che la precedono ("Anna De Luca", "Luca Dalla Chiesa")
  let inizio = parti.length - 1
  while (inizio > 1 && particella(parti[inizio - 1])) inizio--
  return { nome: parti.slice(0, inizio).join(' '), cognome: parti.slice(inizio).join(' ') }
}

/** Ruolo da un testo libero: "Amministratore", "admin", "titolare" → admin; vuoto o "collaboratore" → collaboratore. */
export function interpretaRuolo(v: unknown): { ruolo: Ruolo; dubbio: boolean } {
  const n = normalizza(v)
  if (!n) return { ruolo: 'collaboratore', dubbio: false }
  if (/^(admin|amministrat(ore|ori|rice|rici)|amministrazione|titolare|soci[oa]|responsabile)\b/.test(n)) return { ruolo: 'admin', dubbio: false }
  if (/^(collaborat(ore|ori|rice|rici)|collab|dipendente|impiegat[oaie]|praticante|operat(ore|rice)|utente|staff)\b/.test(n))
    return { ruolo: 'collaboratore', dubbio: false }
  return { ruolo: 'collaboratore', dubbio: true }
}

const testo = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * Trova l'intestazione nelle prime righe del foglio (la prima con una colonna email o nome)
 * e restituisce le persone. Se nessuna intestazione è riconoscibile ma una colonna contiene
 * indirizzi email, la usa come colonna email e la precedente come "nome e cognome".
 */
export function leggiRighe(foglio: unknown[][]): { righe: RigaImport[]; colonne: Colonne; intestazione: number | null } {
  let intestazione: number | null = null
  let colonne: Colonne = {}
  for (let i = 0; i < Math.min(foglio.length, 15); i++) {
    const c = riconosciColonne(foglio[i] ?? [])
    if (c.email !== undefined && (c.nome !== undefined || c.nomeCompleto !== undefined || c.cognome !== undefined)) {
      intestazione = i
      colonne = c
      break
    }
    if (intestazione === null && c.email !== undefined) {
      intestazione = i
      colonne = c
    }
  }
  if (intestazione === null) {
    // nessuna intestazione: cerco una colonna piena di indirizzi email
    const larghezza = Math.max(0, ...foglio.map((r) => r?.length ?? 0))
    for (let j = 0; j < larghezza; j++) {
      const piene = foglio.filter((r) => testo(r?.[j]))
      const email = piene.filter((r) => EMAIL_VALIDA.test(testo(r[j])))
      if (piene.length > 0 && email.length / piene.length >= 0.6) {
        colonne = { email: j, ...(j > 0 ? { nomeCompleto: j - 1 } : {}) }
        break
      }
    }
    if (colonne.email === undefined) return { righe: [], colonne, intestazione: null }
  }

  const righe: RigaImport[] = []
  const primaDati = intestazione === null ? 0 : intestazione + 1
  for (let i = primaDati; i < foglio.length; i++) {
    const r = foglio[i] ?? []
    if (!r.some((v) => testo(v))) continue
    let nome = colonne.nome !== undefined ? testo(r[colonne.nome]) : ''
    let cognome = colonne.cognome !== undefined ? testo(r[colonne.cognome]) : ''
    if (colonne.nomeCompleto !== undefined && (!nome || !cognome)) {
      const diviso = dividiNomeCompleto(testo(r[colonne.nomeCompleto]), colonne.cognomePrima)
      nome ||= diviso.nome
      cognome ||= diviso.cognome
    }
    const email = colonne.email !== undefined ? testo(r[colonne.email]).toLowerCase().replace(/^mailto:/, '') : ''
    const { ruolo, dubbio } = interpretaRuolo(colonne.ruolo !== undefined ? r[colonne.ruolo] : '')
    righe.push({ chiave: `r${i + 1}`, riga: i + 1, nome, cognome, email, ruolo, ...(dubbio ? { ruoloDubbio: true } : {}) })
  }
  return { righe, colonne, intestazione }
}

/**
 * Problemi di ogni riga: email mancante o non valida, nome mancante, doppioni nel file,
 * persone già nello studio o già invitate. Le righe con problemi non si importano.
 */
export function controllaRighe(
  righe: Pick<RigaImport, 'chiave' | 'nome' | 'email'>[],
  esistenti: { emailStudio: Iterable<string>; emailInvitate: Iterable<string> },
): Map<string, Problema[]> {
  const studio = new Set([...esistenti.emailStudio].map((e) => e.toLowerCase()))
  const invitate = new Set([...esistenti.emailInvitate].map((e) => e.toLowerCase()))
  // il primo indirizzo ripetuto va bene, le ripetizioni successive sono doppioni
  const visti = new Set<string>()
  const esito = new Map<string, Problema[]>()
  for (const r of righe) {
    const p: Problema[] = []
    const e = r.email.trim().toLowerCase()
    if (!e) p.push('email_mancante')
    else if (!EMAIL_VALIDA.test(e)) p.push('email_non_valida')
    if (!r.nome.trim()) p.push('nome_mancante')
    if (e && visti.has(e)) p.push('doppione')
    if (e) visti.add(e)
    if (e && studio.has(e)) p.push('gia_presente')
    else if (e && invitate.has(e)) p.push('gia_invitato')
    esito.set(r.chiave, p)
  }
  return esito
}

export const MASSIMO_RIGHE = 200
