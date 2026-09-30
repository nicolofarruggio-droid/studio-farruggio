// Lettura dei messaggi Gmail (formato JSON dell'API): intestazioni, mittente, oggetto, testo e nomi
// degli allegati. Funzioni pure, senza rete né database: si provano con i test unitari.

export type Intestazione = { name: string; value: string }

export type ParteMessaggio = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: Intestazione[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: ParteMessaggio[]
}

/** Messaggio come lo restituisce Gmail (users.messages.get). */
export type MessaggioGmail = {
  id: string
  threadId: string
  labelIds?: string[]
  historyId?: string
  internalDate?: string // millisecondi dal 1970, come stringa
  payload?: ParteMessaggio
}

/** Intestazioni che servono per riconoscere il cliente: si leggono PRIMA del testo (sezione 16.3). */
export const INTESTAZIONI_LETTE = ['From', 'Date', 'Subject', 'Message-ID'] as const

/** Lunghezza massima del testo di un'email mandato all'AI. */
export const MAX_CARATTERI_TESTO = 12_000

const INDIRIZZO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function intestazione(p: ParteMessaggio | undefined, nome: string): string | null {
  const n = nome.toLowerCase()
  const h = p?.headers?.find((x) => x.name.toLowerCase() === n)
  return h ? h.value : null
}

// ---------------------------------------------------------------------------
// Parole codificate nelle intestazioni (RFC 2047): =?UTF-8?B?...?= e =?ISO-8859-1?Q?...?=
// ---------------------------------------------------------------------------
function decodificaByte(byte: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.trim().toLowerCase() || 'utf-8').decode(byte)
  } catch {
    return new TextDecoder('utf-8').decode(byte)
  }
}

export function decodificaIntestazione(valore: string): string {
  const unito = valore.replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?)/gi, '$1')
  return unito.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (tutto, charset: string, codifica: string, testo: string) => {
    try {
      let byte: Uint8Array
      if (codifica.toLowerCase() === 'b') {
        byte = new Uint8Array(Buffer.from(testo, 'base64'))
      } else {
        const s = testo.replace(/_/g, ' ')
        const out: number[] = []
        for (let i = 0; i < s.length; i++) {
          if (s[i] === '=' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) {
            out.push(parseInt(s.slice(i + 1, i + 3), 16))
            i += 2
          } else out.push(s.charCodeAt(i) & 0xff)
        }
        byte = new Uint8Array(out)
      }
      return decodificaByte(byte, charset.split('*')[0])
    } catch {
      return tutto
    }
  })
}

/**
 * Indirizzo del mittente, minuscolo, dall'intestazione From:
 * "Nome Cognome <A@B.it>" → "a@b.it". Se non c'è un indirizzo valido restituisce null.
 */
export function indirizzoMittente(from: string | null | undefined): string | null {
  if (!from) return null
  // l'indirizzo tra < > (l'ultimo, se il nome contiene parentesi angolari)
  const tra = [...from.matchAll(/<([^<>]*)>/g)].map((m) => m[1].trim()).filter((x) => x.includes('@'))
  let candidato: string | undefined = tra.at(-1)
  if (!candidato) {
    const senzaCommenti = from.replace(/\([^)]*\)/g, ' ').replace(/"[^"]*"/g, ' ')
    candidato = senzaCommenti.match(/[^\s<>"',;:()]+@[^\s<>"',;:()]+/)?.[0]
  }
  if (!candidato) return null
  const indirizzo = candidato.replace(/^mailto:/i, '').trim().toLowerCase()
  return INDIRIZZO.test(indirizzo) ? indirizzo : null
}

// Prefissi di risposta e inoltro: "R:", "Re:", "RE[2]:", "Fwd:", "Fw:", "I:" (Outlook in italiano).
const PREFISSO = /^\s*(re|r|fwd|fw|i)\s*(\[\d+\])?\s*:\s*/i

/** Oggetto senza "R:", "Re:", "Fwd:", "I:" ripetuti, minuscolo e con gli spazi normalizzati. */
export function normalizzaOggetto(oggetto: string | null | undefined): string {
  let s = (oggetto ?? '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 20 && PREFISSO.test(s); i++) s = s.replace(PREFISSO, '')
  return s.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Testo del messaggio
// ---------------------------------------------------------------------------
function daBase64Url(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
}

function charsetDi(p: ParteMessaggio): string {
  const ct = intestazione(p, 'Content-Type') ?? ''
  return ct.match(/charset\s*=\s*"?([^";\s]+)"?/i)?.[1] ?? 'utf-8'
}

function eAllegato(p: ParteMessaggio): boolean {
  if (p.filename) return true
  const disp = intestazione(p, 'Content-Disposition') ?? ''
  return /^\s*attachment/i.test(disp)
}

function testoParte(p: ParteMessaggio): string {
  if (!p.body?.data) return ''
  return decodificaByte(daBase64Url(p.body.data), charsetDi(p))
}

const ENTITA: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", egrave: 'è', eacute: 'é', agrave: 'à',
  ograve: 'ò', ugrave: 'ù', igrave: 'ì', Egrave: 'È', Eacute: 'É', Agrave: 'À', euro: '€', laquo: '«',
  raquo: '»', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°',
}

function decodificaEntita(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tutto, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tutto
    }
    return ENTITA[e] ?? tutto
  })
}

function spaziTesto(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((r) => r.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** HTML ripulito in testo semplice. Le citazioni delle risposte (<blockquote>) vengono tolte. */
export function pulisciHtml(html: string): { testo: string; citazioneOmessa: boolean } {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|title|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  let citazioneOmessa = false
  // toglie le citazioni dalla più interna, così funziona anche con quelle annidate
  for (let i = 0; i < 20; i++) {
    const dopo = s.replace(/<blockquote\b[^>]*>(?:(?!<blockquote\b)[\s\S])*?<\/blockquote\s*>/gi, '')
    if (dopo === s) break
    citazioneOmessa = true
    s = dopo
  }
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|tr|h[1-6]|table|ul|ol|section|article|header|footer)\s*>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
  // niente righe vuote prima delle voci di un elenco
  return { testo: spaziTesto(decodificaEntita(s)).replace(/\n{2,}(?=- )/g, '\n'), citazioneOmessa }
}

const ATTRIBUZIONE = /^(il giorno|in data|on)\b.*\b(ha scritto|wrote)\s*:?\s*$/i

/**
 * Toglie dal testo semplice le citazioni delle risposte: le righe che iniziano con ">" e quello che segue
 * "Il giorno … ha scritto:" / "On … wrote:". I messaggi inoltrati restano: spesso sono il contenuto vero.
 */
export function rimuoviCitazioni(testo: string): { testo: string; citazioneOmessa: boolean } {
  const righe = testo.replace(/\r\n?/g, '\n').split('\n')
  let citazioneOmessa = false
  let fine = righe.length
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i].trim()
    const conSeguente = `${r} ${righe[i + 1]?.trim() ?? ''}`.trim()
    if (ATTRIBUZIONE.test(r) || (/^(il giorno|in data|on)\b/i.test(r) && ATTRIBUZIONE.test(conSeguente))) {
      const prima = righe.slice(0, i).filter((x) => !x.trim().startsWith('>')).join('\n').trim()
      if (prima) {
        fine = i
        citazioneOmessa = true
      }
      break
    }
  }
  const tenute = righe.slice(0, fine).filter((r) => {
    const citata = r.trimStart().startsWith('>')
    if (citata) citazioneOmessa = true
    return !citata
  })
  const risultato = spaziTesto(tenute.join('\n'))
  // se era tutto citato, meglio il testo originale che niente
  if (!risultato) return { testo: spaziTesto(testo), citazioneOmessa: false }
  return { testo: risultato, citazioneOmessa }
}

function raccogli(p: ParteMessaggio, tipo: 'text/plain' | 'text/html', out: string[]) {
  const mime = (p.mimeType ?? '').toLowerCase()
  if (eAllegato(p) || mime === 'message/rfc822') return
  if (mime.startsWith('multipart/')) {
    const figli = p.parts ?? []
    if (mime === 'multipart/alternative') {
      // tra le alternative basta la versione nel formato cercato
      const scelta = figli.find((f) => (f.mimeType ?? '').toLowerCase() === tipo)
        ?? figli.find((f) => (f.mimeType ?? '').toLowerCase().startsWith('multipart/'))
      if (scelta) raccogli(scelta, tipo, out)
      return
    }
    for (const f of figli) raccogli(f, tipo, out)
    return
  }
  if (mime === tipo) {
    const t = testoParte(p)
    if (t.trim()) out.push(t)
  }
}

/**
 * Testo dell'email: le parti text/plain; se non ci sono, l'HTML ripulito. Mai gli allegati.
 * Le citazioni delle risposte precedenti vengono omesse (l'AI riceve i riassunti precedenti).
 */
export function estraiTesto(payload: ParteMessaggio | undefined): { testo: string; citazioneOmessa: boolean } {
  if (!payload) return { testo: '', citazioneOmessa: false }
  const semplici: string[] = []
  raccogli(payload, 'text/plain', semplici)
  if (semplici.length) return rimuoviCitazioni(semplici.join('\n\n'))
  const html: string[] = []
  raccogli(payload, 'text/html', html)
  if (!html.length) return { testo: '', citazioneOmessa: false }
  const pulito = pulisciHtml(html.join('\n'))
  const senzaCitazioni = rimuoviCitazioni(pulito.testo)
  return { testo: senzaCitazioni.testo, citazioneOmessa: pulito.citazioneOmessa || senzaCitazioni.citazioneOmessa }
}

/** Limita la lunghezza del testo, tagliando a fine parola, e segnala il taglio. */
export function limitaTesto(testo: string, max = MAX_CARATTERI_TESTO): { testo: string; troncato: boolean } {
  if (testo.length <= max) return { testo, troncato: false }
  const taglio = testo.slice(0, max)
  const spazio = taglio.search(/\s\S*$/)
  return { testo: (spazio > max * 0.8 ? taglio.slice(0, spazio) : taglio).trimEnd(), troncato: true }
}

/** Nomi degli allegati (gli allegati non si aprono mai). Esclude le immagini incorporate nella firma. */
export function nomiAllegati(payload: ParteMessaggio | undefined): string[] {
  const nomi: string[] = []
  const visita = (p: ParteMessaggio) => {
    const disp = intestazione(p, 'Content-Disposition') ?? ''
    const incorporata = /^\s*inline/i.test(disp) && intestazione(p, 'Content-ID') !== null
    if (p.filename && !incorporata) nomi.push(decodificaIntestazione(p.filename).trim().slice(0, 200))
    for (const f of p.parts ?? []) visita(f)
  }
  visita(payload ?? {})
  return nomi.filter(Boolean).slice(0, 50)
}

export type IntestazioniLette = {
  gmailId: string
  threadId: string
  etichette: string[]
  ricevutaIl: Date
  mittente: string | null
  oggetto: string
  messageId: string | null
}

/** Le sole intestazioni lette per riconoscere il cliente (sezione 16.3, punto 2). */
export function leggiIntestazioni(m: MessaggioGmail): IntestazioniLette {
  const p = m.payload
  const data = Number(m.internalDate)
  const dataIntestazione = Date.parse(intestazione(p, 'Date') ?? '')
  const ricevutaIl = new Date(Number.isFinite(data) && data > 0 ? data : Number.isFinite(dataIntestazione) ? dataIntestazione : Date.now())
  const mid = intestazione(p, 'Message-ID') ?? intestazione(p, 'Message-Id')
  return {
    gmailId: m.id,
    threadId: m.threadId,
    etichette: m.labelIds ?? [],
    ricevutaIl,
    mittente: indirizzoMittente(decodificaIntestazione(intestazione(p, 'From') ?? '')),
    oggetto: decodificaIntestazione(intestazione(p, 'Subject') ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
    messageId: mid ? mid.trim().slice(0, 500) : null,
  }
}
