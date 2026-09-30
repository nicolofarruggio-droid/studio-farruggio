// Analisi con l'AI dal browser: le righe vanno al server a blocchi di 60 (con l'intestazione),
// due blocchi alla volta; ogni risposta è uno stream NDJSON di eventi (avanzamento, righe, fine, errore).
import type { EventoAnalisi } from '@/lib/importazione/analisi'
import type { RigaFile, RigaImport } from '@/lib/importazione/righe'
import { BLOCCHI_IN_PARALLELO, RIGHE_PER_BLOCCO } from '@/lib/importazione/costanti'

export type StatoBlocco = {
  id: number
  numeri: number[]
  stato: 'in_attesa' | 'in_corso' | 'fatto' | 'errore' | 'interrotto'
  /** Righe del blocco già analizzate (anche mentre l'AI scrive). */
  completate: number
  errore?: string
}

export function dividiInBlocchi(righe: RigaFile[], primoId = 0): { stato: StatoBlocco; righe: RigaFile[] }[] {
  const out: { stato: StatoBlocco; righe: RigaFile[] }[] = []
  for (let i = 0; i < righe.length; i += RIGHE_PER_BLOCCO) {
    const parte = righe.slice(i, i + RIGHE_PER_BLOCCO)
    out.push({ stato: { id: primoId + out.length, numeri: parte.map((r) => r.numero), stato: 'in_attesa', completate: 0 }, righe: parte })
  }
  return out
}

type Opzioni = {
  intestazione: string[]
  blocchi: { stato: StatoBlocco; righe: RigaFile[] }[]
  segnale: AbortSignal
  suBlocco: (b: StatoBlocco) => void
  suRighe: (righe: RigaImport[]) => void
  suVuote: (numeri: number[]) => void
}

function messaggio(e: unknown): string {
  if (e instanceof TypeError) return 'Connessione non riuscita. Controlla la rete e riprova.'
  if (e instanceof Error && e.message) return e.message
  return 'Analisi non riuscita. Riprova.'
}

async function eseguiBlocco(o: Opzioni, b: { stato: StatoBlocco; righe: RigaFile[] }) {
  const stato: StatoBlocco = { ...b.stato, stato: 'in_corso', completate: 0, errore: undefined }
  o.suBlocco({ ...stato })
  try {
    const risposta = await fetch('/api/importazione/analizza', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intestazione: o.intestazione, righe: b.righe }),
      signal: o.segnale,
    })
    if (!risposta.ok || !risposta.body) {
      const j = (await risposta.json().catch(() => null)) as { errore?: string } | null
      throw new Error(j?.errore ?? (risposta.status === 401 ? 'Sessione scaduta: accedi di nuovo.' : `Il server ha risposto con un errore (${risposta.status}).`))
    }
    const lettore = risposta.body.pipeThrough(new TextDecoderStream()).getReader()
    let resto = ''
    let finito = false
    for (;;) {
      const { done, value } = await lettore.read()
      if (done) break
      resto += value
      let i: number
      while ((i = resto.indexOf('\n')) >= 0) {
        const linea = resto.slice(0, i).trim()
        resto = resto.slice(i + 1)
        if (!linea) continue
        const ev = JSON.parse(linea) as EventoAnalisi
        if (ev.tipo === 'avanzamento') {
          stato.completate = Math.min(ev.completate, stato.numeri.length)
          o.suBlocco({ ...stato })
        } else if (ev.tipo === 'riga') {
          o.suRighe([ev.riga])
        } else if (ev.tipo === 'fine') {
          o.suRighe(ev.righe)
          if (ev.vuote.length) o.suVuote(ev.vuote)
          stato.completate = stato.numeri.length - ev.mancanti.length
          if (ev.mancanti.length) {
            stato.stato = 'errore'
            stato.errore = `L'AI non ha restituito ${ev.mancanti.length === 1 ? 'la riga' : 'le righe'} ${ev.mancanti.join(', ')}: riprova.`
          } else stato.stato = 'fatto'
          finito = true
        } else if (ev.tipo === 'errore') {
          throw new Error(ev.messaggio)
        }
      }
    }
    if (!finito) throw new Error('La risposta si è interrotta prima della fine. Riprova.')
  } catch (e) {
    if (o.segnale.aborted) stato.stato = 'interrotto'
    else {
      stato.stato = 'errore'
      stato.errore = messaggio(e)
    }
  }
  o.suBlocco({ ...stato })
}

/** Analizza i blocchi, due alla volta. Si ferma (senza perdere le righe già arrivate) quando il segnale viene interrotto. */
export async function analizzaConAI(o: Opzioni): Promise<void> {
  let prossimo = 0
  const lavora = async () => {
    while (!o.segnale.aborted && prossimo < o.blocchi.length) {
      const b = o.blocchi[prossimo++]
      await eseguiBlocco(o, b)
    }
  }
  await Promise.all(Array.from({ length: Math.min(BLOCCHI_IN_PARALLELO, o.blocchi.length) }, lavora))
  // i blocchi mai partiti restano "interrotti"
  for (const b of o.blocchi.slice(prossimo)) o.suBlocco({ ...b.stato, stato: 'interrotto' })
}
