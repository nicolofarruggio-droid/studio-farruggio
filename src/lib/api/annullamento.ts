import 'server-only'
import { conUtente, type Persona, type Tx } from '@/lib/db'
import { ErroreUtente, messaggioErrore } from '@/lib/errori'
import { motivoNonAnnullabile, descriviValoreIndicatore, etichettaStato } from './registro'

// Annullamento di un'azione dell'agente (sezione 13.4), eseguito dall'admin con le stesse funzioni
// dell'interfaccia. Tutto in una transazione: se il ripristino non riesce, la riga del registro
// resta "non annullata". Prima di ripristinare si controlla che il valore sia ancora quello lasciato
// dall'agente, per non cancellare una modifica fatta dopo da una persona.

type Riga = {
  id: string
  azione: string
  entita: string | null
  entita_id: string | null
  dettagli: Record<string, unknown>
  annullabile: boolean
  annullato_il: Date | null
  attore_ruolo: string | null
  creato_il: Date
}

const MOTIVO = 'Azione dell\'agente annullata dall\'admin'
const aperto = (s: string) => ['assegnato', 'in_lavorazione', 'pronto_revisione'].includes(s)

type ValoreIndicatore = { aggiornato_fino_al: string | null; non_applicabile: boolean }
const stessoIndicatore = (a: ValoreIndicatore | null | undefined, b: ValoreIndicatore | null | undefined) =>
  (a?.aggiornato_fino_al ?? null) === (b?.aggiornato_fino_al ?? null) && (a?.non_applicabile ?? false) === (b?.non_applicabile ?? false)

async function annullaIndicatore(tx: Tx, r: Riga): Promise<string> {
  const d = r.dettagli as { tipo: string; cliente?: string; prima: ValoreIndicatore | null; dopo: ValoreIndicatore }
  const [attuale] = await tx<ValoreIndicatore[]>`
    select aggiornato_fino_al, non_applicabile from public.aggiornamenti_contabili
    where cliente_id = ${r.entita_id} and tipo = ${d.tipo}`
  if (!stessoIndicatore(attuale, d.dopo)) {
    throw new ErroreUtente(`Dopo l'azione dell'agente l'indicatore è stato cambiato di nuovo (ora: ${descriviValoreIndicatore(attuale)}). ` +
      'Per non perdere quella modifica, correggilo a mano dalla scheda del cliente.')
  }
  await tx`select public.imposta_indicatore(${r.entita_id}, ${d.tipo}, ${d.prima?.aggiornato_fino_al ?? null}::date,
    ${d.prima?.non_applicabile ?? false})`
  return `Indicatore ${d.tipo === 'iva' ? 'IVA' : 'prima nota'} di «${d.cliente ?? 'cliente'}» riportato a: ${descriviValoreIndicatore(d.prima)}.`
}

async function statoCompito(tx: Tx, id: string | null): Promise<{ stato: string; titolo: string }> {
  const [k] = await tx<{ stato: string; titolo: string }[]>`select stato, titolo from public.compiti where id = ${id}`
  if (!k) throw new ErroreUtente('Il compito non esiste più.')
  return k
}

async function annullaCreazione(tx: Tx, r: Riga): Promise<string> {
  const k = await statoCompito(tx, r.entita_id)
  if (k.stato === 'annullato') throw new ErroreUtente('Il compito è già annullato.')
  if (k.stato === 'completato') {
    throw new ErroreUtente('Il compito è già stato completato: non si annulla da qui. Se serve, riaprilo e annullalo dalla sua scheda.')
  }
  await tx`select public.cambia_stato_compito(${r.entita_id}, 'annullato', ${MOTIVO})`
  return `Compito «${k.titolo}» annullato.`
}

async function annullaCambioStato(tx: Tx, r: Riga): Promise<string> {
  const d = r.dettagli as { prima: string; dopo: string }
  const k = await statoCompito(tx, r.entita_id)
  if (k.stato !== d.dopo) {
    throw new ErroreUtente(`Dopo l'azione dell'agente lo stato del compito è cambiato di nuovo (ora: ${etichettaStato(k.stato)}). ` +
      'Correggilo a mano dalla scheda del compito.')
  }
  const cambia = (stato: string, motivo: string | null) => tx`select public.cambia_stato_compito(${r.entita_id}, ${stato}, ${motivo})`
  if (!aperto(d.dopo)) {
    // compito chiuso dall'agente: si riapre ("in lavorazione") e, se serve, si riporta allo stato di prima
    await cambia('in_lavorazione', `Riaperto: ${MOTIVO.toLowerCase()}`)
    if (d.prima !== 'in_lavorazione') await cambia(d.prima, null)
  } else if (aperto(d.prima) || d.prima === 'completato') {
    await cambia(d.prima, null)
  } else {
    await cambia('annullato', MOTIVO)
  }
  const extra = d.prima === 'completato' ? ' La data di completamento diventa quella di oggi.' : ''
  return `Compito «${k.titolo}» riportato a «${etichettaStato(d.prima)}».${extra}`
}

type Campi = { titolo: string; descrizione: string; cliente_id: string | null; scadenza: string | null; scadenza_con_orario: boolean; priorita: string }

async function annullaModifica(tx: Tx, r: Riga): Promise<string> {
  const d = r.dettagli as { prima: Record<string, unknown>; dopo: Record<string, unknown> }
  const [k] = await tx<(Omit<Campi, 'scadenza'> & { scadenza: Date | null })[]>`
    select titolo, descrizione, cliente_id, scadenza, scadenza_con_orario, priorita from public.compiti where id = ${r.entita_id}`
  if (!k) throw new ErroreUtente('Il compito non esiste più.')
  const attuali: Campi = { ...k, scadenza: k.scadenza ? new Date(k.scadenza).toISOString() : null }
  const assegnatari = (await tx<{ utente_id: string }[]>`
    select utente_id from public.compiti_assegnatari where compito_id = ${r.entita_id}`).map((x) => x.utente_id).sort()

  // prima di tutto: i valori sono ancora quelli lasciati dall'agente?
  for (const [campo, valore] of Object.entries(d.dopo)) {
    const ora = campo === 'assegnatari' ? assegnatari : attuali[campo as keyof Campi]
    const uguale = campo === 'assegnatari'
      ? JSON.stringify(ora) === JSON.stringify([...(valore as string[])].sort())
      : (ora ?? null) === (valore ?? null)
    if (!uguale) {
      throw new ErroreUtente(`Dopo l'azione dell'agente il compito è stato modificato di nuovo (${campo}). Correggilo a mano dalla sua scheda.`)
    }
  }
  const ripristino: Campi = { ...attuali }
  let campiDaRipristinare = false
  for (const [campo, valore] of Object.entries(d.prima)) {
    if (campo === 'assegnatari') continue
    ;(ripristino as Record<string, unknown>)[campo] = valore
    campiDaRipristinare = true
  }
  if (campiDaRipristinare) {
    await tx`select public.modifica_compito(${r.entita_id}, ${ripristino.titolo}, ${ripristino.descrizione}, ${ripristino.cliente_id},
      ${ripristino.scadenza}::timestamptz, ${ripristino.scadenza_con_orario}, ${ripristino.priorita})`
  }
  if (Array.isArray(d.prima.assegnatari)) {
    await tx`select public.riassegna_compito(${r.entita_id}, ${d.prima.assegnatari as string[]}::uuid[])`
  }
  return `Modifiche dell'agente al compito «${ripristino.titolo}» annullate.`
}

/** Annulla un'azione dell'agente come l'admin indicato. Restituisce un messaggio per l'interfaccia. */
export async function annullaAzioneAgente(admin: Persona, id: string): Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }> {
  try {
    const messaggio = await conUtente(admin, async (tx) => {
      const [r] = await tx<Riga[]>`
        select id, azione, entita, entita_id, dettagli, annullabile, annullato_il, attore_ruolo, creato_il
        from public.registro_attivita where id = ${id}`
      if (!r) throw new ErroreUtente('Azione non trovata.')
      if (r.attore_ruolo !== 'agente') throw new ErroreUtente('Da qui si annullano solo le azioni degli agenti.')
      const motivo = motivoNonAnnullabile(r)
      if (motivo) throw new ErroreUtente(motivo)
      // blocca la riga e la segna annullata (funzione riservata agli admin): due admin non annullano due volte
      await tx`select public.segna_attivita_annullata(${id})`
      switch (r.azione) {
        case 'indicatore_aggiornato':
          return annullaIndicatore(tx, r)
        case 'compito_creato':
          return annullaCreazione(tx, r)
        case 'compito_stato_cambiato':
          return annullaCambioStato(tx, r)
        case 'compito_modificato':
          return annullaModifica(tx, r)
        default:
          throw new ErroreUtente('Questa azione non si può annullare.')
      }
    }, { origine: 'annullamento' })
    return { ok: true, messaggio }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}
