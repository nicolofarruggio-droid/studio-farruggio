import 'server-only'
import { z } from 'zod'
import { ErroreAI, flussoJsonDaClaude } from '@/lib/ai/claude'
import type { Persona } from '@/lib/db'
import { EstrattoreOggetti } from './flusso-json'
import { rigaSenzaDati, type RigaFile, type RigaImport } from './righe'
import { COLONNE_MASSIME, RIGHE_PER_BLOCCO } from './costanti'
import {
  ISTRUZIONI_IMPORTAZIONE, pezziRisposta, schemaRigaAI, schemaRispostaAI, simulaRisposta, testoPerAI,
  validaRigaAI, validaRisposta,
} from './risultato-ai'

/** Un blocco di righe inviato dal browser: intestazione e al massimo 60 righe. */
export const schemaBlocco = z.object({
  intestazione: z.array(z.string().max(300)).min(1).max(COLONNE_MASSIME),
  righe: z
    .array(z.object({ numero: z.number().int().min(1).max(10_000_000), celle: z.array(z.string().max(2000)).max(COLONNE_MASSIME) }))
    .min(1)
    .max(RIGHE_PER_BLOCCO)
    .refine((r) => new Set(r.map((x) => x.numero)).size === r.length, 'Numeri di riga ripetuti'),
})
export type Blocco = z.infer<typeof schemaBlocco>

/** Eventi dello stream NDJSON restituito al browser. */
export type EventoAnalisi =
  | { tipo: 'avanzamento'; completate: number }
  | { tipo: 'riga'; riga: RigaImport }
  | { tipo: 'fine'; righe: RigaImport[]; vuote: number[]; mancanti: number[] }
  | { tipo: 'errore'; messaggio: string }

/**
 * Analizza un blocco con l'AI in streaming. Mentre l'AI scrive, ogni riga completa viene controllata
 * e inviata subito (così un'interruzione non perde le righe già pronte); alla fine arriva il risultato
 * completo, controllato dal server.
 */
export async function* analizzaBlocco(blocco: Blocco, persona: Persona, segnale?: AbortSignal): AsyncGenerator<EventoAnalisi> {
  const righe: RigaFile[] = blocco.righe
  const perNumero = new Map(righe.map((r) => [r.numero, r]))
  const estrattore = new EstrattoreOggetti()
  const inviate = new Set<number>()
  let completate = 0
  try {
    for await (const ev of flussoJsonDaClaude({
      funzione: 'importazione',
      istruzioni: ISTRUZIONI_IMPORTAZIONE,
      dati: testoPerAI(blocco.intestazione, righe),
      schema: schemaRispostaAI,
      contesto: { persona },
      simulazione: () => simulaRisposta(blocco.intestazione, righe),
      simulazioneTesto: pezziRisposta,
      segnale,
    })) {
      if (ev.tipo === 'testo') {
        for (const testo of estrattore.aggiungi(ev.testo)) {
          let json: unknown
          try {
            json = JSON.parse(testo)
          } catch {
            continue
          }
          const r = schemaRigaAI.safeParse(json)
          if (!r.success) continue
          const origine = perNumero.get(r.data.riga)
          if (!origine || inviate.has(origine.numero)) continue
          inviate.add(origine.numero)
          const riga = validaRigaAI(r.data, origine, blocco.intestazione)
          if (!rigaSenzaDati(riga)) yield { tipo: 'riga', riga }
        }
        const n = Math.min(estrattore.numero, righe.length)
        if (n !== completate) {
          completate = n
          yield { tipo: 'avanzamento', completate }
        }
      } else {
        yield { tipo: 'fine', ...validaRisposta(ev.dati, blocco.intestazione, righe) }
      }
    }
  } catch (e) {
    if (segnale?.aborted) return
    yield { tipo: 'errore', messaggio: e instanceof ErroreAI ? e.message : 'Analisi non riuscita. Riprova.' }
  }
}
