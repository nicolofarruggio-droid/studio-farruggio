import { leggiSessione } from '@/lib/auth/sessione'
import { aiDisponibile } from '@/lib/ai/claude'
import { analizzaBlocco, schemaBlocco, type EventoAnalisi } from '@/lib/importazione/analisi'

// Analisi con l'AI di un blocco di righe del file dei clienti (sezione 6, "Importazione").
// Solo admin. Risposta: stream NDJSON di eventi (avanzamento, righe controllate, fine o errore).

export const maxDuration = 300

const LIMITE_BYTE = 512 * 1024

function errore(status: number, messaggio: string) {
  return Response.json({ errore: messaggio }, { status, headers: { 'cache-control': 'no-store' } })
}

/** Legge il corpo fermandosi oltre il limite (anche senza content-length). */
async function leggiCorpo(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > LIMITE_BYTE) return null
  const lettore = request.body?.getReader()
  if (!lettore) return ''
  const pezzi: Uint8Array[] = []
  let totale = 0
  for (;;) {
    const { done, value } = await lettore.read()
    if (done) break
    totale += value.byteLength
    if (totale > LIMITE_BYTE) {
      await lettore.cancel()
      return null
    }
    pezzi.push(value)
  }
  const tutto = new Uint8Array(totale)
  let pos = 0
  for (const p of pezzi) {
    tutto.set(p, pos)
    pos += p.byteLength
  }
  return new TextDecoder().decode(tutto)
}

/** Richieste da altri siti: rifiutate (come fanno le Server Actions). */
function stessoSito(request: Request): boolean {
  const origine = request.headers.get('origin')
  if (!origine) return true
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origine).host === host
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!stessoSito(request)) return errore(403, 'Richiesta non consentita.')

  const sessione = await leggiSessione()
  if (!sessione || sessione.serveSecondoPassaggio) return errore(401, 'Accesso richiesto.')
  if (!sessione.utente?.attivo || sessione.utente.ruolo !== 'admin') return errore(403, 'Solo gli admin possono importare i clienti.')
  if (!aiDisponibile()) return errore(503, "L'AI non è disponibile: usa «Riconosci le colonne dai nomi».")

  const corpo = await leggiCorpo(request)
  if (corpo == null) return errore(413, 'Blocco troppo grande: riduci le righe o il testo delle celle (massimo 512 KB per richiesta).')
  let json: unknown
  try {
    json = JSON.parse(corpo)
  } catch {
    return errore(400, 'Richiesta non valida.')
  }
  const blocco = schemaBlocco.safeParse(json)
  if (!blocco.success) return errore(400, 'Blocco non valido: al massimo 60 righe e 60 colonne per richiesta.')

  const eventi = analizzaBlocco(blocco.data, sessione.persona, request.signal)
  const codifica = new TextEncoder()
  const riga = (e: EventoAnalisi) => codifica.encode(`${JSON.stringify(e)}\n`)
  const stream = new ReadableStream<Uint8Array>({
    async pull(controllo) {
      try {
        const { value, done } = await eventi.next()
        if (done) controllo.close()
        else controllo.enqueue(riga(value))
      } catch {
        controllo.enqueue(riga({ tipo: 'errore', messaggio: 'Analisi non riuscita. Riprova.' }))
        controllo.close()
      }
    },
    async cancel() {
      await eventi.return(undefined)
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
}
