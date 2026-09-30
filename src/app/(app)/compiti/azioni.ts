'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { isoValida, scadenzaDaInput } from '@/lib/date'

// Azioni sui compiti (sezione 8). Ogni permesso lo controllano le funzioni SQL (crea_compito,
// modifica_compito, riassegna_compito, cambia_stato_compito, rimanda_indietro_compito, aggiungi_commento):
// qui si validano i dati e si traducono gli errori in messaggi chiari.

const id = z.guid('Elemento non valido.')

type DatiModulo = {
  titolo: string
  descrizione: string
  cliente: string | null
  assegnatario: string
  scadenza: Date | null
  conOrario: boolean
  priorita: 'normale' | 'alta' | 'urgente'
}

const testo = (fd: FormData, nome: string) => String(fd.get(nome) ?? '').trim()

/** Legge e controlla il modulo "Nuovo compito" / "Modifica compito". */
function leggiModulo(fd: FormData): { ok: true; dati: DatiModulo } | { ok: false; errore: string; campi: Record<string, string> } {
  const campi: Record<string, string> = {}
  const titolo = testo(fd, 'titolo')
  const descrizione = String(fd.get('descrizione') ?? '').replace(/\r\n/g, '\n').trim()
  const cliente = testo(fd, 'cliente')
  const assegnatario = testo(fd, 'assegnatario')
  const nessuna = fd.get('nessuna_scadenza') === 'on'
  const data = testo(fd, 'scadenza_data')
  const ora = testo(fd, 'scadenza_ora')
  const priorita = testo(fd, 'priorita') || 'normale'

  if (!titolo) campi.titolo = 'Scrivi il titolo del compito.'
  else if (titolo.length > 300) campi.titolo = 'Il titolo è troppo lungo (al massimo 300 caratteri).'
  if (descrizione.length > 20000) campi.descrizione = 'La descrizione è troppo lunga.'
  if (cliente && !id.safeParse(cliente).success) campi.cliente = 'Cliente non valido: sceglilo dall\'elenco.'
  if (!assegnatario) campi.assegnatario = 'Scegli il collaboratore a cui assegnare il compito.'
  else if (!id.safeParse(assegnatario).success) campi.assegnatario = 'Collaboratore non valido.'
  let scadenza: Date | null = null
  if (!nessuna) {
    if (!data) campi.scadenza_data = 'Scegli la data di scadenza, oppure spunta "Nessuna scadenza".'
    else if (!isoValida(data)) campi.scadenza_data = 'Data non valida.'
    else if (ora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(ora)) campi.scadenza_ora = 'Ora non valida (per esempio 17:30).'
    else scadenza = scadenzaDaInput(data, ora || null)
  }
  if (!['normale', 'alta', 'urgente'].includes(priorita)) campi.priorita = 'Priorità non valida.'

  if (Object.keys(campi).length) return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  return {
    ok: true,
    dati: {
      titolo, descrizione, cliente: cliente || null, assegnatario, scadenza,
      conOrario: !!scadenza && !!ora, priorita: priorita as DatiModulo['priorita'],
    },
  }
}

/** Nuovo compito: public.crea_compito. Restituisce l'id; il browser carica gli eventuali file e apre la scheda. */
export async function creaCompito(_prima: unknown, fd: FormData): Promise<EsitoAzione<{ id: string }>> {
  const { persona } = await richiediUtente()
  const m = leggiModulo(fd)
  if (!m.ok) return m
  const d = m.dati
  try {
    const nuovo = await conUtente(persona, async (tx) => {
      const [r] = await tx<{ id: string }[]>`
        select public.crea_compito(${d.titolo}, ${d.descrizione}, ${d.cliente}, ${[d.assegnatario]}::uuid[],
          ${d.scadenza}, ${d.conOrario}, ${d.priorita}) as id`
      return r.id
    })
    revalidatePath('/', 'layout')
    return { ok: true, messaggio: 'Compito creato.', dati: { id: nuovo } }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}

/** Modifica: public.modifica_compito e, se cambia l'assegnatario, public.riassegna_compito (stessa transazione). */
export async function modificaCompito(_prima: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona } = await richiediUtente()
  const compito = testo(fd, 'compito')
  if (!id.safeParse(compito).success) return { ok: false, errore: 'Compito non valido.' }
  const m = leggiModulo(fd)
  if (!m.ok) return m
  const d = m.dati
  const assegnatarioPrima = testo(fd, 'assegnatario_iniziale')
  try {
    await conUtente(persona, async (tx) => {
      await tx`select public.modifica_compito(${compito}, ${d.titolo}, ${d.descrizione}, ${d.cliente},
        ${d.scadenza}, ${d.conOrario}, ${d.priorita})`
      if (d.assegnatario !== assegnatarioPrima) {
        await tx`select public.riassegna_compito(${compito}, ${[d.assegnatario]}::uuid[])`
      }
    })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  redirect(`/compiti/${compito}?esito=modificato`)
}

const AZIONI_STATO = {
  inizia: { stato: 'in_lavorazione', messaggio: 'Hai iniziato a lavorare sul compito: ora è "In lavorazione".' },
  pronto: { stato: 'pronto_revisione', messaggio: 'Compito segnato "Pronto per revisione": chi l\'ha assegnato riceve una notifica.' },
  torna: { stato: 'in_lavorazione', messaggio: 'Il compito è tornato "In lavorazione".' },
  chiudi: { stato: 'completato', messaggio: 'Compito chiuso: ora è "Completato". I documenti restano consultabili.' },
  annulla: { stato: 'annullato', messaggio: 'Compito annullato. Il motivo resta nella cronologia.' },
  riapri: { stato: 'in_lavorazione', messaggio: 'Compito riaperto: ora è "In lavorazione".' },
} as const

const schemaStato = z.object({
  compito: id,
  azione: z.enum(Object.keys(AZIONI_STATO) as [keyof typeof AZIONI_STATO, ...(keyof typeof AZIONI_STATO)[]]),
  motivo: z.string().max(5000, 'Il testo è troppo lungo.').optional(),
})

/** Cambio di stato con pulsanti espliciti: inizia, pronto, torna in lavorazione, chiudi, annulla, riapri. */
export async function cambiaStatoCompito(input: z.infer<typeof schemaStato>): Promise<EsitoAzione> {
  const v = schemaStato.safeParse(input)
  if (!v.success) return { ok: false, errore: v.error.issues[0]?.message ?? 'Richiesta non valida.' }
  const { compito, azione } = v.data
  const motivo = v.data.motivo?.trim() || null
  if (azione === 'annulla' && !motivo) return { ok: false, errore: 'Scrivi il motivo dell\'annullamento.', campi: { motivo: 'Il motivo è obbligatorio.' } }
  const { persona } = await richiediUtente()
  try {
    await conUtente(persona, (tx) => tx`select public.cambia_stato_compito(${compito}, ${AZIONI_STATO[azione].stato}, ${motivo})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: AZIONI_STATO[azione].messaggio }
}

const schemaRimando = z.object({ compito: id, motivo: z.string().max(5000, 'La spiegazione è troppo lunga.').optional() })

/** "Rimanda indietro" un compito pronto per revisione, con la spiegazione (facoltativa ma consigliata). */
export async function rimandaIndietroCompito(input: z.infer<typeof schemaRimando>): Promise<EsitoAzione> {
  const v = schemaRimando.safeParse(input)
  if (!v.success) return { ok: false, errore: v.error.issues[0]?.message ?? 'Richiesta non valida.' }
  const { persona } = await richiediUtente()
  try {
    await conUtente(persona, (tx) => tx`select public.rimanda_indietro_compito(${v.data.compito}, ${v.data.motivo?.trim() || null})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Compito rimandato indietro: torna "In lavorazione" e chi ci lavora riceve la tua spiegazione.' }
}

/** Nuovo commento (public.aggiungi_commento). */
export async function aggiungiCommento(_prima: unknown, fd: FormData): Promise<EsitoAzione> {
  const compito = testo(fd, 'compito')
  const commento = String(fd.get('testo') ?? '').replace(/\r\n/g, '\n').trim()
  if (!id.safeParse(compito).success) return { ok: false, errore: 'Compito non valido.' }
  if (!commento) return { ok: false, errore: 'Il commento è vuoto.', campi: { testo: 'Scrivi il commento.' } }
  if (commento.length > 10000) return { ok: false, errore: 'Il commento è troppo lungo.', campi: { testo: 'Al massimo 10.000 caratteri.' } }
  const { persona } = await richiediUtente()
  try {
    await conUtente(persona, (tx) => tx`select public.aggiungi_commento(${compito}, ${commento})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath(`/compiti/${compito}`)
  return { ok: true, messaggio: 'Commento aggiunto.' }
}
