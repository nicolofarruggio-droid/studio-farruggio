// Clienti: indirizzi email nel registro, cestino ed eliminazione definitiva, titolari condivisi.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, nuovoDb, righe, type Studio } from './helpers'

let db: PGlite
let A: Studio

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
})

describe('clienti', () => {
  it('aggiungere e togliere un indirizzo email finisce nel registro attività', async () => {
    const cliente = A.clienti.find((c) => c.referente === A.c1.id)!.id
    await come(db, A.c1, async (tx) => {
      await tx.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo, tipo) values ($1, $2, 'amministrazione@cliente.it', 'ordinaria')`, [A.id, cliente])
      await tx.query(`delete from public.clienti_email where cliente_id = $1`, [cliente])
    })
    const log = await righe<{ azione: string; attore_id: string; dettagli: { indirizzo: string } }>(db,
      `select azione, attore_id, dettagli from public.registro_attivita where entita_id = $1 order by creato_il`, [cliente])
    expect(log.map((l) => l.azione)).toEqual(['email_cliente_aggiunta', 'email_cliente_rimossa'])
    expect(log[0].attore_id).toBe(A.c1.id)
    expect(log[0].dettagli.indirizzo).toBe('amministrazione@cliente.it')
  })

  it("un indirizzo non valido o con maiuscole viene rifiutato dal database", async () => {
    await expect(come(db, A.admin, (tx) => tx.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'Non Valido')`, [A.id, A.clienti[0].id]))).rejects.toThrow()
    await expect(come(db, A.admin, (tx) => tx.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'Maiuscole@X.it')`, [A.id, A.clienti[0].id]))).rejects.toThrow()
  })

  it("l'eliminazione definitiva vale solo dal cestino, solo per gli admin, e restituisce i file da cancellare", async () => {
    const cliente = A.clienti[0].id
    const compito = await creaCompito(db, A.admin, A.c1.id, cliente)
    const id = crypto.randomUUID()
    await come(db, A.c1, (tx) => tx.query(`select public.registra_documento($1, $2, 'a.pdf', 'application/pdf', 10, $3)`, [compito, id, `${A.id}/compiti/${compito}/${id}`]))
    await expect(come(db, A.admin, (tx) => tx.query('select public.elimina_cliente_definitivo($1)', [cliente]))).rejects.toThrow(/cestino/)
    await come(db, A.admin, (tx) => tx.query('select public.elimina_clienti($1::uuid[])', [[cliente]]))
    await expect(come(db, A.c1, (tx) => tx.query('select public.elimina_cliente_definitivo($1)', [cliente]))).rejects.toThrow(/admin/)
    const percorsi = await come(db, A.admin, (tx) => righe<{ p: string }>(tx, 'select public.elimina_cliente_definitivo($1) as p', [cliente]))
    expect(percorsi.map((r) => r.p)).toEqual([`${A.id}/compiti/${compito}/${id}`])
    const resto = await righe<{ n: number }>(db, 'select (select count(*) from public.clienti where id = $1)::int + (select count(*) from public.compiti where id = $2)::int as n', [cliente, compito])
    expect(resto[0].n).toBe(0)
  })

  it('la pulizia automatica del cestino non è eseguibile dagli utenti', async () => {
    await expect(come(db, A.admin, (tx) => tx.query('select * from public.svuota_cestino_scaduto(0)'))).rejects.toThrow(/permission denied/)
    await come(db, A.admin, (tx) => tx.query('select public.elimina_clienti($1::uuid[])', [[A.clienti[1].id]]))
    await db.query(`update public.clienti set eliminato_il = now() - interval '31 days' where id = $1`, [A.clienti[1].id])
    await db.query('select * from public.svuota_cestino_scaduto(30)')
    expect(await righe(db, 'select id from public.clienti where id = $1', [A.clienti[1].id])).toHaveLength(0)
  })

  it('segnala i clienti con lo stesso titolare, solo tra quelli visibili', async () => {
    const [x, y, z] = [A.clienti[0], A.clienti[2], A.clienti[4]]
    await come(db, A.admin, async (tx) => {
      for (const c of [x, y, z])
        await tx.query(`insert into public.clienti_titolari (studio_id, cliente_id, nome, cognome, principale) values ($1, $2, 'Enzo', 'D''Agosta', true)`, [A.id, c.id])
    })
    const perAdmin = await come(db, A.admin, (tx) => righe<{ id: string }>(tx, 'select * from public.clienti_stesso_titolare($1)', [x.id]))
    expect(perAdmin.map((r) => r.id).sort()).toEqual([y.id, z.id].sort())
    const perC1 = await come(db, A.c1, (tx) => righe<{ id: string }>(tx, 'select * from public.clienti_stesso_titolare($1)', [x.id]))
    expect(perC1).toHaveLength(0)
  })
})
