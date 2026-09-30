// Lettura email in sola lettura (sezione 16): token mai leggibili, caselle visibili solo al proprietario
// (l'admin vede solo lo stato), email ignorate collegate a un cliente, niente doppioni per Message-ID.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaStudio, nuovoDb, righe, type Persona, type Studio } from './helpers'

let db: PGlite
let A: Studio
let B: Studio

async function creaCasella(studio: Studio, p: Persona, indirizzo = p.email): Promise<string> {
  const [c] = await righe<{ id: string }>(db,
    `insert into public.caselle_email (studio_id, utente_id, indirizzo, stato, permesso, collegata_il, cursore)
     values ($1, $2, $3, 'collegata', 'https://www.googleapis.com/auth/gmail.readonly', now(), '12345') returning id`,
    [studio.id, p.id, indirizzo])
  await db.query(`insert into public.caselle_email_token (casella_id, token_cifrato) values ($1, 'v1.segreto')`, [c.id])
  await db.query(`insert into public.controlli_email (studio_id, casella_id, email_nuove, associate, ignorate, errori)
                  values ($1, $2, 3, 1, 2, 0)`, [studio.id, c.id])
  return c.id
}

async function emailElaborata(studio: Studio, casella: string, gmailId: string, esito: string) {
  await db.query(`insert into public.email_elaborate (studio_id, casella_id, gmail_id, message_id, esito)
                  values ($1, $2, $3, $4, $5)`, [studio.id, casella, gmailId, `<${gmailId}@esempio.it>`, esito])
}

const esitoDi = async (casella: string, gmailId: string) =>
  (await righe<{ esito: string }>(db, `select esito from public.email_elaborate where casella_id = $1 and gmail_id = $2`, [casella, gmailId]))[0]?.esito

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
})

describe('token e stato delle caselle', () => {
  it('nessun utente, nemmeno il proprietario o l\'admin, legge caselle_email_token', async () => {
    await creaCasella(A, A.c1)
    for (const p of [A.c1, A.admin]) {
      await expect(come(db, p, (tx) => tx.query('select token_cifrato from public.caselle_email_token'))).rejects.toThrow(/permission denied/)
    }
    await expect(come(db, A.c1, (tx) => tx.query(`delete from public.caselle_email_token`))).rejects.toThrow(/permission denied/)
  })

  it('il proprietario vede la sua casella, un collega no', async () => {
    const id = await creaCasella(A, A.c1)
    const suoi = await come(db, A.c1, (tx) => righe<{ id: string; stato: string }>(tx, 'select id, stato from public.caselle_email'))
    expect(suoi).toEqual([{ id, stato: 'collegata' }])
    expect(await come(db, A.c2, (tx) => righe(tx, 'select id, stato from public.caselle_email'))).toHaveLength(0)
    expect(await come(db, A.c2, (tx) => righe(tx, 'select * from public.controlli_email'))).toHaveLength(0)
    expect(await come(db, A.c1, (tx) => righe(tx, 'select email_nuove from public.controlli_email'))).toHaveLength(1)
  })

  it("l'admin vede solo lo stato: non cursore, permesso o controllo in corso, né controlli ed email del collega", async () => {
    await creaCasella(A, A.c1)
    const stato = await come(db, A.admin, (tx) => righe<{ stato: string }>(tx, 'select utente_id, stato from public.caselle_email'))
    expect(stato).toEqual([{ utente_id: A.c1.id, stato: 'collegata' }])
    for (const colonna of ['cursore', 'permesso', 'controllo_in_corso_dal']) {
      await expect(come(db, A.admin, (tx) => tx.query(`select ${colonna} from public.caselle_email`))).rejects.toThrow(/permission denied/)
    }
    expect(await come(db, A.admin, (tx) => righe(tx, 'select * from public.controlli_email'))).toHaveLength(0)
    expect(await come(db, A.admin, (tx) => righe(tx, 'select * from public.email_elaborate'))).toHaveLength(0)
  })

  it('un altro studio non vede nulla', async () => {
    await creaCasella(A, A.c1)
    expect(await come(db, B.admin, (tx) => righe(tx, 'select id from public.caselle_email'))).toHaveLength(0)
  })

  it('gli utenti non scrivono caselle, email elaborate né comunicazioni automatiche', async () => {
    const casella = await creaCasella(A, A.c1)
    const cliente = A.clienti.find((c) => c.referente === A.c1.id)!.id
    await expect(come(db, A.c1, (tx) => tx.query(`update public.caselle_email set stato = 'collegata', cursore = '1'`))).rejects.toThrow(/permission denied/)
    await expect(come(db, A.c1, (tx) => tx.query(
      `insert into public.caselle_email (studio_id, utente_id, stato) values ($1, $2, 'collegata')`, [A.id, A.c2.id]))).rejects.toThrow(/permission denied/)
    await expect(come(db, A.c1, (tx) => tx.query(
      `insert into public.email_elaborate (studio_id, casella_id, gmail_id, esito) values ($1, $2, 'x', 'ignorata')`, [A.id, casella]))).rejects.toThrow(/permission denied/)
    await expect(come(db, A.c1, (tx) => tx.query(
      `insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id, casella_id, message_id)
       values ($1, $2, now(), 'email', 'finto riassunto', 'email_automatica', $3, $4, '<finto@x.it>')`,
      [A.id, cliente, A.c1.id, casella]))).rejects.toThrow()
  })
})

describe('mittente ignorato collegato a un cliente (sezione 16.3, punto 8)', () => {
  it("aggiunge l'indirizzo con le regole RLS e segna da rielaborare solo le email ignorate della propria casella", async () => {
    const mia = await creaCasella(A, A.c1)
    const collega = await creaCasella(A, A.c2)
    await emailElaborata(A, mia, 'g1', 'ignorata')
    await emailElaborata(A, mia, 'g2', 'ignorata')
    await emailElaborata(A, mia, 'g3', 'associata')
    await emailElaborata(A, collega, 'g1', 'ignorata')
    const cliente = A.clienti.find((c) => c.referente === A.c1.id)!.id

    const n = await come(db, A.c1, async (tx) => {
      await tx.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'nuovo@cliente-esempio.it')`, [A.id, cliente])
      const r = await righe<{ n: number }>(tx, `select public.segna_email_da_rielaborare($1, $2, 'Nuovo@Cliente-Esempio.it') as n`,
        [['g1', 'g3', 'inesistente'], cliente])
      return r[0].n
    })
    expect(n).toBe(1)
    expect(await esitoDi(mia, 'g1')).toBe('da_rielaborare')
    expect(await esitoDi(mia, 'g2')).toBe('ignorata') // non richiesta
    expect(await esitoDi(mia, 'g3')).toBe('associata') // solo le ignorate
    expect(await esitoDi(collega, 'g1')).toBe('ignorata') // la casella di un collega non si tocca
    const log = await righe<{ azione: string; dettagli: { indirizzo: string; email_da_rielaborare: number } }>(db,
      `select azione, dettagli from public.registro_attivita where studio_id = $1 and azione = 'mittente_collegato'`, [A.id])
    expect(log).toEqual([{ azione: 'mittente_collegato', dettagli: { indirizzo: 'nuovo@cliente-esempio.it', email_da_rielaborare: 1 } }])
  })

  it('non si collega un indirizzo a un cliente su cui non si lavora', async () => {
    const mia = await creaCasella(A, A.c1)
    await emailElaborata(A, mia, 'g1', 'ignorata')
    const altrui = A.clienti.find((c) => c.referente === A.c2.id)!.id
    await db.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'x@altro-esempio.it')`, [A.id, altrui])
    await expect(come(db, A.c1, (tx) => tx.query(
      `insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'y@altro-esempio.it')`, [A.id, altrui]))).rejects.toThrow()
    await expect(come(db, A.c1, (tx) => tx.query(`select public.segna_email_da_rielaborare($1, $2, 'x@altro-esempio.it')`, [['g1'], altrui])))
      .rejects.toThrow(/Non puoi/)
    expect(await esitoDi(mia, 'g1')).toBe('ignorata')
    // nemmeno da un altro studio
    await expect(come(db, B.admin, (tx) => tx.query(`select public.segna_email_da_rielaborare($1, $2, 'x@altro-esempio.it')`, [['g1'], altrui])))
      .rejects.toThrow(/Non puoi/)
  })

  it("serve che l'indirizzo sia davvero del cliente e che la casella sia collegata", async () => {
    const cliente = A.clienti.find((c) => c.referente === A.c1.id)!.id
    await expect(come(db, A.c1, (tx) => tx.query(`select public.segna_email_da_rielaborare($1, $2, 'mai@aggiunto.it')`, [['g1'], cliente])))
      .rejects.toThrow(/non è tra quelli del cliente/)
    await db.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'ok@cliente-esempio.it')`, [A.id, cliente])
    await expect(come(db, A.c1, (tx) => tx.query(`select public.segna_email_da_rielaborare($1, $2, 'ok@cliente-esempio.it')`, [['g1'], cliente])))
      .rejects.toThrow(/non è collegata/)
  })

  it('anon non può chiamare la funzione', async () => {
    await expect(db.transaction(async (tx) => {
      await tx.exec('set local role anon')
      await tx.query(`select public.segna_email_da_rielaborare('{}', gen_random_uuid(), 'a@b.it')`)
    })).rejects.toThrow(/permission denied/)
  })
})

describe('niente doppioni nelle Comunicazioni (sezione 16.3, punto 6)', () => {
  it('la stessa email (Message-ID) ricevuta da due collaboratori è una sola voce per cliente', async () => {
    const c1 = await creaCasella(A, A.c1)
    const c2 = await creaCasella(A, A.c2)
    const [x, y] = A.clienti
    const scrivi = (casella: string, autore: string, cliente: string) => db.query(
      `insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id, casella_id, mittente, message_id)
       values ($1, $2, now(), 'email', 'Riassunto', 'email_automatica', $3, $4, 'info@cliente-esempio.it', '<stessa@cliente-esempio.it>')
       on conflict (studio_id, cliente_id, message_id) where message_id is not null do nothing`,
      [A.id, cliente, autore, casella])
    await scrivi(c1, A.c1.id, x.id)
    await scrivi(c2, A.c2.id, x.id)
    // indirizzo collegato a più clienti: una voce per ciascun cliente
    await scrivi(c2, A.c2.id, y.id)
    const r = await righe<{ cliente_id: string; autore_id: string }>(db,
      `select cliente_id, autore_id from public.comunicazioni where message_id = '<stessa@cliente-esempio.it>' order by cliente_id = $1 desc`, [x.id])
    expect(r).toEqual([{ cliente_id: x.id, autore_id: A.c1.id }, { cliente_id: y.id, autore_id: A.c2.id }])
  })
})
