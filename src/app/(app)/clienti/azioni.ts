'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conUtente, type Tx } from '@/lib/db'
import { richiediAdmin, richiediUtente } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { nomeUnico, nomeVisualizzazione, pulisciSpazi } from '@/lib/clienti/nome'
import { jsonDaClaude, aiDisponibile, ErroreAI } from '@/lib/ai/claude'
import { isoValida, oggiISO, scadenzaDaInput } from '@/lib/date'
import { leggiImporto } from '@/lib/numeri'
import { eliminaFileDocumenti } from '@/lib/clienti/file'

const uuid = z.string().uuid()
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ---------------------------------------------------------------------------
// Assegnazioni ed eliminazione in blocco (elenco clienti)
// ---------------------------------------------------------------------------
export async function assegnaClienti(clienti: string[], utente: string): Promise<EsitoAzione> {
  const d = z.object({ clienti: z.array(uuid).min(1).max(1000), utente: uuid }).safeParse({ clienti, utente })
  if (!d.success) return { ok: false, errore: 'Selezione non valida.' }
  const { persona } = await richiediAdmin()
  try {
    await conUtente(persona, (tx) => tx`select public.assegna_referente(${d.data.clienti}::uuid[], ${d.data.utente})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: d.data.clienti.length === 1 ? 'Cliente assegnato.' : `${d.data.clienti.length} clienti assegnati.` }
}

export async function eliminaClienti(clienti: string[]): Promise<EsitoAzione> {
  const d = z.array(uuid).min(1).max(1000).safeParse(clienti)
  if (!d.success) return { ok: false, errore: 'Selezione non valida.' }
  const { persona } = await richiediAdmin()
  try {
    const [{ n }] = await conUtente(persona, (tx) => tx<{ n: number }[]>`select public.elimina_clienti(${d.data}::uuid[]) as n`)
    revalidatePath('/', 'layout')
    return { ok: true, messaggio: n === 1 ? 'Cliente eliminato: resta nel cestino per 30 giorni.' : `${n} clienti eliminati: restano nel cestino per 30 giorni.` }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}

// ---------------------------------------------------------------------------
// Anagrafica: nuovo cliente e modifica (solo admin)
// ---------------------------------------------------------------------------
const testo = (max: number) => z.string().trim().max(max).transform((s) => (s === '' ? null : pulisciSpazi(s)))

const schemaAnagrafica = z.object({
  ragione_sociale: z.string().trim().min(1, 'Scrivi la ragione sociale').max(300),
  nome_visualizzazione: z.string().trim().max(400).optional(),
  telefono: testo(50),
  codice_fiscale: testo(20).transform((s) => s?.toUpperCase() ?? null),
  partita_iva: testo(20).transform((s) => s?.replace(/\s/g, '').toUpperCase() ?? null),
  numero_dipendenti: z.string().trim().transform((s, ctx) => {
    if (s === '') return null
    const n = Number(s)
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Numero di dipendenti non valido' })
      return z.NEVER
    }
    return n
  }),
  fatturato: z.string().trim().transform((s, ctx) => {
    if (s === '') return null
    const n = leggiImporto(s)
    if (n === null || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Importo non valido' })
      return z.NEVER
    }
    return Math.round(n * 100) / 100
  }),
  note: z.string().max(10000).transform((s) => s.trim() || null),
  alias: z.string().max(2000).transform((s) => s.split('\n').map(pulisciSpazi).filter(Boolean)),
  titolari: z.array(z.object({ nome: z.string().trim().max(100), cognome: z.string().trim().max(100) }))
    .transform((t) => t.filter((x) => x.nome || x.cognome)),
  email: z.array(z.object({ indirizzo: z.string().trim().toLowerCase().max(254), tipo: z.enum(['ordinaria', 'pec']) }))
    .transform((e) => e.filter((x) => x.indirizzo)),
  referente: z.string().optional(),
  stato: z.enum(['attivo', 'archiviato']).optional(),
})

function leggiAnagrafica(fd: FormData) {
  const titolari = fd.getAll('titolare_nome').map((nome, i) => ({ nome: String(nome), cognome: String(fd.getAll('titolare_cognome')[i] ?? '') }))
  const email = fd.getAll('email_indirizzo').map((indirizzo, i) => ({ indirizzo: String(indirizzo), tipo: String(fd.getAll('email_tipo')[i] ?? 'ordinaria') }))
  return schemaAnagrafica.safeParse({
    ragione_sociale: fd.get('ragione_sociale') ?? '',
    nome_visualizzazione: (fd.get('nome_visualizzazione') as string | null) ?? undefined,
    telefono: fd.get('telefono') ?? '',
    codice_fiscale: fd.get('codice_fiscale') ?? '',
    partita_iva: fd.get('partita_iva') ?? '',
    numero_dipendenti: fd.get('numero_dipendenti') ?? '',
    fatturato: fd.get('fatturato') ?? '',
    note: fd.get('note') ?? '',
    alias: fd.get('alias') ?? '',
    titolari,
    email,
    referente: (fd.get('referente') as string | null) || undefined,
    stato: (fd.get('stato') as string | null) || undefined,
  })
}

function erroriCampi(e: z.ZodError) {
  const campi: Record<string, string> = {}
  for (const i of e.issues) campi[String(i.path[0])] ??= i.message
  return campi
}

async function scriviTitolariEdEmail(tx: Tx, studio: string, cliente: string, titolari: { nome: string; cognome: string }[], email: { indirizzo: string; tipo: string }[], persona: string) {
  await tx`delete from public.clienti_titolari where cliente_id = ${cliente}`
  for (const [i, t] of titolari.entries()) {
    await tx`insert into public.clienti_titolari (studio_id, cliente_id, nome, cognome, principale, ordine)
             values (${studio}, ${cliente}, ${t.nome}, ${t.cognome}, ${i === 0}, ${i})`
  }
  const attuali = await tx<{ indirizzo: string }[]>`select indirizzo from public.clienti_email where cliente_id = ${cliente}`
  const nuovi = new Map(email.map((e) => [e.indirizzo, e.tipo]))
  for (const a of attuali) if (!nuovi.has(a.indirizzo)) await tx`delete from public.clienti_email where cliente_id = ${cliente} and indirizzo = ${a.indirizzo}`
  for (const [indirizzo, tipo] of nuovi) {
    if (attuali.some((a) => a.indirizzo === indirizzo)) {
      await tx`update public.clienti_email set tipo = ${tipo} where cliente_id = ${cliente} and indirizzo = ${indirizzo}`.catch(() => {})
    } else {
      await tx`insert into public.clienti_email (studio_id, cliente_id, indirizzo, tipo, creato_da) values (${studio}, ${cliente}, ${indirizzo}, ${tipo}, ${persona})`
    }
  }
}

function controllaEmail(email: { indirizzo: string }[]): string | null {
  const non = email.find((e) => !REGEX_EMAIL.test(e.indirizzo))
  if (non) return `Indirizzo email non valido: ${non.indirizzo}`
  const visti = new Set<string>()
  for (const e of email) {
    if (visti.has(e.indirizzo)) return `Indirizzo ripetuto: ${e.indirizzo}`
    visti.add(e.indirizzo)
  }
  return null
}

export async function creaCliente(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona, studio } = await richiediAdmin()
  const d = leggiAnagrafica(fd)
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: erroriCampi(d.error) }
  const erroreEmail = controllaEmail(d.data.email)
  if (erroreEmail) return { ok: false, errore: erroreEmail, campi: { email: erroreEmail } }
  let id: string
  try {
    id = await conUtente(persona, async (tx) => {
      // il nome deve essere unico anche rispetto ai clienti nel cestino (l'indice unico li comprende)
      const usati = new Set((await tx<{ n: string }[]>`
        select lower(nome_visualizzazione) as n from public.clienti
        union select lower(nome_visualizzazione) from public.clienti_nel_cestino()`).map((r) => r.n))
      const nome = nomeUnico(nomeVisualizzazione(d.data.ragione_sociale, d.data.titolari[0]), usati)
      const [c] = await tx<{ id: string }[]>`
        insert into public.clienti (studio_id, ragione_sociale, nome_visualizzazione, telefono, codice_fiscale, partita_iva,
          numero_dipendenti, fatturato, note, alias, creato_da)
        values (${studio.id}, ${pulisciSpazi(d.data.ragione_sociale)}, ${nome}, ${d.data.telefono}, ${d.data.codice_fiscale},
          ${d.data.partita_iva}, ${d.data.numero_dipendenti}, ${d.data.fatturato}, ${d.data.note}, ${d.data.alias}, ${persona.id})
        returning id`
      await scriviTitolariEdEmail(tx, studio.id, c.id, d.data.titolari, d.data.email, persona.id)
      if (d.data.referente) await tx`select public.assegna_referente(${[c.id]}::uuid[], ${d.data.referente})`
      await tx`select public.registra_attivita('cliente_creato', 'cliente', ${c.id}, ${tx.json({ nome })})`
      return c.id
    })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  redirect(`/clienti/${id}?creato=1`)
}

export async function modificaCliente(id: string, _: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona, studio } = await richiediAdmin()
  if (!uuid.safeParse(id).success) return { ok: false, errore: 'Cliente non valido.' }
  const d = leggiAnagrafica(fd)
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: erroriCampi(d.error) }
  const erroreEmail = controllaEmail(d.data.email)
  if (erroreEmail) return { ok: false, errore: erroreEmail, campi: { email: erroreEmail } }
  const nomeVis = pulisciSpazi(d.data.nome_visualizzazione ?? '')
  if (!nomeVis) return { ok: false, errore: 'Il nome di visualizzazione è obbligatorio.', campi: { nome_visualizzazione: 'Obbligatorio' } }
  try {
    await conUtente(persona, async (tx) => {
      const [prima] = await tx<{ stato: string }[]>`select stato from public.clienti where id = ${id}`
      if (!prima) throw Object.assign(new Error('Cliente non trovato'), { code: 'P0002' })
      await tx`
        update public.clienti set ragione_sociale = ${pulisciSpazi(d.data.ragione_sociale)}, nome_visualizzazione = ${nomeVis},
          telefono = ${d.data.telefono}, codice_fiscale = ${d.data.codice_fiscale}, partita_iva = ${d.data.partita_iva},
          numero_dipendenti = ${d.data.numero_dipendenti}, fatturato = ${d.data.fatturato}, note = ${d.data.note},
          alias = ${d.data.alias}, stato = ${d.data.stato ?? prima.stato}
        where id = ${id}`
      await scriviTitolariEdEmail(tx, studio.id, id, d.data.titolari, d.data.email, persona.id)
      await tx`select public.registra_attivita(${d.data.stato && d.data.stato !== prima.stato ? (d.data.stato === 'archiviato' ? 'cliente_archiviato' : 'cliente_riattivato') : 'cliente_modificato'}, 'cliente', ${id})`
    })
  } catch (e) {
    const err = e as { code?: string }
    if (err.code === '23505') return { ok: false, errore: 'Esiste già un cliente con questo nome di visualizzazione.', campi: { nome_visualizzazione: 'Già usato' } }
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  redirect(`/clienti/${id}?salvato=1`)
}

export async function impostaStatoCliente(id: string, stato: 'attivo' | 'archiviato'): Promise<EsitoAzione> {
  if (!uuid.safeParse(id).success || !['attivo', 'archiviato'].includes(stato)) return { ok: false, errore: 'Dati non validi.' }
  const { persona } = await richiediAdmin()
  try {
    await conUtente(persona, async (tx) => {
      await tx`update public.clienti set stato = ${stato} where id = ${id}`
      await tx`select public.registra_attivita(${stato === 'archiviato' ? 'cliente_archiviato' : 'cliente_riattivato'}, 'cliente', ${id})`
    })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: stato === 'archiviato' ? 'Cliente archiviato.' : 'Cliente riattivato.' }
}

// ---------------------------------------------------------------------------
// Collaboratori assegnati (solo admin)
// ---------------------------------------------------------------------------
export async function cambiaReferente(cliente: string, utente: string | null): Promise<EsitoAzione> {
  if (!uuid.safeParse(cliente).success || (utente !== null && !uuid.safeParse(utente).success)) return { ok: false, errore: 'Dati non validi.' }
  const { persona } = await richiediAdmin()
  try {
    await conUtente(persona, (tx) => tx`select public.assegna_referente(${[cliente]}::uuid[], ${utente})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath(`/clienti/${cliente}`)
  return { ok: true, messaggio: utente ? 'Referente aggiornato.' : 'Referente tolto.' }
}

export async function impostaCollaboratoreAggiuntivo(cliente: string, utente: string, assegnato: boolean): Promise<EsitoAzione> {
  if (!uuid.safeParse(cliente).success || !uuid.safeParse(utente).success) return { ok: false, errore: 'Dati non validi.' }
  const { persona } = await richiediAdmin()
  try {
    await conUtente(persona, (tx) => tx`select public.imposta_collaboratore_aggiuntivo(${cliente}, ${utente}, ${assegnato})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath(`/clienti/${cliente}`)
  return { ok: true, messaggio: assegnato ? 'Collaboratore aggiunto.' : 'Collaboratore tolto.' }
}

// ---------------------------------------------------------------------------
// Indirizzi email collegati (admin e chi lavora sul cliente, sezione 16.1)
// ---------------------------------------------------------------------------
export async function aggiungiEmailCliente(cliente: string, _: unknown, fd: FormData): Promise<EsitoAzione> {
  if (!uuid.safeParse(cliente).success) return { ok: false, errore: 'Cliente non valido.' }
  const { persona, studio } = await richiediUtente()
  const indirizzo = String(fd.get('indirizzo') ?? '').trim().toLowerCase()
  const tipo = fd.get('tipo') === 'pec' ? 'pec' : 'ordinaria'
  if (!REGEX_EMAIL.test(indirizzo)) return { ok: false, errore: 'Indirizzo email non valido.', campi: { indirizzo: 'Formato non valido' } }
  try {
    const altri = await conUtente(persona, async (tx) => {
      const [gia] = await tx`select 1 from public.clienti_email where cliente_id = ${cliente} and indirizzo = ${indirizzo}`
      if (gia) throw Object.assign(new Error('Questo indirizzo è già collegato al cliente.'), { code: 'P0001' })
      await tx`insert into public.clienti_email (studio_id, cliente_id, indirizzo, tipo, creato_da) values (${studio.id}, ${cliente}, ${indirizzo}, ${tipo}, ${persona.id})`
      return tx<{ nome: string }[]>`select c.nome_visualizzazione as nome from public.clienti_email e join public.clienti c on c.id = e.cliente_id
                                   where e.indirizzo = ${indirizzo} and e.cliente_id <> ${cliente}`
    })
    revalidatePath(`/clienti/${cliente}`)
    return {
      ok: true,
      messaggio: altri.length
        ? `Indirizzo aggiunto. Attenzione: è collegato anche a ${altri.map((a) => a.nome).join(', ')}.`
        : 'Indirizzo aggiunto: vale dal prossimo controllo delle email.',
    }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Non puoi aggiungere indirizzi a questo cliente.') }
  }
}

export async function rimuoviEmailCliente(cliente: string, indirizzo: string): Promise<EsitoAzione> {
  if (!uuid.safeParse(cliente).success) return { ok: false, errore: 'Cliente non valido.' }
  const { persona } = await richiediUtente()
  try {
    const n = await conUtente(persona, async (tx) => (await tx`delete from public.clienti_email where cliente_id = ${cliente} and indirizzo = ${indirizzo}`).count)
    if (!n) return { ok: false, errore: 'Non puoi togliere indirizzi da questo cliente.' }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath(`/clienti/${cliente}`)
  return { ok: true, messaggio: 'Indirizzo tolto: dal prossimo controllo le sue email non arrivano più qui.' }
}

// ---------------------------------------------------------------------------
// Comunicazioni: inserimento manuale ed email incollata (sezione 16.1)
// ---------------------------------------------------------------------------
// DECISIONE APERTA (PIANO n. 7): le comunicazioni non si modificano né si eliminano (nessuna policy di update/delete).
const CANALI = ['email', 'telefono', 'incontro', 'whatsapp', 'altro'] as const

export async function aggiungiComunicazione(cliente: string, _: unknown, fd: FormData): Promise<EsitoAzione> {
  if (!uuid.safeParse(cliente).success) return { ok: false, errore: 'Cliente non valido.' }
  const { persona, studio } = await richiediUtente()
  const d = z
    .object({
      data: z.string().refine(isoValida, 'Data non valida'),
      canale: z.enum(CANALI),
      testo: z.string().trim().min(1, 'Scrivi la descrizione').max(20000),
      fonte: z.enum(['manuale', 'email_incollata']),
      mittente: z.string().trim().max(300).optional(),
      oggetto: z.string().trim().max(500).optional(),
    })
    .safeParse({
      data: fd.get('data'), canale: fd.get('canale'), testo: fd.get('testo'), fonte: fd.get('fonte') || 'manuale',
      mittente: (fd.get('mittente') as string) || undefined, oggetto: (fd.get('oggetto') as string) || undefined,
    })
  if (!d.success) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: erroriCampi(d.error) }
  if (d.data.data > oggiISO()) return { ok: false, errore: 'La data non può essere nel futuro.', campi: { data: 'Data futura' } }
  // la data scelta con l'ora attuale se è oggi, altrimenti mezzogiorno di quel giorno (ora italiana)
  const quando = d.data.data === oggiISO() ? new Date() : scadenzaDaInput(d.data.data, '12:00')
  try {
    await conUtente(persona, (tx) => tx`
      insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id, mittente, oggetto)
      values (${studio.id}, ${cliente}, ${quando}, ${d.data.canale}, ${d.data.testo}, ${d.data.fonte}, ${persona.id},
              ${d.data.mittente ?? null}, ${d.data.oggetto ?? null})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Non puoi aggiungere comunicazioni a questo cliente.') }
  }
  revalidatePath(`/clienti/${cliente}`)
  return { ok: true, messaggio: 'Aggiunta allo storico.' }
}

const schemaRiassuntoIncollato = z.object({
  data: z.string().nullable(),
  mittente: z.string().nullable(),
  oggetto: z.string().nullable(),
  riassunto: z.string().min(1),
})

/** L'AI propone data e riassunto di un'email incollata: niente viene salvato senza conferma. */
export async function riassumiEmailIncollata(cliente: string, testo: string): Promise<EsitoAzione<z.infer<typeof schemaRiassuntoIncollato>>> {
  if (!uuid.safeParse(cliente).success || typeof testo !== 'string') return { ok: false, errore: 'Dati non validi.' }
  const { persona } = await richiediUtente()
  const t = testo.trim()
  if (t.length < 20) return { ok: false, errore: 'Incolla il testo completo dell\'email.' }
  if (t.length > 60000) return { ok: false, errore: 'Il testo è troppo lungo: incolla solo l\'email che ti interessa.' }
  if (!aiDisponibile()) return { ok: false, errore: 'La funzione AI non è ancora configurata.' }
  const puo = await conUtente(persona, async (tx) => (await tx<{ ok: boolean }[]>`select public.puo_lavorare_cliente(${cliente}) as ok`)[0].ok)
  if (!puo) return { ok: false, errore: 'Non puoi aggiungere comunicazioni a questo cliente.' }
  try {
    const r = await jsonDaClaude({
      funzione: 'riassunto_incollato',
      contesto: { persona },
      schema: schemaRiassuntoIncollato,
      istruzioni: `Ricevi il testo di un'email (o di uno scambio di email) tra uno studio di consulenza e un suo cliente, incollato da un collaboratore.
Restituisci:
- data: la data dell'email più recente in formato AAAA-MM-GG, se è scritta nel testo; altrimenti null;
- mittente: chi ha scritto l'email più recente (nome e/o indirizzo), se si capisce; altrimenti null;
- oggetto: l'oggetto, se c'è; altrimenti null;
- riassunto: un riassunto dettagliato in italiano semplice, in qualche frase o in un breve elenco: chi scrive e perché, richieste e domande, documenti inviati o mancanti, importi, scadenze e date, appuntamenti, decisioni prese e cosa si aspetta dallo studio. Non aggiungere nulla che non sia nel testo. Oggi è ${oggiISO()}.`,
      dati: t,
      simulazione: () => {
        const data = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        const oggetto = t.match(/^(?:oggetto|subject)\s*:\s*(.+)$/im)?.[1] ?? null
        const mittente = t.match(/^(?:da|from)\s*:\s*(.+)$/im)?.[1] ?? null
        return {
          data: data ? `${data[3]}-${data[2].padStart(2, '0')}-${data[1].padStart(2, '0')}` : null,
          mittente,
          oggetto,
          riassunto: `[Riassunto simulato] ${t.replace(/\s+/g, ' ').slice(0, 280)}${t.length > 280 ? '…' : ''}`,
        }
      },
    })
    return { ok: true, dati: { ...r, data: r.data && isoValida(r.data) && r.data <= oggiISO() ? r.data : null } }
  } catch (e) {
    return { ok: false, errore: e instanceof ErroreAI ? e.message : 'Riassunto non riuscito. Riprova.' }
  }
}

// ---------------------------------------------------------------------------
// Cestino (solo admin)
// ---------------------------------------------------------------------------
export async function ripristinaCliente(id: string): Promise<EsitoAzione> {
  if (!uuid.safeParse(id).success) return { ok: false, errore: 'Cliente non valido.' }
  const { persona } = await richiediAdmin()
  try {
    await conUtente(persona, (tx) => tx`select public.ripristina_cliente(${id})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Cliente ripristinato.' }
}

export async function eliminaDefinitivamente(id: string): Promise<EsitoAzione> {
  if (!uuid.safeParse(id).success) return { ok: false, errore: 'Cliente non valido.' }
  const { persona } = await richiediAdmin()
  try {
    const percorsi = await conUtente(persona, (tx) => tx<{ p: string }[]>`select public.elimina_cliente_definitivo(${id}) as p`)
    await eliminaFileDocumenti(percorsi.map((r) => r.p))
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/studio/cestino')
  return { ok: true, messaggio: 'Cliente eliminato definitivamente.' }
}
