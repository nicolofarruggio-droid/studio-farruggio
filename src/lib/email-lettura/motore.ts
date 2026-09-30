// Controllo di una casella (sezione 16.3), senza dipendenze dirette da database, Gmail o AI:
// ricevono tutto da fuori (Archivio, ClienteGmail, Riassumi), così la logica si prova con i test unitari.
//
// DECISIONE APERTA (PIANO n. 6): si leggono solo le email ricevute, non quelle inviate dal collaboratore ai clienti.
// 1. nuovi messaggi SOLO in arrivo (INBOX) dopo il cursore; se il cursore è scaduto, ricerca "after:";
// 2. di ogni messaggio si leggono PRIMA SOLO le intestazioni (mittente, data, oggetto, Message-ID);
// 3. cliente riconosciuto SOLO con l'indirizzo esatto del mittente; altrimenti "ignorata": il testo non
//    viene scaricato e si salvano solo l'identificativo Gmail e il Message-ID;
// 4. per le email associate: testo e nomi degli allegati, riassunti precedenti della conversazione,
//    più email in una sola richiesta all'AI;
// 5. una voce in Comunicazioni per cliente, senza testo integrale né allegati, senza doppioni (Message-ID);
// 6. se l'AI non risponde le email restano "in attesa" e si riprovano al controllo successivo.
import {
  estraiTesto, leggiIntestazioni, limitaTesto, nomiAllegati, normalizzaOggetto, type IntestazioniLette,
} from './messaggi'
import {
  ErroreCursoreScaduto, ErroreNonTrovato, MAX_PRECEDENTI,
  type ClienteGmail, type ConversazioneDaRiassumere, type EmailDaRiassumere,
} from './tipi'

export type CasellaInControllo = {
  id: string
  studioId: string
  /** proprietario della casella: autore delle comunicazioni */
  utenteId: string
  collegataIl: Date
  ultimoControllo: Date | null
  cursore: string | null
}

export type Precedente = { data: Date; riassunto: string }

export type RigaComunicazione = {
  studioId: string
  clienteId: string
  data: Date
  testo: string
  autoreId: string
  casellaId: string
  mittente: string
  oggetto: string | null
  allegati: string[]
  conversazione: string
  numeroMessaggio: number
  messageId: string
}

/** Dove il controllo legge e scrive (nel gestionale: il database, vedi archivio-db.ts). */
export interface Archivio {
  /** registra i nuovi messaggi "in attesa" (solo l'identificativo) e sposta il cursore; restituisce quanti erano nuovi */
  registraNuove(c: CasellaInControllo, gmailIds: string[], cursore: string | null): Promise<number>
  /** messaggi da elaborare: nuovi, in attesa dell'AI o da rielaborare */
  daElaborare(casellaId: string, limite: number): Promise<string[]>
  /** indirizzo esatto → clienti (non eliminati) dello studio con quell'indirizzo */
  clientiPerIndirizzi(studioId: string, indirizzi: string[]): Promise<Map<string, string[]>>
  segnaIgnorata(casellaId: string, gmailId: string, messageId: string | null): Promise<void>
  segnaAssociata(casellaId: string, gmailId: string, messageId: string, clienti: string[]): Promise<void>
  /** tentativo non riuscito (Gmail o AI): il messaggio resta da elaborare */
  segnaNonRiuscita(casellaId: string, gmailIds: string[]): Promise<void>
  /** la stessa email (Message-ID) ha già una voce per tutti questi clienti? */
  giaRiassunta(studioId: string, messageId: string, clienti: string[]): Promise<boolean>
  /** riassunti già presenti della conversazione, dal più vecchio */
  precedenti(p: {
    studioId: string; casellaId: string; clienti: string[]; conversazione: string; oggettoNormalizzato: string; escludi: string[]
  }): Promise<Precedente[]>
  /** scrive le voci (senza doppioni) e segna l'email come associata; restituisce le voci nuove */
  salvaRiassunto(righe: RigaComunicazione[], casellaId: string, gmailId: string, messageId: string, clienti: string[]): Promise<number>
}

export type Riassumi = (conversazioni: ConversazioneDaRiassumere[]) => Promise<Map<string, string>>

export type EsitoControllo = {
  nuove: number
  associate: number
  ignorate: number
  errori: number
  /** email lasciate per il controllo successivo perché è finito il tempo a disposizione */
  rimandate: number
  /** messaggio per la pagina "La mia email" (mai contenuti delle email) */
  errore?: string
}

export const LIMITE_CODA = 100
export const MAX_EMAIL_PER_RICHIESTA = 8
export const MAX_CARATTERI_PER_RICHIESTA = 60_000
const ETICHETTE_ESCLUSE = ['SPAM', 'TRASH', 'DRAFT']

/** Esegue fn su tutti gli elementi, al massimo n alla volta. */
export async function aGruppi<T>(elementi: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  const lavoratore = async () => {
    while (i < elementi.length) await fn(elementi[i++])
  }
  await Promise.all(Array.from({ length: Math.min(n, elementi.length) }, lavoratore))
}

/** Nuovi messaggi in INBOX dopo il cursore (history.list), con ripiego su messages.list "after:". */
export async function nuoviMessaggi(gmail: ClienteGmail, c: CasellaInControllo): Promise<{ ids: string[]; cursore: string | null }> {
  if (c.cursore) {
    try {
      const ids = new Set<string>()
      let pagina: string | undefined
      let cursore = c.cursore
      for (let n = 0; n < 50; n++) {
        const r = await gmail.storia(c.cursore, pagina)
        for (const h of r.history ?? [])
          for (const a of h.messagesAdded ?? [])
            if (!a.message.labelIds || a.message.labelIds.includes('INBOX')) ids.add(a.message.id)
        cursore = r.historyId ?? cursore
        pagina = r.nextPageToken
        if (!pagina) break
      }
      return { ids: [...ids], cursore }
    } catch (e) {
      if (!(e instanceof ErroreCursoreScaduto)) throw e
    }
  }
  // cursore assente o troppo vecchio: si parte dal punto attuale e si cercano i messaggi dopo l'ultimo controllo
  const profilo = await gmail.profilo()
  const dopo = c.ultimoControllo ?? c.collegataIl
  const secondi = Math.floor(Math.max(dopo.getTime(), c.collegataIl.getTime()) / 1000)
  const ids = new Set<string>()
  let pagina: string | undefined
  for (let n = 0; n < 20; n++) {
    const r = await gmail.elencoMessaggi(`in:inbox after:${secondi}`, pagina)
    for (const m of r.messages ?? []) ids.add(m.id)
    pagina = r.nextPageToken
    if (!pagina) break
  }
  return { ids: [...ids], cursore: profilo.historyId }
}

type Associata = { h: IntestazioniLette; clienti: string[]; messageId: string }
type Completa = Associata & { email: Omit<EmailDaRiassumere, 'id'> }

/** Email della stessa conversazione (stesso thread della casella), ciascuna in ordine di data. */
export function raggruppaPerConversazione<T extends { h: IntestazioniLette }>(email: T[]): T[][] {
  const gruppi = new Map<string, T[]>()
  for (const e of email) {
    const g = gruppi.get(e.h.threadId) ?? []
    g.push(e)
    gruppi.set(e.h.threadId, g)
  }
  return [...gruppi.values()]
    .map((g) => g.sort((a, b) => a.h.ricevutaIl.getTime() - b.h.ricevutaIl.getTime()))
    .sort((a, b) => a[0].h.ricevutaIl.getTime() - b[0].h.ricevutaIl.getTime())
}

/** Ultimi (al massimo 3) riassunti da dare all'AI. */
export const ultimiPrecedenti = (p: Precedente[]) => p.slice(-MAX_PRECEDENTI)

export async function eseguiControllo(p: {
  casella: CasellaInControllo
  gmail: ClienteGmail
  archivio: Archivio
  riassumi: Riassumi
  /** istante (ms) oltre il quale non si iniziano nuove richieste all'AI */
  scadenza?: number
}): Promise<EsitoControllo> {
  const { casella: c, gmail, archivio } = p
  const esito: EsitoControllo = { nuove: 0, associate: 0, ignorate: 0, errori: 0, rimandate: 0 }
  const problemi = new Set<string>()

  // 1. nuovi messaggi in arrivo
  try {
    const { ids, cursore } = await nuoviMessaggi(gmail, c)
    esito.nuove = await archivio.registraNuove(c, ids, cursore)
  } catch {
    esito.errori++
    esito.errore = 'Gmail non ha risposto: riproveremo al prossimo controllo.'
    return esito
  }

  const coda = await archivio.daElaborare(c.id, LIMITE_CODA)
  if (!coda.length) return esito

  // 2. solo le intestazioni
  const intestazioni: IntestazioniLette[] = []
  await aGruppi(coda, 5, async (gmailId) => {
    try {
      intestazioni.push(leggiIntestazioni(await gmail.messaggio(gmailId, 'metadata')))
    } catch (e) {
      if (e instanceof ErroreNonTrovato) {
        // eliminato dall'utente prima del controllo: non c'è più niente da leggere
        await archivio.segnaIgnorata(c.id, gmailId, null)
        esito.ignorate++
      } else {
        esito.errori++
        problemi.add('Alcune email non si sono potute leggere da Gmail: riproveremo al prossimo controllo.')
        await archivio.segnaNonRiuscita(c.id, [gmailId])
      }
    }
  })

  // 3. riconoscimento del cliente: solo l'indirizzo esatto del mittente
  const indirizzi = [...new Set(intestazioni.map((h) => h.mittente).filter((x): x is string => Boolean(x)))]
  const clientiDi = indirizzi.length ? await archivio.clientiPerIndirizzi(c.studioId, indirizzi) : new Map<string, string[]>()
  const associate: Associata[] = []
  for (const h of intestazioni) {
    const esclusa = h.etichette.some((e) => ETICHETTE_ESCLUSE.includes(e))
      // le email arrivate prima del collegamento non si leggono mai (sezione 16.2)
      || h.ricevutaIl.getTime() < c.collegataIl.getTime()
    const clienti = !esclusa && h.mittente ? clientiDi.get(h.mittente) : undefined
    if (!clienti?.length) {
      await archivio.segnaIgnorata(c.id, h.gmailId, h.messageId)
      esito.ignorate++
      continue
    }
    associate.push({ h, clienti, messageId: h.messageId ?? `<gmail-${h.gmailId}@casella-${c.id}>` })
  }

  // 4. niente doppioni: la stessa email già riassunta da un'altra casella dello studio non torna all'AI
  const daScaricare: Associata[] = []
  for (const a of associate) {
    if (a.h.messageId && (await archivio.giaRiassunta(c.studioId, a.h.messageId, a.clienti))) {
      await archivio.segnaAssociata(c.id, a.h.gmailId, a.messageId, a.clienti)
      esito.associate++
    } else daScaricare.push(a)
  }

  // 5. testo completo SOLO per le email associate a un cliente
  const complete: Completa[] = []
  await aGruppi(daScaricare, 3, async (a) => {
    try {
      const m = await gmail.messaggio(a.h.gmailId, 'full')
      const t = estraiTesto(m.payload)
      const l = limitaTesto(t.testo)
      complete.push({
        ...a,
        email: {
          mittente: a.h.mittente!,
          data: a.h.ricevutaIl,
          oggetto: a.h.oggetto,
          testo: l.testo,
          troncato: l.troncato,
          citazioneOmessa: t.citazioneOmessa,
          allegati: nomiAllegati(m.payload),
        },
      })
    } catch (e) {
      if (e instanceof ErroreNonTrovato) {
        await archivio.segnaIgnorata(c.id, a.h.gmailId, a.h.messageId)
        esito.ignorate++
      } else {
        esito.errori++
        problemi.add('Alcune email non si sono potute leggere da Gmail: riproveremo al prossimo controllo.')
        await archivio.segnaNonRiuscita(c.id, [a.h.gmailId])
      }
    }
  })

  // 6. conversazioni: riassunti precedenti e ordine di data; poi richieste all'AI a lotti
  type Pezzo = { chiave: string; email: Completa[]; inizio: number }
  const conversazioni = raggruppaPerConversazione(complete)
  const giaInArchivio = new Map<string, Precedente[]>()
  const pezzi: Pezzo[] = []
  for (const g of conversazioni) {
    const chiave = g[0].h.threadId
    giaInArchivio.set(chiave, await archivio.precedenti({
      studioId: c.studioId,
      casellaId: c.id,
      clienti: [...new Set(g.flatMap((x) => x.clienti))],
      conversazione: chiave,
      oggettoNormalizzato: normalizzaOggetto(g[0].h.oggetto),
      escludi: g.map((x) => x.messageId),
    }))
    for (let i = 0; i < g.length; i += MAX_EMAIL_PER_RICHIESTA)
      pezzi.push({ chiave, email: g.slice(i, i + MAX_EMAIL_PER_RICHIESTA), inizio: i })
  }

  const lotti: Pezzo[][] = []
  let lotto: Pezzo[] = []
  let caratteri = 0
  for (const pz of pezzi) {
    const lunghezza = pz.email.reduce((s, e) => s + e.email.testo.length + 500, 0)
    const quante = lotto.reduce((s, x) => s + x.email.length, 0)
    // un pezzo della stessa conversazione va in un lotto successivo: così vede i riassunti appena scritti
    const stessaConversazione = lotto.some((x) => x.chiave === pz.chiave)
    if (lotto.length && (stessaConversazione || quante + pz.email.length > MAX_EMAIL_PER_RICHIESTA || caratteri + lunghezza > MAX_CARATTERI_PER_RICHIESTA)) {
      lotti.push(lotto)
      lotto = []
      caratteri = 0
    }
    lotto.push(pz)
    caratteri += lunghezza
  }
  if (lotto.length) lotti.push(lotto)

  const scritti = new Map<string, Precedente[]>() // riassunti scritti in questo controllo, per conversazione
  for (const l of lotti) {
    const inLotto = l.flatMap((pz) => pz.email)
    if (p.scadenza && Date.now() > p.scadenza) {
      esito.rimandate += inLotto.length // restano "in attesa": le riprende il controllo successivo
      continue
    }
    let n = 0
    const richiesta: ConversazioneDaRiassumere[] = l.map((pz) => {
      const prima = [...(giaInArchivio.get(pz.chiave) ?? []), ...(scritti.get(pz.chiave) ?? [])]
      return {
        precedenti: ultimiPrecedenti(prima),
        giaPresenti: (giaInArchivio.get(pz.chiave)?.length ?? 0) + pz.inizio,
        email: pz.email.map((e) => ({ ...e.email, id: `E${++n}` })),
      }
    })
    let riassunti: Map<string, string>
    try {
      riassunti = await p.riassumi(richiesta)
    } catch {
      esito.errori += inLotto.length
      problemi.add('L\'AI non ha risposto: le email dei clienti saranno riassunte al prossimo controllo.')
      await archivio.segnaNonRiuscita(c.id, inLotto.map((e) => e.h.gmailId))
      continue
    }
    for (const [i, pz] of l.entries()) {
      for (const [j, e] of pz.email.entries()) {
        const testo = riassunti.get(richiesta[i].email[j].id)
        if (!testo) {
          esito.errori++
          problemi.add('L\'AI non ha riassunto alcune email: riproveremo al prossimo controllo.')
          await archivio.segnaNonRiuscita(c.id, [e.h.gmailId])
          continue
        }
        const numeroMessaggio = richiesta[i].giaPresenti + j + 1
        try {
          // DECISIONE APERTA (sezione 14): un indirizzo usato da più clienti (stesso titolare con più aziende).
          // Proposta provvisoria: il riassunto si scrive in TUTTI i clienti con quell'indirizzo; l'alternativa è
          // chiedere a una persona di scegliere il cliente giusto.
          await archivio.salvaRiassunto(
            e.clienti.map((clienteId) => ({
              studioId: c.studioId,
              clienteId,
              data: e.h.ricevutaIl,
              testo,
              autoreId: c.utenteId,
              casellaId: c.id,
              mittente: e.h.mittente!,
              oggetto: e.h.oggetto || null,
              allegati: e.email.allegati,
              conversazione: e.h.threadId,
              numeroMessaggio,
              messageId: e.messageId,
            })),
            c.id, e.h.gmailId, e.messageId, e.clienti,
          )
          esito.associate++
          const lista = scritti.get(pz.chiave) ?? []
          lista.push({ data: e.h.ricevutaIl, riassunto: testo })
          scritti.set(pz.chiave, lista)
        } catch {
          esito.errori++
          problemi.add('Alcuni riassunti non si sono potuti salvare: riproveremo al prossimo controllo.')
          await archivio.segnaNonRiuscita(c.id, [e.h.gmailId])
        }
      }
    }
  }
  if (esito.rimandate) problemi.add(`${esito.rimandate} email di clienti saranno riassunte al prossimo controllo.`)
  if (problemi.size) esito.errore = [...problemi].join(' ')
  return esito
}
