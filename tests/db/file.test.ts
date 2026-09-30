// Isolamento dei file (sezione 4): le policy dello spazio file impediscono l'accesso incrociato tra studi,
// anche se il codice applicativo sbagliasse. Supabase Storage è imitato in supabase-mock.sql.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, nuovoDb, righe, type Persona, type Studio } from './helpers'

let db: PGlite
let A: Studio
let B: Studio
let compitoA: string
let compitoB: string

const percorso = (s: Studio, compito: string) => `${s.id}/compiti/${compito}/${crypto.randomUUID()}`
const inserisci = (p: Persona, nome: string) =>
  come(db, p, (tx) => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('documenti', $1, $2)`, [nome, p.id]))

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
  compitoA = await creaCompito(db, A.admin, A.c1.id, null)
  compitoB = await creaCompito(db, B.admin, B.c1.id, null)
})

describe('spazio file dei documenti', () => {
  it('il bucket esiste ed è privato', async () => {
    const b = await righe<{ public: boolean; file_size_limit: string }>(db, `select public, file_size_limit::text from storage.buckets where id = 'documenti'`)
    expect(b[0].public).toBe(false)
  })

  it('un utente carica solo nei compiti del proprio studio su cui può lavorare', async () => {
    await inserisci(A.c1, percorso(A, compitoA))
    await expect(inserisci(A.admin, percorso(B, compitoB))).rejects.toThrow()
    // percorso con lo studio sbagliato ma il compito giusto
    await expect(inserisci(A.c1, `${B.id}/compiti/${compitoA}/${crypto.randomUUID()}`)).rejects.toThrow()
    // un collega senza accesso al compito
    await expect(inserisci(A.c2, percorso(A, compitoA))).rejects.toThrow()
  })

  it('nessuno legge i file di un altro studio, né dei compiti che non vede', async () => {
    const nomeB = percorso(B, compitoB)
    await inserisci(B.c1, nomeB)
    const nomeA = percorso(A, compitoA)
    await inserisci(A.c1, nomeA)
    const vistiDaAdminA = await come(db, A.admin, (tx) => righe<{ name: string }>(tx, 'select name from storage.objects'))
    expect(vistiDaAdminA.map((r) => r.name)).toEqual([nomeA])
    expect(await come(db, A.c2, (tx) => righe(tx, 'select name from storage.objects'))).toHaveLength(0)
    expect(await come(db, B.c1, (tx) => righe<{ name: string }>(tx, 'select name from storage.objects'))).toEqual([{ name: nomeB }])
  })

  it('nessuno modifica o cancella i file (nemmeno i propri)', async () => {
    const nome = percorso(A, compitoA)
    await inserisci(A.c1, nome)
    for (const p of [A.c1, A.admin]) {
      const d = await come(db, p, (tx) => tx.query('delete from storage.objects where name = $1', [nome]))
      expect(d.affectedRows).toBe(0)
      const u = await come(db, p, (tx) => tx.query(`update storage.objects set name = 'altro' where name = $1`, [nome]))
      expect(u.affectedRows).toBe(0)
    }
  })
})

describe('percorsi malformati', () => {
  it('un file con un percorso non valido non blocca la lettura degli altri', async () => {
    await db.query(`insert into storage.buckets (id, name) values ('altro', 'altro') on conflict do nothing`)
    await db.query(`insert into storage.objects (bucket_id, name) values ('altro', 'cartella/non-un-uuid/file.txt')`)
    const nome = percorso(A, compitoA)
    await inserisci(A.c1, nome)
    const visti = await come(db, A.c1, (tx) => righe<{ name: string }>(tx, 'select name from storage.objects'))
    expect(visti.map((r) => r.name)).toEqual([nome])
  })
})
