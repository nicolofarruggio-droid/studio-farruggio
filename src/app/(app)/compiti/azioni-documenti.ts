'use server'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { eliminaOggetti, infoOggetto, limiteDocumenti, preparaDestinazione } from '@/lib/documenti'
import { MAX_FILE_PER_VOLTA, percorsoDocumento, tipoBase, tipoPerAnteprima, validaFile } from '@/lib/documenti/regole'
import type { FileCaricato, FilePreparato } from '@/lib/documenti/tipi'

// Caricamento dei documenti di un compito (sezione 8), in tre passi:
// 1. preparaCaricamento: controlla permessi (nel database), tipo e dimensione, e restituisce dove mandare i file;
// 2. il browser manda i file direttamente allo spazio file (Supabase Storage o spazio locale);
// 3. confermaCaricamento: verifica che i file ci siano davvero, ne legge la dimensione reale, li registra
//    nel compito (public.registra_documento) e manda una sola notifica (public.notifica_documenti).

const id = z.guid()
const schemaFile = z.object({ nome: z.string().max(1000), tipo: z.string().max(200), dimensione: z.number() })

type StatoCaricamento = { studio_id: string; aperto: boolean; puo_caricare: boolean }

async function statoCompito(persona: { id: string; email: string }, compito: string): Promise<StatoCaricamento | null> {
  const [k] = await conUtente(persona, (tx) => tx<StatoCaricamento[]>`
    select k.studio_id, public.compito_aperto(k.stato) as aperto,
      ((public.puo_lavorare_compito(k.id) or public.puo_controllare_compito(k.id))
        and not (public.e_agente() and not public.agente_puo('carica_documenti'))) as puo_caricare
    from public.compiti k where k.id = ${compito}`)
  return k ?? null
}

function controllaStato(k: StatoCaricamento | null): string | null {
  if (!k) return 'Compito non trovato.'
  if (!k.puo_caricare) return 'Non puoi caricare documenti su questo compito.'
  if (!k.aperto) return 'Il compito è chiuso: riaprilo per aggiungere documenti.'
  return null
}

export async function preparaCaricamento(
  compito: string, file: z.infer<typeof schemaFile>[],
): Promise<EsitoAzione<{ file: FilePreparato[] }>> {
  if (!id.safeParse(compito).success) return { ok: false, errore: 'Compito non valido.' }
  const elenco = z.array(schemaFile).safeParse(file)
  if (!elenco.success || elenco.data.length === 0) return { ok: false, errore: 'Scegli almeno un file da caricare.' }
  if (elenco.data.length > MAX_FILE_PER_VOLTA) {
    return { ok: false, errore: `Puoi caricare al massimo ${MAX_FILE_PER_VOLTA} file per volta.` }
  }
  const { persona } = await richiediUtente()
  const max = limiteDocumenti()
  const controllati = elenco.data.map((f) => validaFile(f, max))
  const errori = controllati.flatMap((c) => (c.ok ? [] : [c.errore]))
  if (errori.length) return { ok: false, errore: `Nessun file caricato. ${errori.join(' ')}` }

  try {
    const k = await statoCompito(persona, compito)
    const problema = controllaStato(k)
    if (problema || !k) return { ok: false, errore: problema ?? 'Compito non trovato.' }
    const preparati: FilePreparato[] = []
    for (const [indice, c] of controllati.entries()) {
      if (!c.ok) continue
      const file_id = randomUUID()
      const destinazione = await preparaDestinazione(percorsoDocumento(k.studio_id, compito, file_id), c.tipo, max)
      preparati.push({ indice, file_id, nome: c.nome, tipo: c.tipo, destinazione })
    }
    return { ok: true, dati: { file: preparati } }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Non è stato possibile preparare il caricamento. Riprova.') }
  }
}

const schemaCaricato = z.object({ file_id: id, nome: z.string().max(1000), tipo: z.string().max(200) })

export async function confermaCaricamento(
  compito: string, caricati: FileCaricato[],
): Promise<EsitoAzione<{ registrati: number }>> {
  if (!id.safeParse(compito).success) return { ok: false, errore: 'Compito non valido.' }
  const elenco = z.array(schemaCaricato).max(MAX_FILE_PER_VOLTA).safeParse(caricati)
  if (!elenco.success || elenco.data.length === 0) return { ok: false, errore: 'Nessun file da registrare.' }
  const { persona } = await richiediUtente()
  const max = limiteDocumenti()
  try {
    const k = await statoCompito(persona, compito)
    const problema = controllaStato(k)
    if (problema || !k) return { ok: false, errore: problema ?? 'Compito non trovato.' }

    const idFile = elenco.data.map((f) => f.file_id)
    const giaRegistrati = new Set((await conUtente(persona, (tx) => tx<{ id: string }[]>`
      select id from public.compiti_documenti where id = any(${idFile}::uuid[])`)).map((r) => r.id))

    const errori: string[] = []
    const daRegistrare: { id: string; nome: string; tipo: string; dimensione: number; percorso: string }[] = []
    for (const f of elenco.data) {
      if (giaRegistrati.has(f.file_id)) continue
      const percorso = percorsoDocumento(k.studio_id, compito, f.file_id)
      const info = await infoOggetto(percorso)
      if (!info) {
        errori.push(`«${f.nome}» non è arrivato nello spazio file: riprova a caricarlo.`)
        continue
      }
      // di nuovo tutti i controlli, con la dimensione reale del file
      const v = validaFile({ nome: f.nome, tipo: f.tipo, dimensione: info.dimensione }, max)
      if (!v.ok) {
        errori.push(v.errore)
        continue
      }
      // il file deve essere stato salvato con il tipo previsto (Supabase lo serve con quel tipo)
      if (info.tipo !== undefined && tipoBase(info.tipo) !== tipoBase(tipoPerAnteprima(v.tipo))) {
        await eliminaOggetti([percorso]).catch(() => {})
        errori.push(`«${v.nome}»: il tipo del file inviato non corrisponde a quello dichiarato. Riprova a caricarlo.`)
        continue
      }
      daRegistrare.push({ id: f.file_id, nome: v.nome, tipo: v.tipo, dimensione: info.dimensione, percorso })
    }

    if (daRegistrare.length) {
      await conUtente(persona, async (tx) => {
        for (const d of daRegistrare) {
          await tx`select public.registra_documento(${compito}, ${d.id}, ${d.nome}, ${d.tipo}, ${d.dimensione}, ${d.percorso})`
        }
        await tx`select public.notifica_documenti(${compito}, ${daRegistrare.length})`
      })
      revalidatePath('/', 'layout')
    }
    const n = daRegistrare.length
    const fatto = n === 1 ? '1 documento caricato.' : `${n} documenti caricati.`
    if (errori.length && n === 0) return { ok: false, errore: errori.join(' ') }
    if (n === 0) return { ok: true, messaggio: 'I documenti erano già registrati nel compito.', dati: { registrati: 0 } }
    if (errori.length) return { ok: true, messaggio: `${fatto} Attenzione: ${errori.join(' ')}`, dati: { registrati: n } }
    return { ok: true, messaggio: fatto, dati: { registrati: n } }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'I file sono stati inviati ma non registrati nel compito. Riprova.') }
  }
}
