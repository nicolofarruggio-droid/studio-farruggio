// Scrittura dei clienti importati (sezione 6). Gira dentro la transazione dell'utente (conUtente con
// origine "importazione"): valgono le regole RLS e le funzioni SQL dei permessi. Le query passano da un
// esecutore generico, così la stessa logica si prova sul database in memoria (tests/db/importazione.test.ts).
import { z } from 'zod'
import { isoValida } from '@/lib/date'
import { nomeUnico, nomeVisualizzazione } from '@/lib/clienti/nome'
import { emailValida, ePec, pulisci } from './normalizza'

export type Esegui = <T = Record<string, unknown>>(sql: string, parametri?: unknown[]) => Promise<T[]>

const testo = (max: number) => z.string().max(max * 4).nullable().optional()

/** Una riga dell'anteprima confermata dall'admin (ricontrollata qui: il browser non è affidabile). */
export const schemaRigaConferma = z.object({
  riga: z.number().int().min(1),
  nome_azienda: z.string().max(2000),
  titolari: z.array(z.object({ nome: z.string().max(400), cognome: z.string().max(400) })).max(20),
  email: z.array(z.object({ indirizzo: z.string().max(400), tipo: z.enum(['ordinaria', 'pec']) })).max(50),
  prima_nota: z.string().max(20).nullable(),
  iva: z.string().max(20).nullable(),
  numero_dipendenti: z.number().nullable(),
  fatturato: z.number().nullable(),
  collaboratore_id: z.string().nullable(),
  partita_iva: testo(20),
  codice_fiscale: testo(20),
  telefono: testo(40),
})
export type RigaConferma = z.infer<typeof schemaRigaConferma>

export type RigaPronta = {
  riga: number
  ragione_sociale: string
  titolari: { nome: string; cognome: string }[]
  email: { indirizzo: string; tipo: 'ordinaria' | 'pec' }[]
  prima_nota: string | null
  iva: string | null
  numero_dipendenti: number | null
  fatturato: number | null
  collaboratore_id: string | null
  partita_iva: string | null
  codice_fiscale: string | null
  telefono: string | null
}

export type Saltata = { riga: number; motivo: string }
export type Importata = { riga: number; id: string; nome: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ricontrolla una riga: dati puliti, oppure il motivo per cui non si importa. */
export function controllaRiga(grezza: unknown): { ok: true; riga: RigaPronta } | { ok: false; saltata: Saltata } {
  const numero = typeof (grezza as { riga?: unknown })?.riga === 'number' ? (grezza as { riga: number }).riga : 0
  const salta = (motivo: string) => ({ ok: false as const, saltata: { riga: numero, motivo } })
  const p = schemaRigaConferma.safeParse(grezza)
  if (!p.success) return salta('Dati della riga non validi')
  const r = p.data
  const ragione = pulisci(r.nome_azienda)
  if (!ragione) return salta('Ragione sociale mancante')
  if (ragione.length > 300) return salta('Ragione sociale troppo lunga')
  const email: RigaPronta['email'] = []
  for (const e of r.email) {
    const indirizzo = e.indirizzo.trim().toLowerCase()
    if (!emailValida(indirizzo)) return salta(`Email non valida: ${e.indirizzo}`)
    if (email.some((x) => x.indirizzo === indirizzo)) continue
    email.push({ indirizzo, tipo: e.tipo === 'pec' || ePec(indirizzo) ? 'pec' : 'ordinaria' })
  }
  for (const [d, nome] of [[r.prima_nota, 'prima nota'], [r.iva, 'IVA']] as const) {
    if (d != null && !isoValida(d)) return salta(`Data ${nome} non valida`)
  }
  if (r.numero_dipendenti != null && (!Number.isInteger(r.numero_dipendenti) || r.numero_dipendenti < 0 || r.numero_dipendenti > 1_000_000))
    return salta('Numero di dipendenti non valido')
  if (r.fatturato != null && (!Number.isFinite(r.fatturato) || r.fatturato < 0 || r.fatturato > 1e13)) return salta('Fatturato non valido')
  const titolari = r.titolari
    .map((t) => ({ nome: pulisci(t.nome).slice(0, 100), cognome: pulisci(t.cognome).slice(0, 100) }))
    .filter((t) => t.nome || t.cognome)
    .slice(0, 10)
  const campo = (v: string | null | undefined, max: number) => pulisci(v).slice(0, max) || null
  return {
    ok: true,
    riga: {
      riga: r.riga,
      ragione_sociale: ragione,
      titolari,
      email,
      prima_nota: r.prima_nota,
      iva: r.iva,
      numero_dipendenti: r.numero_dipendenti,
      fatturato: r.fatturato == null ? null : Math.round(r.fatturato * 100) / 100,
      collaboratore_id: r.collaboratore_id && UUID.test(r.collaboratore_id) ? r.collaboratore_id : null,
      partita_iva: campo(r.partita_iva, 20),
      codice_fiscale: campo(r.codice_fiscale, 20)?.toUpperCase() ?? null,
      telefono: campo(r.telefono, 40),
    },
  }
}

/**
 * Crea i clienti di un blocco (al massimo ~100) nella transazione corrente: anagrafica con nome di
 * visualizzazione unico, titolari (il primo è il principale), email, indicatori con imposta_indicatore
 * (lo storico li registra come valore iniziale, origine "importazione") e referente con assegna_referente.
 */
export async function scriviClienti(
  esegui: Esegui,
  righe: RigaPronta[],
  opzioni: { collaboratori: ReadonlySet<string>; dettagliRegistro: Record<string, unknown> },
): Promise<{ importate: Importata[]; senzaCollaboratore: number[] }> {
  if (!righe.length) return { importate: [], senzaCollaboratore: [] }
  const usati = new Set(
    (
      await esegui<{ n: string }>(`
        select lower(nome_visualizzazione) as n from public.clienti
        union
        select lower(nome_visualizzazione) from public.clienti_nel_cestino()`)
    ).map((r) => r.n),
  )
  const clienti = righe.map((r) => ({
    ...r,
    id: crypto.randomUUID(),
    nome_visualizzazione: nomeUnico(nomeVisualizzazione(r.ragione_sociale, r.titolari[0]).slice(0, 380), usati),
  }))

  await esegui(
    `insert into public.clienti (id, studio_id, ragione_sociale, nome_visualizzazione, telefono, codice_fiscale,
                                 partita_iva, numero_dipendenti, fatturato, creato_da)
     select x.id, public.mio_studio(), x.ragione_sociale, x.nome_visualizzazione, x.telefono, x.codice_fiscale,
            x.partita_iva, x.numero_dipendenti, x.fatturato, auth.uid()
     from json_to_recordset($1::text::json) as x(id uuid, ragione_sociale text, nome_visualizzazione text, telefono text,
                                          codice_fiscale text, partita_iva text, numero_dipendenti integer, fatturato numeric)`,
    [JSON.stringify(clienti.map((c) => ({
      id: c.id, ragione_sociale: c.ragione_sociale, nome_visualizzazione: c.nome_visualizzazione, telefono: c.telefono,
      codice_fiscale: c.codice_fiscale, partita_iva: c.partita_iva, numero_dipendenti: c.numero_dipendenti, fatturato: c.fatturato,
    })))],
  )

  const titolari = clienti.flatMap((c) => c.titolari.map((t, i) => ({ cliente_id: c.id, nome: t.nome, cognome: t.cognome, principale: i === 0, ordine: i })))
  if (titolari.length)
    await esegui(
      `insert into public.clienti_titolari (studio_id, cliente_id, nome, cognome, principale, ordine)
       select public.mio_studio(), x.cliente_id, x.nome, x.cognome, x.principale, x.ordine
       from json_to_recordset($1::text::json) as x(cliente_id uuid, nome text, cognome text, principale boolean, ordine integer)`,
      [JSON.stringify(titolari)],
    )

  const email = clienti.flatMap((c) => c.email.map((e) => ({ cliente_id: c.id, indirizzo: e.indirizzo, tipo: e.tipo })))
  if (email.length)
    await esegui(
      `insert into public.clienti_email (studio_id, cliente_id, indirizzo, tipo, creato_da)
       select public.mio_studio(), x.cliente_id, x.indirizzo, x.tipo, auth.uid()
       from json_to_recordset($1::text::json) as x(cliente_id uuid, indirizzo text, tipo text)`,
      [JSON.stringify(email)],
    )

  const indicatori = clienti.flatMap((c) => [
    ...(c.prima_nota ? [{ cliente_id: c.id, tipo: 'prima_nota', data: c.prima_nota }] : []),
    ...(c.iva ? [{ cliente_id: c.id, tipo: 'iva', data: c.iva }] : []),
  ])
  if (indicatori.length)
    await esegui(
      `select public.imposta_indicatore(x.cliente_id, x.tipo, x.data, false)
       from json_to_recordset($1::text::json) as x(cliente_id uuid, tipo text, data date)`,
      [JSON.stringify(indicatori)],
    )

  // referente: una chiamata per collaboratore; gli id non validi (non dello studio o non attivi) si ignorano
  const senzaCollaboratore: number[] = []
  const perCollaboratore = new Map<string, string[]>()
  for (const c of clienti) {
    if (!c.collaboratore_id) continue
    if (!opzioni.collaboratori.has(c.collaboratore_id)) {
      senzaCollaboratore.push(c.riga)
      continue
    }
    perCollaboratore.set(c.collaboratore_id, [...(perCollaboratore.get(c.collaboratore_id) ?? []), c.id])
  }
  for (const [utente, ids] of perCollaboratore)
    await esegui(
      `select public.assegna_referente(array(select json_array_elements_text($1::text::json)::uuid), $2::uuid)`,
      [JSON.stringify(ids), utente],
    )

  await esegui(`select public.registra_attivita('clienti_importati', 'cliente', null, $1::text::jsonb)`, [
    JSON.stringify({ numero: clienti.length, ...opzioni.dettagliRegistro }),
  ])
  return { importate: clienti.map((c) => ({ riga: c.riga, id: c.id, nome: c.nome_visualizzazione })), senzaCollaboratore }
}

/**
 * Assegnazioni cliente-collaboratore da file: il collaboratore diventa il referente principale
 * (assegna_referente, che conserva lo storico). Salta le coppie già in essere.
 */
export async function scriviAssegnazioni(
  esegui: Esegui,
  coppie: { cliente_id: string; utente_id: string }[],
  dettagliRegistro: Record<string, unknown>,
): Promise<{ assegnate: number; invariate: number }> {
  const attuali = new Map(
    (
      await esegui<{ cliente_id: string; utente_id: string }>(
        `select cliente_id::text, utente_id::text from public.assegnazioni
         where al is null and referente_principale and cliente_id = any(array(select json_array_elements_text($1::text::json)::uuid))`,
        [JSON.stringify(coppie.map((c) => c.cliente_id))],
      )
    ).map((r) => [r.cliente_id, r.utente_id]),
  )
  const perCollaboratore = new Map<string, string[]>()
  let invariate = 0
  const visti = new Set<string>()
  for (const c of coppie) {
    if (visti.has(c.cliente_id)) continue
    visti.add(c.cliente_id)
    if (attuali.get(c.cliente_id) === c.utente_id) {
      invariate++
      continue
    }
    perCollaboratore.set(c.utente_id, [...(perCollaboratore.get(c.utente_id) ?? []), c.cliente_id])
  }
  let assegnate = 0
  for (const [utente, ids] of perCollaboratore) {
    await esegui(`select public.assegna_referente(array(select json_array_elements_text($1::text::json)::uuid), $2::uuid)`, [JSON.stringify(ids), utente])
    assegnate += ids.length
  }
  if (assegnate)
    await esegui(`select public.registra_attivita('assegnazioni_importate', 'cliente', null, $1::text::jsonb)`, [
      JSON.stringify({ numero: assegnate, ...dettagliRegistro }),
    ])
  return { assegnate, invariate }
}
