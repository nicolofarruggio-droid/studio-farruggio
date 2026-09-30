import 'server-only'
import { createReadStream } from 'node:fs'
import { mkdir, open, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { PERCORSO_VALIDO } from './regole'

// Spazio file "locale" (STORAGE_DRIVER=locale): i documenti stanno in .dati-locali/file/ sul computer
// che fa girare il sito. Solo per sviluppo e test: in produzione si usa Supabase Storage.

export class ErroreFileLocale extends Error {
  constructor(message: string, readonly stato: 404 | 409 | 413) {
    super(message)
  }
}

export const cartellaFileLocali = () => path.join(process.cwd(), '.dati-locali', 'file')

/** Percorso su disco di un documento, senza possibilità di uscire dalla cartella. */
export function percorsoSuDisco(base: string, percorso: string): string {
  if (!PERCORSO_VALIDO.test(percorso)) throw new Error('Percorso del documento non valido')
  const radice = path.resolve(base)
  const p = path.resolve(radice, ...percorso.split('/'))
  if (!p.startsWith(radice + path.sep)) throw new Error('Percorso del documento non valido')
  return p
}

/** Scrive un file nuovo (mai sovrascrivere), fermandosi se supera maxByte. */
export async function scriviFileLocale(
  base: string, percorso: string, corpo: ReadableStream<Uint8Array> | null, maxByte: number,
): Promise<{ dimensione: number }> {
  const dest = percorsoSuDisco(base, percorso)
  await mkdir(path.dirname(dest), { recursive: true })
  let file
  try {
    file = await open(dest, 'wx')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new ErroreFileLocale('Il file esiste già.', 409)
    throw e
  }
  let dimensione = 0
  let completato = false
  try {
    if (corpo) {
      const lettore = corpo.getReader()
      for (;;) {
        const { done, value } = await lettore.read()
        if (done) break
        dimensione += value.byteLength
        if (dimensione > maxByte) {
          await lettore.cancel().catch(() => {})
          throw new ErroreFileLocale('Il file supera la dimensione massima consentita.', 413)
        }
        await file.write(value)
      }
    }
    completato = true
  } finally {
    await file.close()
    if (!completato) await unlink(dest).catch(() => {})
  }
  return { dimensione }
}

export async function infoFileLocale(base: string, percorso: string): Promise<{ dimensione: number } | null> {
  try {
    const s = await stat(percorsoSuDisco(base, percorso))
    return s.isFile() ? { dimensione: s.size } : null
  } catch {
    return null
  }
}

export async function leggiFileLocale(
  base: string, percorso: string,
): Promise<{ corpo: ReadableStream<Uint8Array>; dimensione: number } | null> {
  const p = percorsoSuDisco(base, percorso)
  const info = await infoFileLocale(base, percorso)
  if (!info) return null
  return { corpo: Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>, dimensione: info.dimensione }
}

export async function eliminaFileLocale(base: string, percorso: string): Promise<void> {
  await unlink(percorsoSuDisco(base, percorso)).catch(() => {})
}
