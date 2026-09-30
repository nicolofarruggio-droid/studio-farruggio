import 'server-only'
import { firma, verificaFirma } from '@/lib/cripto'
import { PERCORSO_VALIDO } from './regole'

// Link temporanei firmati (HMAC con FILE_LOCALI_SEGRETO) per lo spazio file "locale", usato in sviluppo
// e nei test al posto di Supabase Storage. Imitano gli URL firmati di Supabase: chi ha il link può
// caricare (o scaricare) quel solo file, fino alla scadenza. Il link lo crea il server dopo aver
// controllato i permessi nel database.

export const INDIRIZZO_FILE_LOCALI = '/api/file-locali'

export type ModoLink = 'apri' | 'scarica'

export type LinkVerificato =
  | { ok: true; azione: 'carica'; percorso: string; maxByte: number }
  | { ok: true; azione: 'scarica'; percorso: string; modo: ModoLink; nome: string; tipo: string }
  | { ok: false; stato: 400 | 403 | 410; errore: string }

function segretoLocale(segreto?: string): string {
  const s = segreto ?? process.env.FILE_LOCALI_SEGRETO
  if (!s || s.length < 16) throw new Error('FILE_LOCALI_SEGRETO non configurata (almeno 16 caratteri)')
  return s
}

const testoDaFirmare = (campi: (string | number)[]) => campi.map(String).join('\n')

/** Link per caricare un file con PUT (valido `secondi`, dimensione massima `maxByte`). */
export function linkCaricamentoLocale(
  percorso: string, maxByte: number, secondi: number, opzioni: { adesso?: number; segreto?: string } = {},
): string {
  if (!PERCORSO_VALIDO.test(percorso)) throw new Error('Percorso del documento non valido')
  const scade = Math.floor((opzioni.adesso ?? Date.now()) / 1000) + secondi
  const f = firma(testoDaFirmare(['carica', percorso, scade, maxByte]), segretoLocale(opzioni.segreto))
  const q = new URLSearchParams({ a: 'carica', p: percorso, s: String(scade), m: String(maxByte), f })
  return `${INDIRIZZO_FILE_LOCALI}?${q}`
}

/** Link per aprire (anteprima) o scaricare un file con GET. */
export function linkScaricamentoLocale(
  percorso: string,
  d: { modo: ModoLink; nome: string; tipo: string },
  secondi: number,
  opzioni: { adesso?: number; segreto?: string } = {},
): string {
  if (!PERCORSO_VALIDO.test(percorso)) throw new Error('Percorso del documento non valido')
  const scade = Math.floor((opzioni.adesso ?? Date.now()) / 1000) + secondi
  const f = firma(testoDaFirmare(['scarica', percorso, scade, d.modo, d.nome, d.tipo]), segretoLocale(opzioni.segreto))
  const q = new URLSearchParams({ a: 'scarica', p: percorso, s: String(scade), o: d.modo, n: d.nome, t: d.tipo, f })
  return `${INDIRIZZO_FILE_LOCALI}?${q}`
}

/** Verifica firma, scadenza e forma di un link locale. */
export function verificaLinkLocale(
  q: URLSearchParams, attesa: 'carica' | 'scarica', opzioni: { adesso?: number; segreto?: string } = {},
): LinkVerificato {
  const a = q.get('a')
  const percorso = q.get('p') ?? ''
  const scade = Number(q.get('s'))
  const f = q.get('f') ?? ''
  if (a !== attesa || !PERCORSO_VALIDO.test(percorso) || !Number.isInteger(scade) || !f) {
    return { ok: false, stato: 400, errore: 'Link non valido.' }
  }
  const segreto = segretoLocale(opzioni.segreto)
  if (a === 'carica') {
    const maxByte = Number(q.get('m'))
    if (!Number.isInteger(maxByte) || maxByte <= 0) return { ok: false, stato: 400, errore: 'Link non valido.' }
    if (!verificaFirma(testoDaFirmare(['carica', percorso, scade, maxByte]), f, segreto)) {
      return { ok: false, stato: 403, errore: 'Link non valido.' }
    }
    if (scade * 1000 < (opzioni.adesso ?? Date.now())) return { ok: false, stato: 410, errore: 'Il link è scaduto: riprova.' }
    return { ok: true, azione: 'carica', percorso, maxByte }
  }
  const modo = q.get('o')
  const nome = q.get('n') ?? ''
  const tipo = q.get('t') ?? ''
  if ((modo !== 'apri' && modo !== 'scarica') || !nome || !tipo) return { ok: false, stato: 400, errore: 'Link non valido.' }
  if (!verificaFirma(testoDaFirmare(['scarica', percorso, scade, modo, nome, tipo]), f, segreto)) {
    return { ok: false, stato: 403, errore: 'Link non valido.' }
  }
  if (scade * 1000 < (opzioni.adesso ?? Date.now())) {
    return { ok: false, stato: 410, errore: 'Il link è scaduto: torna al compito e apri di nuovo il documento.' }
  }
  return { ok: true, azione: 'scarica', percorso, modo, nome, tipo }
}
