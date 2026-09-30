// Isolamento dei file (sezione 4): lo spazio file non si usa mai direttamente con le credenziali di un utente.
// Il server controlla i permessi e crea link firmati (lettura e caricamento); nello spazio file non esiste
// alcuna policy per gli utenti, quindi nessun accesso incrociato è possibile nemmeno con la Data API.
// Supabase Storage è imitato in supabase-mock.sql.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, diretto, nuovoDb, righe, type Persona, type Studio } from './helpers'

let db: PGlite
let A: Studio
let B: Studio
let compitoA: string

const percorso = (s: Studio, compito: string) => `${s.id}/compiti/${compito}/${crypto.randomUUID()}`

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
  compitoA = await creaCompito(db, A.admin, A.c1.id, null)
})

describe('spazio file dei documenti', () => {
  it('il bucket esiste ed è privato', async () => {
    const b = await righe<{ public: boolean }>(db, `select public from storage.buckets where id = 'documenti'`)
    expect(b[0].public).toBe(false)
  })

  it('nessuna policy per gli utenti sullo spazio file', async () => {
    const p = await righe(db, `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'`)
    expect(p).toEqual([])
  })

  const modi: [string, (db: PGlite, p: Persona, fn: Parameters<typeof come>[2]) => Promise<unknown>][] = [
    ['dal server', come],
    ['direttamente', diretto],
  ]
  for (const [nome, modo] of modi) {
    it(`un utente non carica, non legge e non cancella file ${nome}`, async () => {
      // file caricato dal server (link firmato) nel compito del collaboratore
      const nomeFile = percorso(A, compitoA)
      await db.query(`insert into storage.objects (bucket_id, name) values ('documenti', $1)`, [nomeFile])
      await db.query(`insert into storage.objects (bucket_id, name) values ('documenti', $1)`, [percorso(B, compitoA)])
      for (const p of [A.admin, A.c1, B.admin]) {
        await expect(
          modo(db, p, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documenti', $1)`, [percorso(A, compitoA)])),
        ).rejects.toThrow()
        expect(await modo(db, p, (tx) => righe(tx, 'select name from storage.objects'))).toHaveLength(0)
        const d = await modo(db, p, (tx) => tx.query('delete from storage.objects where name = $1', [nomeFile]))
        expect((d as { affectedRows?: number }).affectedRows).toBe(0)
      }
      expect(await righe(db, 'select name from storage.objects')).toHaveLength(2)
    })
  }
})

describe('conversione sicura dei percorsi', () => {
  it('un pezzo di percorso non valido diventa null, non un errore', async () => {
    const r = await righe<{ a: string | null; b: string | null }>(db, `select public.testo_a_uuid('non-un-uuid') as a, public.testo_a_uuid($1) as b`, [compitoA])
    expect(r[0]).toEqual({ a: null, b: compitoA })
  })
})
