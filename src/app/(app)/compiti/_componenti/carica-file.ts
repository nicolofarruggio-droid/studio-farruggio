'use client'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { Destinazione, FileCaricato } from '@/lib/documenti/tipi'
import { confermaCaricamento, preparaCaricamento } from '../azioni-documenti'

// Caricamento dal browser: il server prepara le destinazioni (dopo aver controllato i permessi),
// il browser manda i file direttamente allo spazio file, poi il server li verifica e li registra.

export type EsitoCaricamento = { ok: true; messaggio: string } | { ok: false; errore: string }

async function invia(d: Destinazione, file: File): Promise<void> {
  if (d.driver === 'locale') {
    const r = await fetch(d.url, { method: 'PUT', body: file, headers: { 'content-type': 'application/octet-stream' } })
    if (!r.ok) throw new Error((await r.text().catch(() => '')) || `errore ${r.status}`)
    return
  }
  const { error } = await supabaseBrowser().storage.from(d.bucket).uploadToSignedUrl(d.percorso, d.token, file, { contentType: d.tipo })
  if (error) throw new Error(error.message)
}

export async function caricaFile(
  compito: string, file: File[], avanzamento?: (fatti: number, totale: number) => void,
): Promise<EsitoCaricamento> {
  const p = await preparaCaricamento(compito, file.map((f) => ({ nome: f.name, tipo: f.type, dimensione: f.size })))
  if (!p.ok) return p
  const preparati = p.dati?.file ?? []
  const caricati: FileCaricato[] = []
  const errori: string[] = []
  avanzamento?.(0, preparati.length)
  for (const [i, x] of preparati.entries()) {
    try {
      await invia(x.destinazione, file[x.indice])
      caricati.push({ file_id: x.file_id, nome: x.nome, tipo: x.tipo })
    } catch (e) {
      errori.push(`«${x.nome}» non è stato caricato (${e instanceof Error ? e.message : 'errore di rete'}).`)
    }
    avanzamento?.(i + 1, preparati.length)
  }
  if (caricati.length === 0) return { ok: false, errore: errori.join(' ') || 'Nessun file caricato.' }
  const c = await confermaCaricamento(compito, caricati)
  if (!c.ok) return { ok: false, errore: [c.errore, ...errori].join(' ') }
  return errori.length
    ? { ok: false, errore: `${c.messaggio ?? ''} ${errori.join(' ')}`.trim() }
    : { ok: true, messaggio: c.messaggio ?? 'Documenti caricati.' }
}
