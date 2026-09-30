'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente, type Tx } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { colleghi } from '@/lib/dati/clienti'
import { RIGHE_PER_CONFERMA } from '@/lib/importazione/costanti'
import {
  controllaRiga, scriviAssegnazioni, scriviClienti, type Esegui, type Importata, type RigaPronta, type Saltata,
} from '@/lib/importazione/scrittura'

const esecutore = (tx: Tx): Esegui => (sql, parametri) => tx.unsafe(sql, (parametri ?? []) as never[]) as never

const schemaBloccoConferma = z.object({
  importazione: z.string().uuid(),
  nomeFile: z.string().max(255),
  blocco: z.number().int().min(1).max(1000),
  blocchi: z.number().int().min(1).max(1000),
  righe: z.array(z.unknown()).min(1).max(RIGHE_PER_CONFERMA),
})

export type EsitoImportazione = { importate: Importata[]; saltate: Saltata[]; senzaCollaboratore: number[] }

/**
 * Conferma dell'importazione dei clienti, un blocco (~100 clienti) per chiamata e per transazione.
 * Ricontrolla ogni riga sul server e salta quelle con errori, con il motivo.
 */
export async function importaClienti(input: z.infer<typeof schemaBloccoConferma>): Promise<EsitoAzione<EsitoImportazione>> {
  const d = schemaBloccoConferma.safeParse(input)
  if (!d.success) return { ok: false, errore: 'Dati da importare non validi.' }
  const { persona } = await richiediAdmin()
  const pronte: RigaPronta[] = []
  const saltate: Saltata[] = []
  for (const grezza of d.data.righe) {
    const c = controllaRiga(grezza)
    if (c.ok) pronte.push(c.riga)
    else saltate.push(c.saltata)
  }
  try {
    const r = await conUtente(
      persona,
      async (tx) => {
        const collaboratori = new Set((await colleghi(tx)).map((c) => c.id))
        return scriviClienti(esecutore(tx), pronte, {
          collaboratori,
          dettagliRegistro: {
            nome_file: d.data.nomeFile,
            importazione: d.data.importazione,
            blocco: d.data.blocco,
            blocchi: d.data.blocchi,
          },
        })
      },
      { origine: 'importazione' },
    )
    revalidatePath('/', 'layout')
    return { ok: true, dati: { importate: r.importate, saltate, senzaCollaboratore: r.senzaCollaboratore } }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Importazione non riuscita. Riprova.') }
  }
}

const schemaAssegnazioni = z.object({
  nomeFile: z.string().max(255),
  coppie: z.array(z.object({ cliente_id: z.string().uuid(), utente_id: z.string().uuid() })).min(1).max(5000),
})

/** Assegnazioni cliente-collaboratore da file: il collaboratore diventa il referente (una transazione). */
export async function importaAssegnazioni(
  input: z.infer<typeof schemaAssegnazioni>,
): Promise<EsitoAzione<{ assegnate: number; invariate: number }>> {
  const d = schemaAssegnazioni.safeParse(input)
  if (!d.success) return { ok: false, errore: 'Dati delle assegnazioni non validi.' }
  const { persona } = await richiediAdmin()
  try {
    const r = await conUtente(persona, (tx) => scriviAssegnazioni(esecutore(tx), d.data.coppie, { nome_file: d.data.nomeFile }))
    revalidatePath('/', 'layout')
    return {
      ok: true,
      messaggio: r.assegnate
        ? `Assegnazioni salvate: ${r.assegnate} ${r.assegnate === 1 ? 'cliente' : 'clienti'}.`
        : 'Nessuna assegnazione da cambiare.',
      dati: r,
    }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Assegnazioni non salvate. Riprova.') }
  }
}
