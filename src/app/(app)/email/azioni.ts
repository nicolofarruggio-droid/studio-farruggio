'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { collegaCasellaDiProva, preparaConsenso, segnaOnboardingEmail } from '@/lib/email-lettura/collega'
import { consegnaEmailDiProva, gmailSimulato } from '@/lib/email-lettura/gmail-prova'
import { COOKIE_STATO, googleConfigurato, opzioniCookieStato } from '@/lib/email-lettura/oauth'
import { indirizzoMittente } from '@/lib/email-lettura/messaggi'
import { scollegaCasellaUtente } from '@/lib/email-lettura/scollega'
import { controllaCasella } from '@/lib/email-lettura/sincronizza'

/** "Collega in sola lettura": chiude il primo accesso e apre la schermata di consenso di Google. */
export async function collegaInSolaLettura(): Promise<void> {
  const { persona, utente, studio } = await richiediUtente()
  await segnaOnboardingEmail(persona)
  if (!studio.lettura_email_attiva) redirect('/email/collega')
  if (!googleConfigurato()) redirect('/email/collega?errore=configurazione')
  const { url, nonce } = await preparaConsenso(utente)
  ;(await cookies()).set(COOKIE_STATO, nonce, opzioniCookieStato())
  redirect(url)
}

/** "Più tardi" / "Continua": chiude il primo accesso; sulla dashboard resta l'avviso "Collega la tua email". */
export async function rimandaCollegamento(): Promise<void> {
  const { persona } = await richiediUtente()
  await segnaOnboardingEmail(persona)
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

/** Scollega: revoca il token presso Google e ferma i controlli. Le comunicazioni già scritte restano. */
export async function scollegaCasella(): Promise<EsitoAzione> {
  const { persona, utente } = await richiediUtente()
  try {
    const [c] = await conUtente(persona, (tx) => tx<{ id: string }[]>`
      select id from public.caselle_email where utente_id = ${utente.id} and stato <> 'non_collegata'`)
    if (!c) return { ok: false, errore: 'La tua casella non è collegata.' }
    await scollegaCasellaUtente(utente.id)
    await conUtente(persona, (tx) => tx`select public.registra_attivita('casella_scollegata', 'casella', ${c.id}::uuid)`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Non è stato possibile scollegare la casella. Riprova.') }
  }
  revalidatePath('/', 'layout')
  redirect('/email?scollegata=1')
}

const schemaCollegaMittente = z.object({
  indirizzo: z.string().trim().toLowerCase().email('Indirizzo non valido').max(320),
  cliente: z.string().uuid('Scegli un cliente'),
  gmail: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).max(50),
})

const sembraPec = (indirizzo: string) => /@(?:[^@]*[.-])?(?:pec|legalmail|postacert)[.-]/.test(indirizzo)

/**
 * "Collega a un cliente" (sezione 16.3, punto 8): aggiunge l'indirizzo al cliente con le regole RLS
 * dell'utente e segna le email ignorate di quel mittente da rielaborare al controllo successivo.
 */
export async function collegaMittente(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const d = schemaCollegaMittente.safeParse({ indirizzo: fd.get('indirizzo'), cliente: fd.get('cliente'), gmail: fd.getAll('gmail') })
  if (!d.success) return { ok: false, errore: d.error.issues[0]?.message ?? 'Dati non validi.', campi: { cliente: 'Scegli un cliente' } }
  const { persona, utente } = await richiediUtente()
  const { indirizzo, cliente, gmail } = d.data
  try {
    const { nome, n } = await conUtente(persona, async (tx) => {
      const [c] = await tx<{ nome: string }[]>`select nome_visualizzazione as nome from public.clienti where id = ${cliente}`
      if (!c) throw Object.assign(new Error('Cliente non trovato'), { code: 'P0002' })
      const esiste = await tx`select 1 from public.clienti_email where cliente_id = ${cliente} and indirizzo = ${indirizzo}`
      if (!esiste.length) {
        await tx`
          insert into public.clienti_email (studio_id, cliente_id, indirizzo, tipo, creato_da)
          values (${utente.studio_id}, ${cliente}, ${indirizzo}, ${sembraPec(indirizzo) ? 'pec' : 'ordinaria'}, ${utente.id})`
      }
      const [r] = await tx<{ n: number }[]>`select public.segna_email_da_rielaborare(${gmail}::text[], ${cliente}::uuid, ${indirizzo}) as n`
      return { nome: c.nome, n: r.n }
    })
    // niente revalidatePath: il messaggio resta al posto del modulo; l'elenco si aggiorna alla prossima apertura
    return {
      ok: true,
      messaggio: `${indirizzo} ora è collegato a ${nome}. ${n === 1 ? 'La sua email ignorata sarà riassunta' : `Le sue ${n} email ignorate saranno riassunte`} al prossimo controllo.`,
    }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Non è stato possibile collegare l\'indirizzo al cliente.') }
  }
}

// ---------------------------------------------------------------------------
// Modalità di prova (GMAIL_SIMULATO=1, mai in produzione)
// ---------------------------------------------------------------------------
const soloProva = (): EsitoAzione | null =>
  gmailSimulato() ? null : { ok: false, errore: 'La modalità di prova non è attiva.' }

export async function collegaCasellaProva(): Promise<EsitoAzione> {
  const vietato = soloProva()
  if (vietato) return vietato
  const { persona, utente } = await richiediUtente()
  try {
    await collegaCasellaDiProva({ persona, utente })
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, 'Non è stato possibile collegare la casella di prova.') }
  }
  revalidatePath('/', 'layout')
  redirect('/email?collegata=1')
}

const schemaSimula = z.object({
  mittente: z.string().trim().min(3, 'Scrivi il mittente').max(300),
  oggetto: z.string().trim().max(300),
  testo: z.string().trim().min(1, 'Scrivi il testo dell\'email').max(50_000),
  allegati: z.string().max(2000),
  conversazione: z.string().max(64),
  altri: z.string().max(2000),
  soloHtml: z.boolean(),
})

export async function simulaEmail(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const vietato = soloProva()
  if (vietato) return vietato
  const d = schemaSimula.safeParse({
    mittente: fd.get('mittente') ?? '', oggetto: fd.get('oggetto') ?? '', testo: fd.get('testo') ?? '',
    allegati: fd.get('allegati') ?? '', conversazione: fd.get('conversazione') ?? '', altri: fd.get('altri') ?? '',
    soloHtml: fd.get('soloHtml') === 'on',
  })
  if (!d.success) {
    const campi: Record<string, string> = {}
    for (const i of d.error.issues) campi[String(i.path[0])] ??= i.message
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }
  if (!indirizzoMittente(d.data.mittente)) return { ok: false, errore: 'Controlla i campi evidenziati.', campi: { mittente: 'Il mittente deve contenere un indirizzo email' } }
  const altri = d.data.altri.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
  if (altri.some((x) => !z.string().email().safeParse(x).success))
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi: { altri: 'Scrivi indirizzi email validi, separati da virgole' } }
  const { persona, utente } = await richiediUtente()
  const [c] = await conUtente(persona, (tx) => tx<{ indirizzo: string }[]>`
    select indirizzo from public.caselle_email where utente_id = ${utente.id} and stato = 'collegata'`)
  if (!c) return { ok: false, errore: 'Collega prima la casella di prova.' }
  const destinatari = [...new Set([c.indirizzo, ...altri])]
  const { oggetto } = await consegnaEmailDiProva({
    destinatari,
    mittente: d.data.mittente,
    oggetto: d.data.oggetto,
    testo: d.data.testo,
    allegati: d.data.allegati.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20),
    soloHtml: d.data.soloHtml,
    rispostaA: d.data.conversazione || null,
  })
  revalidatePath('/email')
  return {
    ok: true,
    messaggio: `Email «${oggetto || 'senza oggetto'}» arrivata in ${destinatari.length === 1 ? 'questa casella di prova' : `${destinatari.length} caselle di prova`}. Premi "Controlla ora" per elaborarla.`,
  }
}

export async function controllaOra(): Promise<EsitoAzione> {
  const vietato = soloProva()
  if (vietato) return vietato
  const { persona, utente, studio } = await richiediUtente()
  if (!studio.lettura_email_attiva) return { ok: false, errore: 'La lettura automatica delle email è spenta per lo studio: l\'admin deve attivarla.' }
  const [c] = await conUtente(persona, (tx) => tx<{ id: string }[]>`
    select id from public.caselle_email where utente_id = ${utente.id} and stato = 'collegata'`)
  if (!c) return { ok: false, errore: 'La tua casella non è collegata.' }
  const e = await controllaCasella(c.id)
  revalidatePath('/email')
  if (e.saltata) return { ok: false, errore: 'C\'è già un controllo in corso per questa casella: riprova tra poco.' }
  const numeri = `${e.nuove} ${e.nuove === 1 ? 'email nuova' : 'email nuove'}, ${e.associate} ${e.associate === 1 ? 'associata' : 'associate'} a clienti, ${e.ignorate} ${e.ignorate === 1 ? 'ignorata' : 'ignorate'}, ${e.errori} ${e.errori === 1 ? 'errore' : 'errori'}.`
  return e.errori ? { ok: false, errore: `Controllo eseguito con errori: ${numeri} ${e.errore ?? ''}`.trim() } : { ok: true, messaggio: `Controllo eseguito: ${numeri}` }
}
