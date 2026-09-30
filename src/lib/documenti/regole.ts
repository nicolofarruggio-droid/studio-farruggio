// Regole dei documenti dei compiti (sezione 8): tipi ammessi, dimensione, nome del file, percorso.
// Modulo senza dipendenze dal server: lo usano sia le azioni sia il browser (controllo prima dell'invio).
// Il controllo che conta è quello del server, ripetuto anche alla conferma del caricamento.

export type Anteprima = 'pdf' | 'immagine' | 'testo'

type Tipo = {
  /** tipo MIME registrato nel database e usato per lo spazio file */
  mime: string
  /** altri tipi MIME che i browser dichiarano per la stessa estensione */
  altri?: string[]
  anteprima?: Anteprima
}

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const POWERPOINT = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/**
 * Estensioni ammesse: PDF, Word, Excel, immagini, CSV, testo, ZIP e simili (compresi fatture XML,
 * file firmati .p7m ed email salvate). Niente HTML, SVG, script o programmi.
 */
export const TIPI_AMMESSI: Record<string, Tipo> = {
  pdf: { mime: 'application/pdf', anteprima: 'pdf' },
  doc: { mime: 'application/msword' },
  docx: { mime: WORD },
  odt: { mime: 'application/vnd.oasis.opendocument.text' },
  rtf: { mime: 'application/rtf', altri: ['text/rtf'] },
  xls: { mime: 'application/vnd.ms-excel' },
  xlsx: { mime: EXCEL },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  ppt: { mime: 'application/vnd.ms-powerpoint' },
  pptx: { mime: POWERPOINT },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation' },
  csv: { mime: 'text/csv', altri: ['application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'text/plain'], anteprima: 'testo' },
  txt: { mime: 'text/plain', anteprima: 'testo' },
  xml: { mime: 'application/xml', altri: ['text/xml'] },
  p7m: { mime: 'application/pkcs7-mime', altri: ['application/x-pkcs7-mime'] },
  eml: { mime: 'message/rfc822' },
  msg: { mime: 'application/vnd.ms-outlook' },
  jpg: { mime: 'image/jpeg', altri: ['image/pjpeg'], anteprima: 'immagine' },
  jpeg: { mime: 'image/jpeg', altri: ['image/pjpeg'], anteprima: 'immagine' },
  png: { mime: 'image/png', anteprima: 'immagine' },
  gif: { mime: 'image/gif', anteprima: 'immagine' },
  webp: { mime: 'image/webp', anteprima: 'immagine' },
  bmp: { mime: 'image/bmp', anteprima: 'immagine' },
  heic: { mime: 'image/heic', altri: ['image/heif'] },
  heif: { mime: 'image/heif', altri: ['image/heic'] },
  tif: { mime: 'image/tiff' },
  tiff: { mime: 'image/tiff' },
  zip: { mime: 'application/zip', altri: ['application/x-zip-compressed', 'application/x-zip'] },
  '7z': { mime: 'application/x-7z-compressed' },
  rar: { mime: 'application/vnd.rar', altri: ['application/x-rar-compressed', 'application/x-rar'] },
}

/** Valore per l'attributo `accept` del campo file. */
export const ACCEPT = Object.keys(TIPI_AMMESSI).map((e) => `.${e}`).join(',')

export const DESCRIZIONE_TIPI = 'PDF, Word, Excel, immagini, CSV, testo, ZIP e simili'

/** Quanti file si caricano al massimo in una volta. */
export const MAX_FILE_PER_VOLTA = 20

export const MB_PREDEFINITI = 25

/** Limite per file in byte, da DOCUMENTI_MAX_MB (proposta della sezione 8: 25 MB). */
export function limiteByte(valore: string | undefined | null = undefined): number {
  const mb = Number(valore)
  const ok = Number.isFinite(mb) && mb > 0 ? Math.min(mb, 5000) : MB_PREDEFINITI
  return Math.floor(ok * 1024 * 1024)
}

export function descriviLimite(byte: number): string {
  const mb = byte / 1024 / 1024
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1).replace('.', ',')} MB`
}

// caratteri di controllo, riservati nei nomi di file e caratteri invisibili che invertono il testo
// (usati per mascherare l'estensione, es. "fattura‮fdp.exe")
const VIETATI = /[\u0000-\u001f\u007f<>:"|?*\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

const MAX_NOME = 200

/** Estensione in minuscolo, senza punto ("" se manca). */
export function estensione(nome: string): string {
  const i = nome.lastIndexOf('.')
  if (i <= 0 || i === nome.length - 1) return ''
  return nome.slice(i + 1).toLowerCase()
}

/** Nome di file ripulito: niente percorsi, caratteri di controllo o nascosti, lunghezza limitata. */
export function pulisciNomeFile(nome: string): string {
  let n = String(nome ?? '').normalize('NFC')
  n = n.split(/[\\/]/).pop() ?? ''
  n = n.replace(VIETATI, '').replace(/\s+/g, ' ').trim()
  n = n.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (!n) return 'documento'
  if (n.length > MAX_NOME) {
    const est = estensione(n)
    const base = est ? n.slice(0, n.length - est.length - 1) : n
    n = est && est.length < 20 ? `${base.slice(0, MAX_NOME - est.length - 1).trim()}.${est}` : n.slice(0, MAX_NOME)
  }
  return n
}

const normalizzaMime = (t: string | null | undefined) => String(t ?? '').split(';')[0].trim().toLowerCase()

export type FileDaValidare = { nome: string; tipo?: string | null; dimensione: number }
export type FileValido = { ok: true; nome: string; tipo: string; dimensione: number }
export type FileNonValido = { ok: false; nome: string; errore: string }

/**
 * Controlla un file prima del caricamento (e di nuovo alla conferma, con la dimensione reale):
 * estensione ammessa, tipo MIME coerente con l'estensione, dimensione entro il limite.
 * Il tipo registrato è sempre quello dell'estensione, non quello dichiarato dal browser.
 */
export function validaFile(f: FileDaValidare, maxByte: number): FileValido | FileNonValido {
  const nome = pulisciNomeFile(f.nome)
  const est = estensione(nome)
  if (!est) return { ok: false, nome, errore: `«${nome}»: manca l'estensione del file (per esempio .pdf).` }
  const regola = TIPI_AMMESSI[est]
  if (!regola) {
    return { ok: false, nome, errore: `«${nome}»: questo tipo di file non è ammesso. Puoi caricare ${DESCRIZIONE_TIPI}.` }
  }
  const dichiarato = normalizzaMime(f.tipo)
  if (dichiarato && dichiarato !== 'application/octet-stream' && dichiarato !== regola.mime && !regola.altri?.includes(dichiarato)) {
    return { ok: false, nome, errore: `«${nome}»: il contenuto del file non corrisponde all'estensione .${est}.` }
  }
  const dimensione = Number(f.dimensione)
  if (!Number.isFinite(dimensione) || dimensione <= 0) return { ok: false, nome, errore: `«${nome}» è vuoto.` }
  if (dimensione > maxByte) {
    return { ok: false, nome, errore: `«${nome}» è troppo grande: il limite è ${descriviLimite(maxByte)} per file.` }
  }
  return { ok: true, nome, tipo: regola.mime, dimensione }
}

/** Che anteprima si può mostrare nel browser per un tipo registrato (null = solo "Scarica"). */
export function tipoAnteprima(tipo: string): Anteprima | null {
  const t = normalizzaMime(tipo)
  for (const r of Object.values(TIPI_AMMESSI)) if (r.mime === t && r.anteprima) return r.anteprima
  return null
}

/** Tipo con cui il file si mostra in anteprima: testo e CSV come testo semplice, così il browser non li scarica. */
export function tipoPerAnteprima(tipo: string): string {
  return tipoAnteprima(tipo) === 'testo' ? 'text/plain; charset=utf-8' : normalizzaMime(tipo)
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const PERCORSO_VALIDO = new RegExp(`^${UUID}/compiti/${UUID}/${UUID}$`)
export const UUID_VALIDO = new RegExp(`^${UUID}$`)

/** Percorso nello spazio file (sezione 8): studio_id/compiti/compito_id/file_id. */
export function percorsoDocumento(studio: string, compito: string, file: string): string {
  const p = `${studio}/compiti/${compito}/${file}`.toLowerCase()
  if (!PERCORSO_VALIDO.test(p)) throw new Error('Percorso del documento non valido')
  return p
}

/** Nome per l'intestazione Content-Disposition (con variante UTF-8 per accenti e simboli). */
export function contentDisposition(modo: 'inline' | 'attachment', nome: string): string {
  const pulito = pulisciNomeFile(nome)
  const ascii = pulito.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\;]/g, '_') || 'documento'
  const utf8 = encodeURIComponent(pulito).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${modo}; filename="${ascii}"; filename*=UTF-8''${utf8}`
}
