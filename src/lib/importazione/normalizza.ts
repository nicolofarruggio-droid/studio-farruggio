// Normalizzazione dei valori letti dai file dei clienti (sezione 6, "Importazione").
// Funzioni pure, usate sia nel browser (anteprima, riconoscimento dalle colonne) sia sul server
// (controllo del risultato dell'AI e conferma). Regola generale: se un valore non si riconosce
// con sicurezza il risultato è null, mai un valore inventato.
import { fineMeseISO, isoValida } from '@/lib/date'

export function senzaAccenti(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Testo per i confronti: minuscolo, senza accenti, solo lettere e cifre separate da uno spazio. */
export function chiaveTesto(s: string | null | undefined): string {
  return senzaAccenti(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function pulisci(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s  ]+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

const MESI: Record<string, number> = {
  gen: 1, gennaio: 1, jan: 1, january: 1,
  feb: 2, febbraio: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  apr: 4, aprile: 4, april: 4,
  mag: 5, maggio: 5, may: 5,
  giu: 6, giugno: 6, jun: 6, june: 6,
  lug: 7, luglio: 7, jul: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  set: 9, sett: 9, settembre: 9, sep: 9, sept: 9, september: 9,
  ott: 10, ottobre: 10, oct: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dic: 12, dicembre: 12, dec: 12, december: 12,
}

const ANNO_MIN = 1950
const ANNO_MAX = 2100

function anno4(a: string): number {
  const n = Number(a)
  if (a.length === 4) return n
  return n <= 69 ? 2000 + n : 1900 + n
}

function data(anno: number, mese: number, giorno: number): string | null {
  if (anno < ANNO_MIN || anno > ANNO_MAX) return null
  const iso = `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
  return isoValida(iso) ? iso : null
}

function fineMese(anno: number, mese: number): string | null {
  if (anno < ANNO_MIN || anno > ANNO_MAX || mese < 1 || mese > 12) return null
  return fineMeseISO(anno, mese)
}

/** Data da un numero di serie di Excel (giorni dal 30/12/1899). */
export function dataDaSerialeExcel(n: number): string | null {
  if (!Number.isFinite(n) || n < 1) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
  return data(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Data di Excel (oggetto Date letto con cellDates, interpretato in UTC) in "AAAA-MM-GG". */
export function dataDaExcel(d: Date, soloMese = false): string | null {
  if (Number.isNaN(d.getTime())) return null
  // arrotonda al secondo: le date di Excel hanno a volte qualche millisecondo di errore
  const t = new Date(Math.round(d.getTime() / 1000) * 1000)
  const a = t.getUTCFullYear()
  const m = t.getUTCMonth() + 1
  if (soloMese) {
    const f = fineMese(a, m)
    return f ? f.slice(0, 7) : null
  }
  return data(a, m, t.getUTCDate())
}

/**
 * Data di aggiornamento in "AAAA-MM-GG" da un testo all'italiana (giorno/mese/anno).
 * Solo mese e anno ("ago 2026", "08/2026", "2026-08") → ultimo giorno del mese.
 * Solo l'anno, o testo non riconosciuto → null.
 */
export function normalizzaData(valore: string | number | Date | null | undefined): string | null {
  if (valore == null) return null
  if (valore instanceof Date) return dataDaExcel(valore)
  if (typeof valore === 'number') return valore > 20000 && valore < 80000 ? dataDaSerialeExcel(valore) : null
  const t = senzaAccenti(valore).toLowerCase().replace(/[  ]/g, ' ').trim()
  if (!t) return null
  let m: RegExpMatchArray | null
  // AAAA-MM-GG (anche con ora: "2026-08-31T00:00:00")
  if ((m = t.match(/(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/))) return data(Number(m[1]), Number(m[2]), Number(m[3]))
  // AAAA-MM o AAAA/MM (solo mese)
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})$/))) return fineMese(Number(m[1]), Number(m[2]))
  // GG/MM/AAAA, GG-MM-AA, GG.MM.AAAA (sempre all'italiana: prima il giorno)
  if ((m = t.match(/(?:^|\D)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/))) return data(anno4(m[3]), Number(m[2]), Number(m[1]))
  // MM/AAAA (solo mese)
  if ((m = t.match(/(?:^|\D)(\d{1,2})[/.-](\d{4})(?!\d)/))) return fineMese(Number(m[2]), Number(m[1]))
  // "31 agosto 2026", "31 ago. 26"
  if ((m = t.match(/(?:^|\D)(\d{1,2})\s*([a-z]{3,9})\.?\s*'?(\d{4}|\d{2})(?!\d)/)) && MESI[m[2]])
    return data(anno4(m[3]), MESI[m[2]], Number(m[1]))
  // "agosto 2026", "ago 2026", "ago-26", "ago. '26"
  if ((m = t.match(/(?:^|[^a-z])([a-z]{3,9})\.?[\s/-]*'?(\d{4}|\d{2})(?!\d)/)) && MESI[m[1]]) return fineMese(anno4(m[2]), MESI[m[1]])
  // numero di serie di Excel scritto come testo
  if ((m = t.match(/^(\d{5})(?:[.,]\d+)?$/))) {
    const n = Number(m[1])
    return n > 20000 && n < 80000 ? dataDaSerialeExcel(n) : null
  }
  return null
}

// ---------------------------------------------------------------------------
// Numeri
// ---------------------------------------------------------------------------

/** Numero da un testo con separatori all'italiana ("1.250.000,00") o inglesi ("1,250,000.00"). */
function numeroDaTesto(s: string): number | null {
  const m = s.match(/-?\d[\d.,]*/)
  if (!m) return null
  let n = m[0].replace(/[.,]+$/, '')
  const negativo = n.startsWith('-')
  if (negativo) n = n.slice(1)
  const punti = (n.match(/\./g) ?? []).length
  const virgole = (n.match(/,/g) ?? []).length
  let testo: string
  if (punti && virgole) {
    // il separatore che compare per ultimo è quello dei decimali
    testo = n.lastIndexOf(',') > n.lastIndexOf('.') ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '')
  } else if (virgole) {
    // all'italiana una sola virgola separa i decimali ("1,5", "1250,00"); più virgole sono migliaia ("1,250,000")
    testo = virgole > 1 ? n.replace(/,/g, '') : n.replace(',', '.')
  } else if (punti) {
    // all'italiana il punto separa le migliaia: "1.250" = 1250, "1.250.000" = 1250000;
    // con una cifra decimale o più di tre ("1250.5", "1.25") è un decimale
    testo = punti > 1 || /^\d{1,3}\.\d{3}$/.test(n) ? n.replace(/\./g, '') : n
  } else testo = n
  if (!/^\d+(\.\d+)?$/.test(testo)) return null
  const v = Number(testo)
  return Number.isFinite(v) ? (negativo ? -v : v) : null
}

/**
 * Importo in euro: "1.250.000 €", "1.250.000,00", "€ 1250000", "1,5 mln", 1250000.
 * Negativo o non riconosciuto → null.
 */
export function normalizzaImporto(valore: string | number | null | undefined): number | null {
  if (valore == null) return null
  if (typeof valore === 'number') return Number.isFinite(valore) && valore >= 0 ? Math.round(valore * 100) / 100 : null
  const t = senzaAccenti(valore).toLowerCase().replace(/[\s  ']+/g, ' ').trim()
  if (!t || !/\d/.test(t)) return null
  let molt = 1
  if (/\d\s*(mln|milioni|milione|mil\.|m)\b/.test(t)) molt = 1_000_000
  else if (/\d\s*(k|mila)\b/.test(t)) molt = 1_000
  // migliaia separate da spazi ("1 250 000")
  const compatto = t.replace(/(\d) (?=\d{3}\b)/g, '$1')
  const n = numeroDaTesto(compatto)
  if (n == null || n < 0) return null
  const v = Math.round(n * molt * 100) / 100
  return v <= 1e13 ? v : null
}

/** Numero intero (dipendenti): "12", "12 dipendenti", "12,0". Intervalli ("10-15") o decimali → null. */
export function normalizzaIntero(valore: string | number | null | undefined): number | null {
  if (valore == null) return null
  if (typeof valore === 'string') {
    const t = chiaveTesto(valore)
    if (/^(nessuno|nessun dipendente|zero)$/.test(t)) return 0
    if (/\d\s*[-–/]\s*\d/.test(valore)) return null
  }
  const n = normalizzaImporto(valore)
  if (n == null || !Number.isInteger(n) || n > 1_000_000) return null
  return n
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export type TipoEmail = 'ordinaria' | 'pec'
export type EmailImport = { indirizzo: string; tipo: TipoEmail }

const EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/

export function emailValida(s: string): boolean {
  if (s.length > 254 || !EMAIL.test(s)) return false
  const locale = s.slice(0, s.indexOf('@'))
  return !locale.startsWith('.') && !locale.endsWith('.') && !s.includes('..')
}

/** PEC: l'indirizzo contiene "pec" o è di un gestore di posta certificata. */
export function ePec(indirizzo: string): boolean {
  const dominio = indirizzo.slice(indirizzo.indexOf('@') + 1)
  return /pec/.test(indirizzo) || /(^|\.)(legalmail|postacert|postecert|sicurezzapostale|cert|certmail|mypec|gigapec|arubapec)\./.test(dominio)
}

/**
 * Tutti gli indirizzi di una cella, separati da ; , spazi, a capo, / o |.
 * Restituisce gli indirizzi validi (minuscoli, senza doppioni) e i pezzi che sembrano email ma non lo sono.
 */
export function estraiEmail(testo: string | null | undefined, pec = false): { valide: EmailImport[]; nonValide: string[] } {
  const valide: EmailImport[] = []
  const nonValide: string[] = []
  const visti = new Set<string>()
  for (const pezzo of (testo ?? '').split(/[\s;,|/ ]+/)) {
    const p = pezzo.replace(/^mailto:/i, '').replace(/^[<("'[]+|[>)"'\].:]+$/g, '').trim()
    if (!p.includes('@')) continue
    const indirizzo = p.toLowerCase()
    if (!emailValida(indirizzo)) {
      if (!nonValide.includes(p)) nonValide.push(p)
      continue
    }
    if (visti.has(indirizzo)) continue
    visti.add(indirizzo)
    valide.push({ indirizzo, tipo: pec || ePec(indirizzo) ? 'pec' : 'ordinaria' })
  }
  return { valide, nonValide }
}

/** Unisce elenchi di email togliendo i doppioni (vince la prima; "pec" se uno dei due lo indica). */
export function unisciEmail(...elenchi: EmailImport[][]): EmailImport[] {
  const mappa = new Map<string, EmailImport>()
  for (const e of elenchi.flat()) {
    const prima = mappa.get(e.indirizzo)
    if (!prima) mappa.set(e.indirizzo, { ...e })
    else if (e.tipo === 'pec') prima.tipo = 'pec'
  }
  return [...mappa.values()]
}

// ---------------------------------------------------------------------------
// Titolari
// ---------------------------------------------------------------------------

export type Titolare = { nome: string; cognome: string }

const PARTICELLE = new Set(['de', 'di', 'da', 'del', 'della', 'dei', 'degli', 'dal', 'dalla', 'dalle', 'dello', 'la', 'lo', 'li', 'le', 'van', 'von', 'mc', 'san', 'santa', 'st'])
const TITOLI = /^(sig|sigg|sig\.ra|sigra|dott|dott\.ssa|dottssa|dr|rag|geom|ing|avv|arch|prof|p\.i|per\.ind)\.?$/i

/** "MARIO ROSSI" o "mario rossi" → "Mario Rossi"; lascia com'è un testo già scritto con maiuscole e minuscole. */
export function maiuscoleNome(s: string): string {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s
  return s.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase())
}

function dividiPersona(parole: string[], ordine: 'nome_cognome' | 'cognome_nome'): Titolare {
  if (parole.length === 1) return { nome: '', cognome: parole[0] }
  if (ordine === 'cognome_nome') {
    // "De Luca Anna": la particella iniziale fa parte del cognome
    let n = 1
    while (n < parole.length - 1 && PARTICELLE.has(parole[n - 1].toLowerCase().replace(/[’']$/, ''))) n++
    return { cognome: parole.slice(0, n).join(' '), nome: parole.slice(n).join(' ') }
  }
  // "Maria Grazia De Luca": il cognome è l'ultima parola, con le particelle che la precedono
  let i = parole.length - 1
  while (i > 1 && PARTICELLE.has(parole[i - 1].toLowerCase().replace(/[’']$/, ''))) i--
  return { nome: parole.slice(0, i).join(' '), cognome: parole.slice(i).join(' ') }
}

/**
 * Titolari da una cella: "Mario e Luca Rossi" → Mario Rossi e Luca Rossi;
 * "Mario Rossi, Anna Bianchi" → due persone. Con ordine "cognome_nome": "Rossi Mario e Luca".
 */
export function dividiTitolari(testo: string | null | undefined, ordine: 'nome_cognome' | 'cognome_nome' = 'nome_cognome'): Titolare[] {
  const pulito = pulisci((testo ?? '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' '))
  if (!pulito || !/[a-zA-Zà-ÿÀ-ß]/.test(pulito)) return []
  const parti = pulito
    .split(/\s+e\s+|\s+ed\s+|\s*[,;&/+\n]\s*|\s+-\s+/i)
    .map((p) => p.split(/\s+/).filter((w) => w && !TITOLI.test(w)).map(maiuscoleNome))
    .filter((p) => p.length > 0)
  if (!parti.length) return []
  const persone = parti.map((p) => ({ parole: p, persona: dividiPersona(p, ordine) }))
  // una parte di una sola parola è un nome che prende il cognome della persona vicina
  const conCognome = persone.filter((p) => p.parole.length > 1)
  if (conCognome.length) {
    for (const [i, p] of persone.entries()) {
      if (p.parole.length > 1) continue
      const vicino =
        ordine === 'nome_cognome'
          ? persone.slice(i + 1).find((x) => x.parole.length > 1) ?? [...persone.slice(0, i)].reverse().find((x) => x.parole.length > 1)
          : [...persone.slice(0, i)].reverse().find((x) => x.parole.length > 1) ?? persone.slice(i + 1).find((x) => x.parole.length > 1)
      if (vicino) p.persona = { nome: p.parole[0], cognome: vicino.persona.cognome }
    }
  }
  const visti = new Set<string>()
  return persone
    .map((p) => p.persona)
    .filter((t) => {
      const k = chiaveTesto(`${t.nome} ${t.cognome}`)
      if (!k || visti.has(k)) return false
      visti.add(k)
      return true
    })
    .slice(0, 10)
}

/** "Mario Rossi; Luca Rossi" per il campo modificabile dell'anteprima. */
export function titolariInTesto(t: Titolare[]): string {
  return t.map((x) => pulisci(`${x.nome} ${x.cognome}`)).filter(Boolean).join('; ')
}

/** Dal campo dell'anteprima: persone separate da ";" (dentro una persona, "Nome Cognome"). */
export function titolariDaTesto(testo: string): Titolare[] {
  const visti = new Set<string>()
  return testo
    .split(/[;\n]+/)
    .flatMap((p) => dividiTitolari(p))
    .filter((t) => {
      const k = chiaveTesto(`${t.nome} ${t.cognome}`)
      if (visti.has(k)) return false
      visti.add(k)
      return true
    })
    .slice(0, 10)
}

// ---------------------------------------------------------------------------
// Dati fiscali e telefono
// ---------------------------------------------------------------------------

/**
 * Partita IVA: solo cifre, senza "IT". Excel toglie gli zeri iniziali dei numeri: una partita IVA
 * di 8-10 cifre letta come numero torna a 11 cifre. Altri formati restano come scritti (maiuscoli).
 */
export function normalizzaPartitaIva(valore: string | number | null | undefined): string | null {
  if (valore == null) return null
  const t = String(valore).toUpperCase().replace(/[\s.\-/ ]/g, '').replace(/^IT/, '')
  if (!t) return null
  if (/^\d{11}$/.test(t)) return t
  if (/^\d{8,10}$/.test(t)) return t.padStart(11, '0')
  return t.length <= 20 ? t : null
}

export function normalizzaCodiceFiscale(valore: string | null | undefined): string | null {
  const t = (valore ?? '').toUpperCase().replace(/[\s.\- ]/g, '')
  if (!t) return null
  if (/^\d{8,10}$/.test(t)) return t.padStart(11, '0') // codice fiscale numerico di una società
  return t.length <= 20 ? t : null
}

export function normalizzaTelefono(valore: string | number | null | undefined): string | null {
  if (valore == null) return null
  const t = pulisci(String(valore))
  if (!t || !/\d{3}/.test(t)) return null
  return t.slice(0, 40)
}

/** Chiave di una partita IVA per i confronti (solo cifre, 11 caratteri). */
export function chiavePartitaIva(valore: string | null | undefined): string | null {
  const p = normalizzaPartitaIva(valore)
  return p && /^\d{11}$/.test(p) ? p : null
}
