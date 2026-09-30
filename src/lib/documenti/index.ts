import 'server-only'
import { supabaseServizio } from '@/lib/supabase/server'
import { limiteByte, PERCORSO_VALIDO, tipoPerAnteprima } from './regole'
import { linkCaricamentoLocale, linkScaricamentoLocale, type ModoLink } from './link-locali'
import { cartellaFileLocali, infoFileLocale } from './locale'
import type { Destinazione } from './tipi'

// Spazio file dei documenti dei compiti (sezione 8), con due "driver" scelti da STORAGE_DRIVER:
// - supabase (produzione): bucket privato STORAGE_BUCKET; il browser carica direttamente con un URL
//   firmato di caricamento; apertura e download con URL firmati di pochi minuti;
// - locale (sviluppo e test): file in .dati-locali/file/ con link firmati HMAC (link-locali.ts).
// I permessi si controllano SEMPRE nel database prima di creare un link (vedi azioni e /api/documenti).

export type { Destinazione } from './tipi'

/** Durata dei link di apertura e download. */
export const DURATA_LINK_SECONDI = 5 * 60
/** Durata dei link di caricamento locali (Supabase usa 2 ore, non configurabili). */
const DURATA_CARICAMENTO_SECONDI = 30 * 60

export type Driver = 'supabase' | 'locale'

export function driver(): Driver {
  return process.env.STORAGE_DRIVER === 'locale' ? 'locale' : 'supabase'
}

export const bucket = () => process.env.STORAGE_BUCKET || 'documenti'

/** Limite per file (DOCUMENTI_MAX_MB, predefinito 25 MB). */
export const limiteDocumenti = () => limiteByte(process.env.DOCUMENTI_MAX_MB)

function controlla(percorso: string) {
  if (!PERCORSO_VALIDO.test(percorso)) throw new Error('Percorso del documento non valido')
}

/** Dove il browser deve mandare il file. Da chiamare solo dopo il controllo dei permessi. */
export async function preparaDestinazione(percorso: string, tipo: string, maxByte: number): Promise<Destinazione> {
  controlla(percorso)
  if (driver() === 'locale') {
    return { driver: 'locale', percorso, url: linkCaricamentoLocale(percorso, maxByte, DURATA_CARICAMENTO_SECONDI) }
  }
  const { data, error } = await supabaseServizio().storage.from(bucket()).createSignedUploadUrl(percorso)
  if (error || !data) throw new Error(`Spazio file non raggiungibile: ${error?.message ?? 'nessuna risposta'}`)
  return { driver: 'supabase', bucket: bucket(), percorso, token: data.token, tipo: tipoPerAnteprima(tipo) }
}

/** Dimensione reale di un file caricato, o null se non c'è. */
export async function infoOggetto(percorso: string): Promise<{ dimensione: number } | null> {
  controlla(percorso)
  if (driver() === 'locale') return infoFileLocale(cartellaFileLocali(), percorso)
  const i = percorso.lastIndexOf('/')
  const { data, error } = await supabaseServizio().storage.from(bucket())
    .list(percorso.slice(0, i), { search: percorso.slice(i + 1), limit: 10 })
  if (error) throw new Error(`Spazio file non raggiungibile: ${error.message}`)
  const o = data?.find((x) => x.name === percorso.slice(i + 1))
  if (!o) return null
  const dimensione = Number((o.metadata as { size?: number } | null)?.size)
  return { dimensione: Number.isFinite(dimensione) ? dimensione : 0 }
}

/**
 * Link temporaneo (pochi minuti) per aprire o scaricare un documento. Da chiamare solo dopo aver
 * verificato, sotto RLS, che l'utente vede il documento.
 */
export async function linkTemporaneo(
  percorso: string, d: { modo: ModoLink; nome: string; tipo: string },
): Promise<string> {
  controlla(percorso)
  if (driver() === 'locale') return linkScaricamentoLocale(percorso, d, DURATA_LINK_SECONDI)
  const { data, error } = await supabaseServizio().storage.from(bucket())
    .createSignedUrl(percorso, DURATA_LINK_SECONDI, d.modo === 'scarica' ? { download: d.nome } : undefined)
  if (error || !data) throw new Error(`Spazio file non raggiungibile: ${error?.message ?? 'nessuna risposta'}`)
  return data.signedUrl
}
