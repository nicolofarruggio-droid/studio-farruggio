// Permessi per ruolo, visibilità tra collaboratori, accessi tra colleghi, utenti disattivati (sezioni 3, 4, 5).
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaStudio, hash, impostaStudio, nuovoDb, righe, type Studio } from './helpers'

let db: PGlite
let A: Studio

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
})

const clientiVisti = (p: { id: string; email: string }) =>
  come(db, p, async (tx) => (await righe<{ id: string }>(tx, 'select id from public.clienti')).map((r) => r.id).sort())

describe('visibilità tra collaboratori', () => {
  it("con 'solo i propri' un collaboratore vede solo i clienti assegnati a lui", async () => {
    const visti = await clientiVisti(A.c1)
    const suoi = A.clienti.filter((c) => c.referente === A.c1.id).map((c) => c.id).sort()
    expect(visti).toEqual(suoi)
    expect(visti).toHaveLength(2)
    // e nemmeno comunicazioni e indicatori degli altri
    const com = await come(db, A.c1, (tx) => righe<{ cliente_id: string }>(tx, 'select cliente_id from public.comunicazioni'))
    expect(com.every((r) => suoi.includes(r.cliente_id))).toBe(true)
  })

  it("l'admin vede tutti i clienti dello studio e ne crea di nuovi (insert … returning)", async () => {
    expect(await clientiVisti(A.admin)).toHaveLength(6)
    const r = await come(db, A.admin, (tx) => righe<{ id: string }>(tx,
      `insert into public.clienti (studio_id, ragione_sociale, nome_visualizzazione) values ($1, 'Nuovo', 'Nuovo') returning id`, [A.id]))
    expect(r).toHaveLength(1)
  })

  it("con 'tutto lo studio in sola lettura' vede tutto ma modifica solo i propri", async () => {
    await impostaStudio(db, A.id, { visibilita: 'studio_lettura' })
    expect(await clientiVisti(A.c1)).toHaveLength(6)
    const altrui = A.clienti.find((c) => c.referente === A.c2.id)!.id
    const suo = A.clienti.find((c) => c.referente === A.c1.id)!.id
    await expect(come(db, A.c1, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [altrui]))).rejects.toThrow(/Non puoi/)
    await expect(
      come(db, A.c1, (tx) =>
        tx.query(`insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id)
                  values ($1, $2, now(), 'telefono', 'x', 'manuale', $3)`, [A.id, altrui, A.c1.id]),
      ),
    ).rejects.toThrow()
    await expect(
      come(db, A.c1, (tx) => tx.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'x@y.it')`, [A.id, altrui])),
    ).rejects.toThrow()
    await come(db, A.c1, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [suo]))
  })

  it("con 'accesso completo' lavora sui clienti di tutti", async () => {
    await impostaStudio(db, A.id, { visibilita: 'studio_completo' })
    const altrui = A.clienti.find((c) => c.referente === A.c2.id)!.id
    await come(db, A.c1, async (tx) => {
      await tx.query(`select public.imposta_indicatore($1, 'prima_nota', '2026-07-31')`, [altrui])
      await tx.query(`insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id)
                      values ($1, $2, now(), 'incontro', 'Incontro in studio', 'manuale', $3)`, [A.id, altrui, A.c1.id])
    })
    const r = await righe<{ aggiornato_fino_al: string }>(db,
      `select aggiornato_fino_al::text from public.aggiornamenti_contabili where cliente_id = $1 and tipo = 'prima_nota'`, [altrui])
    expect(r[0].aggiornato_fino_al).toBe('2026-07-31')
  })

  it('il cambio di visibilità vale subito e finisce nel registro con prima e dopo', async () => {
    await come(db, A.admin, (tx) => tx.query(`update public.studi set visibilita = 'studio_lettura' where id = $1`, [A.id]))
    expect(await clientiVisti(A.c1)).toHaveLength(6)
    await come(db, A.admin, (tx) => tx.query(`update public.studi set visibilita = 'solo_propri' where id = $1`, [A.id]))
    expect(await clientiVisti(A.c1)).toHaveLength(2)
    const log = await righe<{ dettagli: { campo: string; prima: string; dopo: string } }>(db,
      `select dettagli from public.registro_attivita where studio_id = $1 and azione = 'impostazione_modificata' order by creato_il`, [A.id])
    expect(log.map((l) => l.dettagli)).toEqual([
      { campo: 'visibilita', prima: 'solo_propri', dopo: 'studio_lettura' },
      { campo: 'visibilita', prima: 'studio_lettura', dopo: 'solo_propri' },
    ])
  })

  it('un collaboratore non può cambiare la visibilità', async () => {
    const r = await come(db, A.c1, (tx) => tx.query(`update public.studi set visibilita = 'studio_completo' where id = $1`, [A.id]))
    expect(r.affectedRows).toBe(0)
  })
})

describe('accessi tra colleghi', () => {
  it('in sola lettura: A vede i clienti di B ma non li modifica; tolto l\'accesso non li vede più', async () => {
    const [idAccesso] = await come(db, A.admin, (tx) =>
      righe<{ id: string }>(tx, `select public.concedi_accesso_collega($1, $2, 'lettura') as id`, [A.c1.id, A.c2.id]))
    expect(await clientiVisti(A.c1)).toHaveLength(4)
    const diB = A.clienti.find((c) => c.referente === A.c2.id)!.id
    await expect(come(db, A.c1, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [diB]))).rejects.toThrow()

    // B vede chi ha accesso al suo spazio, C no
    const vistiDaB = await come(db, A.c2, (tx) => righe(tx, 'select * from public.accessi_colleghi'))
    expect(vistiDaB).toHaveLength(1)
    const vistiDaC = await come(db, A.c3, (tx) => righe(tx, 'select * from public.accessi_colleghi'))
    expect(vistiDaC).toHaveLength(0)

    await come(db, A.admin, (tx) => tx.query(`select public.revoca_accesso_collega($1)`, [idAccesso.id]))
    expect(await clientiVisti(A.c1)).toHaveLength(2)
    const log = await righe<{ azione: string }>(db, `select azione from public.registro_attivita where azione like 'accesso_%' order by creato_il`)
    expect(log.map((l) => l.azione)).toEqual(['accesso_concesso', 'accesso_revocato'])
  })

  it('con accesso completo A lavora sui clienti e sui compiti di B', async () => {
    await come(db, A.admin, (tx) => tx.query(`select public.concedi_accesso_collega($1, $2, 'completa')`, [A.c1.id, A.c2.id]))
    const diB = A.clienti.find((c) => c.referente === A.c2.id)!.id
    await come(db, A.c1, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [diB]))
    const compito = await come(db, A.admin, async (tx) =>
      (await righe<{ id: string }>(tx, `select public.crea_compito('Per B', '', $1, $2::uuid[], null, false, 'alta') as id`, [diB, [A.c2.id]]))[0].id)
    await come(db, A.c1, (tx) => tx.query(`select public.cambia_stato_compito($1, 'in_lavorazione')`, [compito]))
  })

  it('un utente disattivato perde gli accessi ricevuti', async () => {
    await come(db, A.admin, (tx) => tx.query(`select public.concedi_accesso_collega($1, $2, 'lettura')`, [A.c1.id, A.c2.id]))
    await come(db, A.admin, (tx) => tx.query(`select public.imposta_utente_attivo($1, false)`, [A.c1.id]))
    const n = await righe<{ n: number }>(db, 'select count(*)::int as n from public.accessi_colleghi')
    expect(n[0].n).toBe(0)
  })

  it('un collaboratore non concede accessi', async () => {
    await expect(come(db, A.c1, (tx) => tx.query(`select public.concedi_accesso_collega($1, $2, 'completa')`, [A.c1.id, A.c2.id]))).rejects.toThrow(/admin/)
  })
})

describe('azioni riservate agli admin', () => {
  const azioniAdmin: [string, (s: Studio) => [string, unknown[]]][] = [
    ['invitare', () => [`select public.crea_invito('nuovo@esempio.it', 'Nuovo', 'Utente', 'collaboratore', 'h1')`, []]],
    ['cambiare ruolo', (s) => [`select public.cambia_ruolo_utente($1, 'admin')`, [s.c1.id]]],
    ['disattivare utenti', (s) => [`select public.imposta_utente_attivo($1, false)`, [s.c2.id]]],
    ['assegnare clienti', (s) => [`select public.assegna_referente($1::uuid[], $2)`, [[s.clienti[2].id], s.c1.id]]],
    ['eliminare clienti', (s) => [`select public.elimina_clienti($1::uuid[])`, [[s.clienti[0].id]]]],
    ['creare clienti', (s) => [`insert into public.clienti (studio_id, ragione_sociale, nome_visualizzazione) values ($1, 'Nuovo', 'Nuovo')`, [s.id]]],
    ['creare agenti', () => [`select public.crea_agente('Bot', '', gen_random_uuid())`, []]],
  ]
  for (const [nome, azione] of azioniAdmin) {
    it(`un collaboratore non può ${nome}, nemmeno chiamando direttamente il database`, async () => {
      const [sql, params] = azione(A)
      await expect(come(db, A.c1, (tx) => tx.query(sql, params))).rejects.toThrow()
    })
  }

  it('un collaboratore non modifica l\'anagrafica di un cliente, nemmeno suo', async () => {
    const r = await come(db, A.c1, (tx) => tx.query(`update public.clienti set ragione_sociale = 'x' where id = $1`, [A.clienti[0].id]))
    expect(r.affectedRows).toBe(0)
  })

  it('un collaboratore non può cambiare il proprio ruolo aggiornando la tabella', async () => {
    await expect(come(db, A.c1, (tx) => tx.query(`update public.utenti set ruolo = 'admin' where id = $1`, [A.c1.id]))).rejects.toThrow(/permission denied/)
  })

  it('lo studio ha sempre almeno un admin attivo', async () => {
    await expect(come(db, A.admin, (tx) => tx.query(`select public.cambia_ruolo_utente($1, 'collaboratore')`, [A.admin.id]))).rejects.toThrow(/almeno un admin/)
    await expect(come(db, A.admin, (tx) => tx.query(`select public.imposta_utente_attivo($1, false)`, [A.admin.id]))).rejects.toThrow(/almeno un admin/)
    await come(db, A.admin, (tx) => tx.query(`select public.cambia_ruolo_utente($1, 'admin')`, [A.c1.id]))
    await come(db, A.admin, (tx) => tx.query(`select public.cambia_ruolo_utente($1, 'collaboratore')`, [A.admin.id]))
  })
})

describe('utenti disattivati', () => {
  it('un utente disattivato non accede più a nulla', async () => {
    await come(db, A.admin, (tx) => tx.query(`select public.imposta_utente_attivo($1, false)`, [A.c1.id]))
    await come(db, A.c1, async (tx) => {
      for (const t of ['clienti', 'compiti', 'comunicazioni', 'utenti', 'studi', 'notifiche']) {
        const r = await righe<{ n: number }>(tx, `select count(*)::int as n from public.${t}`)
        expect(r[0].n, t).toBe(0)
      }
    })
    await expect(come(db, A.c1, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [A.clienti[0].id]))).rejects.toThrow()
  })

  it('un admin disattivato non esegue azioni da admin', async () => {
    await come(db, A.admin, (tx) => tx.query(`select public.cambia_ruolo_utente($1, 'admin')`, [A.c1.id]))
    await come(db, A.c1, (tx) => tx.query(`select public.imposta_utente_attivo($1, false)`, [A.admin.id]))
    await expect(come(db, A.admin, (tx) => tx.query(`select public.crea_invito('x@esempio.it', 'X', 'Y', 'admin', 'hh')`))).rejects.toThrow()
  })
})

describe('registrazione e inviti', () => {
  it('registra_studio crea lo studio e rende admin chi si registra', async () => {
    const p = { id: crypto.randomUUID(), email: 'titolare@nuovostudio.it' }
    const [r] = await come(db, p, (tx) => righe<{ id: string }>(tx, `select public.registra_studio('Nuovo Studio', 'Anna', 'Bianchi') as id`))
    const u = await righe<{ ruolo: string; studio_id: string }>(db, 'select ruolo, studio_id from public.utenti where id = $1', [p.id])
    expect(u[0]).toEqual({ ruolo: 'admin', studio_id: r.id })
    await expect(come(db, p, (tx) => tx.query(`select public.registra_studio('Altro', 'Anna', 'Bianchi')`))).rejects.toThrow(/già/)
  })

  it("l'invito si accetta solo con l'indirizzo invitato, una volta sola", async () => {
    await come(db, A.admin, (tx) => tx.query(`select public.crea_invito('Nuova@Esempio.it', 'Nuova', 'Collega', 'collaboratore', $1)`, [hash('codice-1')]))
    const info = await righe<{ email: string; studio_nome: string; scaduto: boolean }>(db, `select * from public.info_invito($1)`, [hash('codice-1')])
    expect(info[0]).toMatchObject({ email: 'nuova@esempio.it', studio_nome: 'Studio A', scaduto: false })

    const altro = { id: crypto.randomUUID(), email: 'altro@esempio.it' }
    await expect(come(db, altro, (tx) => tx.query(`select public.accetta_invito($1)`, [hash('codice-1')]))).rejects.toThrow(/altro indirizzo/)

    const giusto = { id: crypto.randomUUID(), email: 'nuova@esempio.it' }
    await come(db, giusto, (tx) => tx.query(`select public.accetta_invito($1)`, [hash('codice-1')]))
    const u = await righe<{ ruolo: string; studio_id: string; nome: string }>(db, 'select ruolo, studio_id, nome from public.utenti where id = $1', [giusto.id])
    expect(u[0]).toEqual({ ruolo: 'collaboratore', studio_id: A.id, nome: 'Nuova' })
    await expect(come(db, giusto, (tx) => tx.query(`select public.accetta_invito($1)`, [hash('codice-1')]))).rejects.toThrow()
  })

  it('un invito scaduto non si accetta; rinviarlo dà un nuovo link valido 7 giorni', async () => {
    const [inv] = await come(db, A.admin, (tx) =>
      righe<{ id: string }>(tx, `select public.crea_invito('tardi@esempio.it', 'Tardi', '', 'collaboratore', $1) as id`, [hash('vecchio')]))
    await db.query(`update public.inviti set scade_il = now() - interval '1 day' where id = $1`, [inv.id])
    const p = { id: crypto.randomUUID(), email: 'tardi@esempio.it' }
    await expect(come(db, p, (tx) => tx.query(`select public.accetta_invito($1)`, [hash('vecchio')]))).rejects.toThrow(/scaduto/)
    await come(db, A.admin, (tx) => tx.query(`select public.rinnova_invito($1, $2)`, [inv.id, hash('nuovo')]))
    await expect(come(db, p, (tx) => tx.query(`select public.accetta_invito($1)`, [hash('vecchio')]))).rejects.toThrow()
    await come(db, p, (tx) => tx.query(`select public.accetta_invito($1)`, [hash('nuovo')]))
  })

  it('non si invita un indirizzo già usato in un altro studio', async () => {
    const B = await creaStudio(db, 'Studio B')
    await expect(
      come(db, A.admin, (tx) => tx.query(`select public.crea_invito($1, 'X', 'Y', 'collaboratore', 'h')`, [B.c1.email])),
    ).rejects.toThrow(/già un account/)
  })

  it("l'impronta del codice di invito non è leggibile dagli utenti", async () => {
    await expect(come(db, A.admin, (tx) => tx.query(`select codice_hash from public.inviti`))).rejects.toThrow(/permission denied/)
  })
})
