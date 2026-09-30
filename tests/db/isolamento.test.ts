// Isolamento tra studi (sezione 4): uno studio non legge, modifica o cancella nulla di un altro.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, nuovoDb, righe, type Studio } from './helpers'

let db: PGlite
let A: Studio
let B: Studio
let compitoB: string

const tabelle = [
  'studi', 'utenti', 'clienti', 'clienti_titolari', 'clienti_email', 'assegnazioni', 'aggiornamenti_contabili',
  'aggiornamenti_storico', 'comunicazioni', 'compiti', 'compiti_assegnatari', 'compiti_documenti', 'compiti_commenti',
  'compiti_eventi', 'notifiche', 'registro_attivita', 'inviti', 'accessi_colleghi', 'caselle_email', 'controlli_email',
  'email_elaborate', 'ai_richieste', 'proposte_agente',
]

beforeAll(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
  // dati in B: indicatori, email, compito con commento e documento, notifiche
  await come(db, B.admin, async (tx) => {
    await tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [B.clienti[0].id])
    await tx.query(`insert into public.clienti_email (studio_id, cliente_id, indirizzo) values ($1, $2, 'cliente@b.it')`, [B.id, B.clienti[0].id])
    await tx.query(`insert into public.clienti_titolari (studio_id, cliente_id, nome, cognome, principale) values ($1, $2, 'Mario', 'Rossi', true)`, [B.id, B.clienti[0].id])
  })
  compitoB = await creaCompito(db, B.admin, B.c1.id, B.clienti[0].id)
  await come(db, B.c1, async (tx) => {
    await tx.query(`select public.aggiungi_commento($1, 'Commento in B')`, [compitoB])
    const idDoc = crypto.randomUUID()
    await tx.query(`select public.registra_documento($1, $2, 'contratto.pdf', 'application/pdf', 1000, $3)`, [
      compitoB, idDoc, `${B.id}/compiti/${compitoB}/${idDoc}`,
    ])
  })
})

describe('isolamento tra studi', () => {
  it("l'admin dello studio A non legge nessuna riga dello studio B", async () => {
    await come(db, A.admin, async (tx) => {
      for (const t of tabelle) {
        const colonna = t === 'studi' ? 'id' : 'studio_id'
        const r = await righe<{ n: number }>(tx, `select count(*)::int as n from public.${t} where ${colonna} = $1`, [B.id])
        expect(r[0].n, `tabella ${t}`).toBe(0)
      }
    })
  })

  it('un collaboratore di A con visibilità su tutto lo studio non vede comunque B', async () => {
    await db.query(`update public.studi set visibilita = 'studio_completo' where id = $1`, [A.id])
    try {
      await come(db, A.c1, async (tx) => {
        for (const t of ['clienti', 'compiti', 'comunicazioni', 'utenti', 'compiti_documenti']) {
          const r = await righe<{ n: number }>(tx, `select count(*)::int as n from public.${t} where studio_id = $1`, [B.id])
          expect(r[0].n, `tabella ${t}`).toBe(0)
        }
      })
    } finally {
      await db.query(`update public.studi set visibilita = 'solo_propri' where id = $1`, [A.id])
    }
  })

  it("l'admin di A non modifica né cancella righe di B", async () => {
    await come(db, A.admin, async (tx) => {
      const r = await tx.query(`update public.clienti set note = 'hack' where studio_id = $1`, [B.id])
      expect(r.affectedRows).toBe(0)
      const s = await tx.query(`update public.studi set nome = 'hack' where id = $1`, [B.id])
      expect(s.affectedRows).toBe(0)
      const d = await tx.query(`delete from public.clienti_email where studio_id = $1`, [B.id])
      expect(d.affectedRows).toBe(0)
    })
    const n = await righe<{ note: string | null }>(db, `select note from public.clienti where id = $1`, [B.clienti[0].id])
    expect(n[0].note).toBeNull()
  })

  it("l'admin di A non inserisce righe nello studio B", async () => {
    await expect(
      come(db, A.admin, (tx) =>
        tx.query(`insert into public.clienti (studio_id, ragione_sociale, nome_visualizzazione) values ($1, 'X', 'X')`, [B.id]),
      ),
    ).rejects.toThrow()
    await expect(
      come(db, A.admin, (tx) =>
        tx.query(`insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id)
                  values ($1, $2, now(), 'altro', 'x', 'manuale', $3)`, [B.id, B.clienti[0].id, A.admin.id]),
      ),
    ).rejects.toThrow()
  })

  it("le funzioni non agiscono su dati di un altro studio", async () => {
    await expect(come(db, A.admin, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-01-31')`, [B.clienti[1].id]))).rejects.toThrow()
    await expect(come(db, A.admin, (tx) => tx.query(`select public.cambia_stato_compito($1, 'completato')`, [compitoB]))).rejects.toThrow()
    await expect(come(db, A.admin, (tx) => tx.query(`select public.aggiungi_commento($1, 'x')`, [compitoB]))).rejects.toThrow()
    await expect(come(db, A.admin, (tx) => tx.query(`select public.assegna_referente($1::uuid[], $2)`, [[B.clienti[0].id], A.c1.id]))).rejects.toThrow()
    await expect(come(db, A.admin, (tx) => tx.query(`select public.assegna_referente($1::uuid[], $2)`, [[A.clienti[0].id], B.c1.id]))).rejects.toThrow()
    await expect(
      come(db, A.admin, (tx) => tx.query(`select public.crea_compito('x', '', $1, $2::uuid[], null, false, 'normale')`, [null, [B.c1.id]])),
    ).rejects.toThrow()
    await expect(
      come(db, A.admin, (tx) => tx.query(`select public.crea_compito('x', '', $1, $2::uuid[], null, false, 'normale')`, [B.clienti[0].id, [A.c1.id]])),
    ).rejects.toThrow()
    const n = await come(db, A.admin, (tx) => righe<{ n: number }>(tx, `select public.elimina_clienti($1::uuid[]) as n`, [[B.clienti[0].id]]))
    expect(n[0].n).toBe(0)
  })

  it('i token delle caselle email non sono leggibili da nessun utente', async () => {
    await expect(come(db, A.admin, (tx) => tx.query(`select * from public.caselle_email_token`))).rejects.toThrow(/permission denied/)
  })

  it('anon non legge nulla', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query('select * from public.clienti')
      }),
    ).rejects.toThrow(/permission denied/)
  })
})
