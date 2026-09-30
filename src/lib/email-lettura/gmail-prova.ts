import 'server-only'
import { modalitaProvaConsentita } from '@/lib/modalita-prova'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { INTESTAZIONI_LETTE, type MessaggioGmail, type ParteMessaggio } from './messaggi'
import { ErroreCursoreScaduto, ErroreNonTrovato, type ClienteGmail, type RispostaStoria } from './tipi'

// Casella di prova, SOLO per sviluppo e test (GMAIL_SIMULATO=1, mai in produzione).
// Implementa la stessa interfaccia del client Gmail (profilo, cronologia, elenco, lettura) e restituisce
// messaggi nello stesso formato JSON dell'API, così il controllo segue esattamente lo stesso percorso.
// Le email simulate stanno in file JSON in .dati-locali/gmail-prova/ (uno per casella), fuori dal database:
// il "Gmail finto" non è il gestionale, e nel database resta solo ciò che il controllo salva davvero.

export const PREFISSO_TOKEN_PROVA = 'simulato:'

export function gmailSimulato(): boolean {
  return process.env.GMAIL_SIMULATO === '1' && modalitaProvaConsentita()
}

type EmailProva = {
  id: string
  threadId: string
  historyId: number
  internalDate: number
  etichette: string[]
  da: string
  a: string
  oggetto: string
  messageId: string
  inRispostaA: string | null
  testo: string
  soloHtml: boolean
  allegati: string[]
  citazione: { da: string; data: number; testo: string } | null
}

type ArchivioProva = { indirizzo: string; historyId: number; messaggi: EmailProva[] }

function cartella(): string {
  return process.env.GMAIL_SIMULATO_CARTELLA || path.join(process.cwd(), '.dati-locali', 'gmail-prova')
}

function file(indirizzo: string): string {
  return path.join(cartella(), `${indirizzo.toLowerCase().replace(/[^a-z0-9@._-]/g, '_')}.json`)
}

async function leggi(indirizzo: string): Promise<ArchivioProva> {
  try {
    return JSON.parse(await readFile(file(indirizzo), 'utf8')) as ArchivioProva
  } catch {
    return { indirizzo: indirizzo.toLowerCase(), historyId: 1000, messaggi: [] }
  }
}

// scritture una alla volta per file (lettura-modifica-scrittura senza sovrapposizioni)
const code = new Map<string, Promise<unknown>>()
async function modifica<T>(indirizzo: string, fn: (a: ArchivioProva) => T): Promise<T> {
  const chiave = file(indirizzo)
  const prima = code.get(chiave) ?? Promise.resolve()
  const lavoro = prima.then(async () => {
    const a = await leggi(indirizzo)
    const r = fn(a)
    await mkdir(cartella(), { recursive: true })
    const tmp = `${chiave}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, JSON.stringify(a, null, 1))
    await rename(tmp, chiave)
    return r
  })
  code.set(chiave, lavoro.catch(() => {}))
  return lavoro
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dataRfc = (ms: number) => new Date(ms).toUTCString().replace('GMT', '+0000')

function payload(m: EmailProva): ParteMessaggio {
  let piano = m.testo
  let html = `<div dir="ltr">${esc(m.testo).replace(/\n/g, '<br>')}</div>`
  if (m.citazione) {
    const quando = new Date(m.citazione.data).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
    piano += `\n\nIl giorno ${quando} ${m.citazione.da} ha scritto:\n${m.citazione.testo.split('\n').map((r) => `> ${r}`).join('\n')}`
    html += `<div class="gmail_quote"><div class="gmail_attr">Il giorno ${esc(quando)} ${esc(m.citazione.da)} ha scritto:</div><blockquote class="gmail_quote">${esc(m.citazione.testo).replace(/\n/g, '<br>')}</blockquote></div>`
  }
  const alternative: ParteMessaggio = {
    mimeType: 'multipart/alternative',
    headers: [{ name: 'Content-Type', value: 'multipart/alternative; boundary="alt"' }],
    parts: [
      ...(m.soloHtml ? [] : [{ mimeType: 'text/plain', filename: '', headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }], body: { size: piano.length, data: b64(piano) } }]),
      { mimeType: 'text/html', filename: '', headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }], body: { size: html.length, data: b64(html) } },
    ],
  }
  const intestazioni = [
    { name: 'From', value: m.da },
    { name: 'To', value: m.a },
    { name: 'Subject', value: m.oggetto },
    { name: 'Date', value: dataRfc(m.internalDate) },
    { name: 'Message-ID', value: m.messageId },
    ...(m.inRispostaA ? [{ name: 'In-Reply-To', value: m.inRispostaA }, { name: 'References', value: m.inRispostaA }] : []),
  ]
  if (!m.allegati.length) return { ...alternative, headers: [...intestazioni, ...(alternative.headers ?? [])] }
  return {
    mimeType: 'multipart/mixed',
    filename: '',
    headers: [...intestazioni, { name: 'Content-Type', value: 'multipart/mixed; boundary="mix"' }],
    parts: [
      alternative,
      ...m.allegati.map((nome, i) => ({
        partId: `${i + 1}`,
        mimeType: /\.pdf$/i.test(nome) ? 'application/pdf' : 'application/octet-stream',
        filename: nome,
        headers: [{ name: 'Content-Disposition', value: `attachment; filename="${nome}"` }],
        // gli allegati non si aprono mai: il contenuto non esiste nemmeno nella casella di prova
        body: { size: 1024, attachmentId: `allegato-${m.id}-${i}` },
      })),
    ],
  }
}

function comeGmail(m: EmailProva, formato: 'metadata' | 'full'): MessaggioGmail {
  const completo = payload(m)
  const base = { id: m.id, threadId: m.threadId, labelIds: m.etichette, historyId: String(m.historyId), internalDate: String(m.internalDate) }
  if (formato === 'full') return { ...base, payload: completo }
  // "metadata": solo le intestazioni richieste, niente testo
  const scelte = new Set(INTESTAZIONI_LETTE.map((h) => h.toLowerCase()))
  return { ...base, payload: { headers: (completo.headers ?? []).filter((h) => scelte.has(h.name.toLowerCase())) } }
}

/** Casella di prova con la stessa interfaccia (in sola lettura) del client Gmail. */
export function casellaDiProva(indirizzo: string): ClienteGmail {
  return {
    async profilo() {
      const a = await leggi(indirizzo)
      return { emailAddress: a.indirizzo, historyId: String(a.historyId), messagesTotal: a.messaggi.length }
    },
    async storia(inizio, pagina) {
      const a = await leggi(indirizzo)
      const da = Number(inizio)
      if (!Number.isFinite(da) || da < 1000) throw new ErroreCursoreScaduto('Cursore scaduto', 404)
      const nuovi = a.messaggi.filter((m) => m.historyId > da && m.etichette.includes('INBOX'))
      const offset = Number(pagina ?? 0)
      const pezzo = nuovi.slice(offset, offset + 100)
      const r: RispostaStoria = {
        historyId: String(a.historyId),
        history: pezzo.map((m) => ({ id: String(m.historyId), messagesAdded: [{ message: { id: m.id, threadId: m.threadId, labelIds: m.etichette } }] })),
      }
      if (offset + 100 < nuovi.length) r.nextPageToken = String(offset + 100)
      return r
    },
    async elencoMessaggi(query, pagina) {
      const a = await leggi(indirizzo)
      const dopo = Number(query.match(/after:(\d+)/)?.[1] ?? 0) * 1000
      const tutti = a.messaggi.filter((m) => m.etichette.includes('INBOX') && m.internalDate > dopo).sort((x, y) => y.internalDate - x.internalDate)
      const offset = Number(pagina ?? 0)
      return {
        messages: tutti.slice(offset, offset + 100).map((m) => ({ id: m.id, threadId: m.threadId })),
        nextPageToken: offset + 100 < tutti.length ? String(offset + 100) : undefined,
        resultSizeEstimate: tutti.length,
      }
    },
    async messaggio(id, formato) {
      const a = await leggi(indirizzo)
      const m = a.messaggi.find((x) => x.id === id)
      if (!m) throw new ErroreNonTrovato('Messaggio non trovato', 404)
      return comeGmail(m, formato)
    },
  }
}

export type NuovaEmailProva = {
  destinatari: string[]
  mittente: string
  oggetto: string
  testo: string
  allegati: string[]
  soloHtml: boolean
  /** conversazione (threadId) della casella del primo destinatario a cui si risponde */
  rispostaA: string | null
}

/**
 * Simula l'arrivo di un'email in una o più caselle di prova. Lo stesso messaggio (stesso Message-ID)
 * può arrivare a più collaboratori: serve a provare che nelle Comunicazioni compare una volta sola.
 */
export async function consegnaEmailDiProva(e: NuovaEmailProva): Promise<{ messageId: string; oggetto: string }> {
  const messageId = `<prova-${randomBytes(8).toString('hex')}@gmail-prova.bigbrotherstudio.test>`
  const adesso = Date.now()
  const [primo] = e.destinatari
  // messaggio a cui si risponde, nella casella del primo destinatario
  let originale: EmailProva | null = null
  if (e.rispostaA) {
    const a = await leggi(primo)
    originale = a.messaggi.filter((m) => m.threadId === e.rispostaA).sort((x, y) => y.internalDate - x.internalDate)[0] ?? null
  }
  const oggetto = e.oggetto.trim() || (originale ? `R: ${originale.oggetto.replace(/^\s*(r|re)\s*:\s*/i, '')}` : '')
  for (const destinatario of e.destinatari) {
    await modifica(destinatario, (a) => {
      const id = randomBytes(8).toString('hex')
      // nella casella di ogni destinatario la conversazione ha un suo threadId (come in Gmail)
      const stessa = originale ? a.messaggi.find((m) => m.messageId === originale.messageId || m.inRispostaA === originale.messageId) : undefined
      a.historyId += 1
      a.messaggi.push({
        id,
        threadId: stessa?.threadId ?? id,
        historyId: a.historyId,
        internalDate: adesso,
        etichette: ['INBOX', 'UNREAD'],
        da: e.mittente,
        a: destinatario,
        oggetto,
        messageId,
        inRispostaA: originale?.messageId ?? null,
        testo: e.testo,
        soloHtml: e.soloHtml,
        allegati: e.allegati,
        citazione: originale ? { da: originale.da, data: originale.internalDate, testo: originale.testo } : null,
      })
    })
  }
  return { messageId, oggetto }
}

/** Ultime conversazioni della casella di prova, per il modulo "risposta a una conversazione esistente". */
export async function conversazioniDiProva(indirizzo: string): Promise<{ threadId: string; oggetto: string; mittente: string; data: Date }[]> {
  const a = await leggi(indirizzo)
  const perThread = new Map<string, EmailProva>()
  for (const m of a.messaggi) {
    const x = perThread.get(m.threadId)
    if (!x || x.internalDate < m.internalDate) perThread.set(m.threadId, m)
  }
  return [...perThread.values()]
    .sort((x, y) => y.internalDate - x.internalDate)
    .slice(0, 20)
    .map((m) => ({ threadId: m.threadId, oggetto: m.oggetto, mittente: m.da, data: new Date(m.internalDate) }))
}
