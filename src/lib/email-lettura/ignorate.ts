import 'server-only'
import { conUtente, type Persona } from '@/lib/db'
import { clientePerCasella } from './casella'
import { leggiIntestazioni } from './messaggi'
import { aGruppi } from './motore'
import { ErroreNonTrovato } from './tipi'

// "Email ignorate di recente" (sezione 16.3, punto 8). Nel database delle email ignorate c'è solo
// l'identificativo Gmail: mittente, oggetto e data si leggono dal vivo da Gmail, SOLO dalle intestazioni,
// e non si salvano. Così l'utente può collegare a un cliente un mittente che non era riconosciuto.

export const GIORNI_IGNORATE = 14
export const MAX_IGNORATE = 20

export type EmailIgnorata = { gmailId: string; oggetto: string; data: Date }
export type MittenteIgnorato = { indirizzo: string; email: EmailIgnorata[] }

export type EsitoIgnorate =
  | { stato: 'ok'; mittenti: MittenteIgnorato[]; senzaIndirizzo: number }
  | { stato: 'errore' }

export async function emailIgnorateRecenti(persona: Persona): Promise<EsitoIgnorate> {
  // con le regole dell'utente: solo la propria casella e le proprie email
  const dati = await conUtente(persona, async (tx) => {
    const [c] = await tx<{ id: string; collegata_il: Date | null }[]>`
      select id, collegata_il from public.caselle_email where utente_id = ${persona.id} and stato = 'collegata'`
    if (!c) return null
    const righe = await tx<{ gmail_id: string }[]>`
      select gmail_id from public.email_elaborate
      where casella_id = ${c.id} and esito = 'ignorata' and elaborata_il > now() - make_interval(days => ${GIORNI_IGNORATE})
      order by elaborata_il desc
      limit ${MAX_IGNORATE}`
    return { casella: c, ids: righe.map((r) => r.gmail_id) }
  })
  if (!dati || !dati.ids.length) return { stato: 'ok', mittenti: [], senzaIndirizzo: 0 }

  try {
    const gmail = await clientePerCasella(dati.casella.id)
    const lette: { gmailId: string; mittente: string | null; oggetto: string; data: Date }[] = []
    let problemi = 0
    await aGruppi(dati.ids, 5, async (id) => {
      try {
        const h = leggiIntestazioni(await gmail.messaggio(id, 'metadata'))
        const collegata = dati.casella.collegata_il ? new Date(dati.casella.collegata_il).getTime() : 0
        // solo email arrivate dopo il collegamento e ancora fuori da spam e cestino
        const esclusa = h.etichette.some((x) => x === 'SPAM' || x === 'TRASH' || x === 'DRAFT')
        if (!esclusa && h.ricevutaIl.getTime() >= collegata) lette.push({ gmailId: id, mittente: h.mittente, oggetto: h.oggetto, data: h.ricevutaIl })
      } catch (e) {
        if (!(e instanceof ErroreNonTrovato)) problemi++
      }
    })
    if (problemi && !lette.length) return { stato: 'errore' }
    const perMittente = new Map<string, EmailIgnorata[]>()
    let senzaIndirizzo = 0
    for (const e of lette.sort((a, b) => b.data.getTime() - a.data.getTime())) {
      if (!e.mittente) {
        senzaIndirizzo++
        continue
      }
      const lista = perMittente.get(e.mittente) ?? []
      lista.push({ gmailId: e.gmailId, oggetto: e.oggetto, data: e.data })
      perMittente.set(e.mittente, lista)
    }
    return {
      stato: 'ok',
      mittenti: [...perMittente.entries()].map(([indirizzo, email]) => ({ indirizzo, email })),
      senzaIndirizzo,
    }
  } catch {
    return { stato: 'errore' }
  }
}
